import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import {
  avatarKeysForUser,
  isAllowedImageKeyForUser,
  normalizeR2Key,
} from "../utils/r2Keys";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const endpoint =
  process.env.R2_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

const s3Client =
  accountId && accessKeyId && secretAccessKey && bucketName && endpoint
    ? new S3Client({
        region: "auto",
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      })
    : null;

const supabaseAuthClient =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

async function requireUser(request: Request) {
  if (!supabaseAuthClient) {
    return {
      response: jsonResponse({ error: "Supabase configuration is missing" }, 500),
    };
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { response: jsonResponse({ error: "Authentication required" }, 401) };
  }

  // Supabase docs: auth.getUser(jwt) performs a network validation and is
  // suitable for server-side authorization decisions.
  // https://supabase.com/docs/reference/javascript/auth-getuser
  const {
    data: { user },
    error,
  } = await supabaseAuthClient.auth.getUser(token);

  if (error || !user) {
    return { response: jsonResponse({ error: "Invalid session" }, 401) };
  }

  return { user };
}

function requireR2() {
  if (!s3Client || !bucketName) {
    return jsonResponse({ error: "R2 configuration is missing" }, 500);
  }
  return null;
}

async function getExistingAvatarUrl(userId: string): Promise<string | null> {
  if (!s3Client || !bucketName) return null;

  for (const key of avatarKeysForUser(userId)) {
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );

      return getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
        { expiresIn: 3600 * 24 * 7 }
      );
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return null;
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

// Vercel Functions can be declared as api/*.ts HTTP handlers.
// https://vercel.com/docs/functions
export async function POST(request: Request) {
  const authResult = await requireUser(request);
  if ("response" in authResult) return authResult.response;

  const r2Error = requireR2();
  if (r2Error) return r2Error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = body?.action;
  const userId = authResult.user.id;

  try {
    if (action === "createUploadUrl") {
      const key = normalizeR2Key(String(body.key || ""), bucketName);
      const contentType = String(body.contentType || "image/jpeg");

      if (!contentType.startsWith("image/")) {
        return jsonResponse({ error: "Only image uploads are allowed" }, 400);
      }
      if (!isAllowedImageKeyForUser(key, userId)) {
        return jsonResponse({ error: "R2 key is not allowed" }, 403);
      }

      const uploadUrl = await getSignedUrl(
        s3Client!,
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn: 60 * 5 }
      );

      return jsonResponse({ key, uploadUrl });
    }

    if (action === "getDownloadUrl") {
      const key = normalizeR2Key(String(body.key || ""), bucketName);
      if (!isAllowedImageKeyForUser(key, userId)) {
        return jsonResponse({ error: "R2 key is not allowed" }, 403);
      }

      const url = await getSignedUrl(
        s3Client!,
        new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
        { expiresIn: 3600 * 24 * 7 }
      );

      return jsonResponse({ url });
    }

    if (action === "deleteObject") {
      const key = normalizeR2Key(String(body.key || ""), bucketName);
      if (!isAllowedImageKeyForUser(key, userId)) {
        return jsonResponse({ error: "R2 key is not allowed" }, 403);
      }

      await s3Client!.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );

      return jsonResponse({ ok: true });
    }

    if (action === "findAvatar") {
      const url = await getExistingAvatarUrl(userId);
      return jsonResponse({ url });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("R2 API error:", error);
    return jsonResponse({ error: "R2 operation failed" }, 500);
  }
}
