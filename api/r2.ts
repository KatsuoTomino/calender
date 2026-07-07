import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { assertAllowedR2Key, assertSafeKeySegment, getSafeImageExtension } from "../utils/r2Keys";

type JsonRecord = Record<string, unknown>;

let cachedS3Client: S3Client | null = null;

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function getBucketName(): string {
  return getEnv("R2_BUCKET_NAME");
}

function getS3Client(): S3Client {
  if (cachedS3Client) {
    return cachedS3Client;
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!endpoint) {
    throw new Error("R2 endpoint is not configured");
  }

  cachedS3Client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: getEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  return cachedS3Client;
}

async function authenticate(request: Request): Promise<User> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    throw new Error("Unauthorized");
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase auth configuration is missing");
  }

  // Supabase docs: auth.getUser(jwt) validates the JWT with the Auth server before authorization decisions.
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Unauthorized");
  }

  return data.user;
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "type" in value &&
    "size" in value
  );
}

function ensureImageFile(value: FormDataEntryValue | null): File {
  if (!isUploadFile(value)) {
    throw new Error("Image file is required");
  }

  if (!value.type.startsWith("image/")) {
    throw new Error("Only image uploads are allowed");
  }

  if (value.size > 10 * 1024 * 1024) {
    throw new Error("Image file is too large");
  }

  return value;
}

async function putObject(key: string, file: File): Promise<void> {
  const body = new Uint8Array(await file.arrayBuffer());
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: file.type || "image/jpeg",
    })
  );
}

async function getObjectUrl(key: string): Promise<string> {
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
    { expiresIn: 3600 * 24 * 7 }
  );
}

async function deleteObject(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  );
}

async function findAvatarUrl(userId: string): Promise<string | null> {
  const extensions = ["jpg", "jpeg", "png", "webp", "gif"];

  for (const extension of extensions) {
    const key = `users/${userId}/avatar.${extension}`;

    try {
      await getS3Client().send(
        new HeadObjectCommand({
          Bucket: getBucketName(),
          Key: key,
        })
      );

      return getObjectUrl(key);
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        continue;
      }

      throw error;
    }
  }

  return null;
}

async function handleMultipart(formData: FormData, user: User): Promise<Response> {
  const action = String(formData.get("action") || "");
  const file = ensureImageFile(formData.get("file"));
  const extension = getSafeImageExtension(file.name, file.type);

  if (action === "uploadImage") {
    const todoId = assertSafeKeySegment(String(formData.get("todoId") || ""), "todoId");
    const key = `todos/${todoId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    await putObject(key, file);
    return jsonResponse({ key });
  }

  if (action === "uploadAvatar") {
    const userId = assertSafeKeySegment(user.id, "userId");
    const key = `users/${userId}/avatar.${extension}`;
    await putObject(key, file);
    return jsonResponse({ key });
  }

  return jsonResponse({ error: "Unsupported multipart action" }, 400);
}

async function handleJson(body: JsonRecord, user: User): Promise<Response> {
  const action = String(body.action || "");
  const bucketName = getBucketName();

  if (action === "getUrl") {
    const key = assertAllowedR2Key(String(body.key || ""), bucketName);
    return jsonResponse({ url: await getObjectUrl(key) });
  }

  if (action === "delete") {
    const key = assertAllowedR2Key(String(body.key || ""), bucketName);

    if (key.startsWith("users/") && !key.startsWith(`users/${user.id}/`)) {
      return jsonResponse({ error: "Cannot delete another user's avatar" }, 403);
    }

    await deleteObject(key);
    return jsonResponse({ ok: true });
  }

  if (action === "getAvatar") {
    const userId = assertSafeKeySegment(String(body.userId || user.id), "userId");

    if (userId !== user.id) {
      return jsonResponse({ error: "Cannot read another user's avatar" }, 403);
    }

    return jsonResponse({ url: await findAvatarUrl(userId) });
  }

  return jsonResponse({ error: "Unsupported action" }, 400);
}

// Vercel Functions docs recommend the Web Request signature for /api functions.
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const user = await authenticate(request);
      const contentType = request.headers.get("content-type") || "";

      if (contentType.includes("multipart/form-data")) {
        return handleMultipart(await request.formData(), user);
      }

      return handleJson((await request.json()) as JsonRecord, user);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = message === "Unauthorized" ? 401 : 400;
      console.error("R2 API error:", error);
      return jsonResponse({ error: message }, status);
    }
  },
};

