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
  avatarCandidateKeys,
  buildAvatarKey,
  buildTodoImageKey,
  extractR2Key,
  isAllowedR2Key,
  isSafeR2Segment,
  isUserAvatarKey,
} from "../utils/r2Keys";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const endpoint =
  process.env.R2_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const r2Client =
  endpoint && accessKeyId && secretAccessKey
    ? new S3Client({
        region: "auto",
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      })
    : null;

type AuthenticatedUser = {
  id: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

async function authenticate(request: Request): Promise<AuthenticatedUser | Response> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Supabase server configuration is missing" }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return jsonResponse({ error: "Authentication is required" }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return jsonResponse({ error: "Invalid authentication token" }, 401);
  }

  return { id: user.id };
}

function assertR2Configured(): Response | null {
  if (!r2Client || !bucketName) {
    return jsonResponse({ error: "R2 server configuration is missing" }, 500);
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const user = await authenticate(request);
  if (user instanceof Response) return user;

  const configError = assertR2Configured();
  if (configError) return configError;

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "get-url") {
    const rawKey = url.searchParams.get("key") || "";
    const key = extractR2Key(rawKey, bucketName);
    if (!key) {
      return jsonResponse({ error: "Invalid image key" }, 400);
    }

    const signedUrl = await getSignedUrl(
      r2Client!,
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
      { expiresIn: 3600 * 24 * 7 }
    );

    return jsonResponse({ url: signedUrl });
  }

  if (action === "get-avatar") {
    const requestedUserId = url.searchParams.get("userId");
    if (requestedUserId && requestedUserId !== user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    for (const key of avatarCandidateKeys(user.id)) {
      try {
        await r2Client!.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
        const signedUrl = await getSignedUrl(
          r2Client!,
          new GetObjectCommand({ Bucket: bucketName, Key: key }),
          { expiresIn: 3600 * 24 * 7 }
        );
        return jsonResponse({ url: signedUrl, key });
      } catch (error: any) {
        if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
          continue;
        }
        console.warn("Avatar lookup failed:", error);
      }
    }

    return jsonResponse({ url: null, key: null });
  }

  return jsonResponse({ error: "Unsupported action" }, 400);
}

export async function POST(request: Request): Promise<Response> {
  const user = await authenticate(request);
  if (user instanceof Response) return user;

  const configError = assertR2Configured();
  if (configError) return configError;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    return handleMultipartAction(request, user);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== "string") {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  if (body.action === "delete") {
    const key = extractR2Key(String(body.key || ""), bucketName);
    if (!key) {
      return jsonResponse({ error: "Invalid image key" }, 400);
    }
    if (key.startsWith("users/") && !isUserAvatarKey(key, user.id)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    await r2Client!.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: "Unsupported action" }, 400);
}

async function handleMultipartAction(
  request: Request,
  user: AuthenticatedUser
): Promise<Response> {
  const formData = await request.formData();
  const action = String(formData.get("action") || "");
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonResponse({ error: "Image file is required" }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return jsonResponse({ error: "Only image files are allowed" }, 400);
  }

  let key: string;
  if (action === "upload-avatar") {
    key = buildAvatarKey(user.id, file.name);
  } else if (action === "upload-image") {
    const todoId = String(formData.get("todoId") || "");
    if (!isSafeR2Segment(todoId)) {
      return jsonResponse({ error: "Invalid todo id" }, 400);
    }
    key = buildTodoImageKey(todoId, file.name, `${Date.now()}-${crypto.randomUUID()}`);
  } else {
    return jsonResponse({ error: "Unsupported action" }, 400);
  }

  if (!isAllowedR2Key(key)) {
    return jsonResponse({ error: "Invalid image key" }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  await r2Client!.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: new Uint8Array(arrayBuffer),
      ContentType: file.type || "application/octet-stream",
    })
  );

  return jsonResponse({ key });
}
