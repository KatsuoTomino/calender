import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { normalizeR2Key } from "../utils/r2Keys";

type R2Action = "getUploadUrl" | "getDownloadUrl" | "deleteObject" | "getAvatar";

interface R2RequestBody {
  action?: R2Action;
  key?: string;
  contentType?: string;
}

const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    throw new Error("R2 server environment is incomplete");
  }

  return { accessKeyId, secretAccessKey, bucketName, endpoint };
}

function createS3Client(config: ReturnType<typeof getR2Config>): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase server environment is incomplete");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function assertAllowedKeyForUser(key: string, userId: string): boolean {
  return !key.startsWith("users/") || key.startsWith(`users/${userId}/`);
}

export async function POST(request: Request): Promise<Response> {
  let body: R2RequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  let user;
  try {
    user = await getAuthenticatedUser(request);
  } catch (error) {
    console.error("R2 auth configuration error:", error);
    return jsonResponse(500, { error: "Authentication is not configured" });
  }

  if (!user) {
    return jsonResponse(401, { error: "Authentication required" });
  }

  let config: ReturnType<typeof getR2Config>;
  try {
    config = getR2Config();
  } catch (error) {
    console.error("R2 configuration error:", error);
    return jsonResponse(500, { error: "R2 is not configured" });
  }

  const s3Client = createS3Client(config);

  try {
    if (body.action === "getAvatar") {
      for (const ext of AVATAR_EXTENSIONS) {
        const key = `users/${user.id}/avatar.${ext}`;
        try {
          await s3Client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key }));
          const url = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
            { expiresIn: 3600 * 24 * 7 }
          );
          return jsonResponse(200, { url, key });
        } catch (error: any) {
          if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
            continue;
          }
          console.warn("Avatar lookup error:", key, error?.message);
        }
      }
      return jsonResponse(200, { url: null });
    }

    const key = normalizeR2Key(body.key || "", config.bucketName);
    if (!key || !assertAllowedKeyForUser(key, user.id)) {
      return jsonResponse(400, { error: "Invalid R2 key" });
    }

    if (body.action === "getUploadUrl") {
      const url = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          ContentType: body.contentType || "application/octet-stream",
        }),
        { expiresIn: 900 }
      );
      return jsonResponse(200, { url, key });
    }

    if (body.action === "getDownloadUrl") {
      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
        { expiresIn: 3600 * 24 * 7 }
      );
      return jsonResponse(200, { url, key });
    }

    if (body.action === "deleteObject") {
      await s3Client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
      return jsonResponse(200, { deleted: true });
    }

    return jsonResponse(400, { error: "Unsupported action" });
  } catch (error) {
    console.error("R2 operation error:", error);
    return jsonResponse(502, { error: "R2 operation failed" });
  }
}
