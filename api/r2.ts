import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_TODO_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

interface AuthUser {
  id: string;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function requireEnv(name: string, fallbackName?: string): string {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new HttpError(500, `${name} is not configured`);
  }
  return value;
}

function getR2Config(): R2Config {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const endpoint =
    process.env.R2_ENDPOINT ||
    `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    accountId,
    endpoint,
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucketName: requireEnv("R2_BUCKET_NAME"),
  };
}

function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function requireUser(request: Request): Promise<AuthUser> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    throw new HttpError(401, "Authentication required");
  }

  const supabaseUrl = requireEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, "Invalid session");
  }

  return { id: data.user.id };
}

function parseObjectKey(input: string, config: R2Config): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new HttpError(400, "Object key is required");
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    let key = url.pathname.replace(/^\/+/, "");
    if (key.startsWith(`${config.bucketName}/`)) {
      key = key.slice(config.bucketName.length + 1);
    }
    return key;
  }

  return trimmed.replace(/^\/+/, "");
}

function assertAllowedKey(key: string, userId: string): void {
  if (key.startsWith("todos/") || key.startsWith(`users/${userId}/avatar.`)) {
    return;
  }

  throw new HttpError(403, "Object key is outside the allowed prefix");
}

function assertSafeSegment(value: string, label: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new HttpError(400, `${label} contains invalid characters`);
  }
}

function getImageExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (extension && IMAGE_EXTENSIONS.has(extension)) {
    return extension;
  }

  const fromType = file.type.split("/")[1]?.toLowerCase();
  if (fromType && IMAGE_EXTENSIONS.has(fromType)) {
    return fromType === "jpeg" ? "jpg" : fromType;
  }

  return "jpg";
}

function requireImageFile(value: FormDataEntryValue | null, maxBytes: number): File {
  if (!(value instanceof File)) {
    throw new HttpError(400, "Image file is required");
  }

  if (!value.type.startsWith("image/")) {
    throw new HttpError(400, "Only image files are allowed");
  }

  if (value.size > maxBytes) {
    throw new HttpError(413, "Image file is too large");
  }

  return value;
}

async function putImage(
  client: S3Client,
  config: R2Config,
  key: string,
  file: File
): Promise<void> {
  const body = new Uint8Array(await file.arrayBuffer());
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: file.type || "image/jpeg",
    })
  );
}

async function uploadTodoImage(
  request: Request,
  client: S3Client,
  config: R2Config
): Promise<Response> {
  const formData = await request.formData();
  const todoId = String(formData.get("todoId") || "");
  assertSafeSegment(todoId, "todoId");

  const file = requireImageFile(formData.get("file"), MAX_TODO_IMAGE_BYTES);
  const extension = getImageExtension(file);
  const key = `todos/${todoId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  await putImage(client, config, key, file);
  return jsonResponse({ key });
}

async function uploadAvatar(
  request: Request,
  user: AuthUser,
  client: S3Client,
  config: R2Config
): Promise<Response> {
  const formData = await request.formData();
  const file = requireImageFile(formData.get("file"), MAX_AVATAR_BYTES);
  const extension = getImageExtension(file);
  const key = `users/${user.id}/avatar.${extension}`;

  await putImage(client, config, key, file);
  return jsonResponse({ key });
}

async function getImageUrl(
  request: Request,
  user: AuthUser,
  client: S3Client,
  config: R2Config
): Promise<Response> {
  const url = new URL(request.url);
  const rawKey = url.searchParams.get("key") || "";
  const key = parseObjectKey(rawKey, config);
  assertAllowedKey(key, user.id);

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
    { expiresIn: 3600 * 24 * 7 }
  );

  return jsonResponse({ url: signedUrl });
}

async function getAvatarUrl(user: AuthUser, client: S3Client, config: R2Config): Promise<Response> {
  for (const extension of IMAGE_EXTENSIONS) {
    const key = `users/${user.id}/avatar.${extension}`;
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        })
      );

      const signedUrl = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        }),
        { expiresIn: 3600 * 24 * 7 }
      );
      return jsonResponse({ url: signedUrl });
    } catch (error: any) {
      if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return jsonResponse({ url: null });
}

async function deleteImage(
  request: Request,
  user: AuthUser,
  client: S3Client,
  config: R2Config
): Promise<Response> {
  const { key: rawKey } = await request.json();
  const key = parseObjectKey(String(rawKey || ""), config);
  assertAllowedKey(key, user.id);

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
  );

  return jsonResponse({ success: true });
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const user = await requireUser(request);
  const config = getR2Config();
  const client = createR2Client(config);
  const action = new URL(request.url).searchParams.get("action");

  if (request.method === "POST" && action === "upload-image") {
    return uploadTodoImage(request, client, config);
  }
  if (request.method === "POST" && action === "upload-avatar") {
    return uploadAvatar(request, user, client, config);
  }
  if (request.method === "GET" && action === "image-url") {
    return getImageUrl(request, user, client, config);
  }
  if (request.method === "GET" && action === "avatar") {
    return getAvatarUrl(user, client, config);
  }
  if (request.method === "POST" && action === "delete") {
    return deleteImage(request, user, client, config);
  }

  throw new HttpError(404, "Unknown R2 action");
}

// Vercel Functions use Web Handlers. Keep R2 secrets server-side because Vite
// exposes VITE_* variables to browser bundles: https://vite.dev/guide/env-and-mode
export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await handleRequest(request);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, error.status);
      }
      console.error("R2 API error:", error);
      return jsonResponse({ error: "Unexpected R2 API error" }, 500);
    }
  },
};
