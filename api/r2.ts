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
  buildAvatarKey,
  buildTodoImageKey,
  getAvatarKeys,
  isAllowedR2Key,
  isOwnAvatarKey,
  normalizeR2Key,
} from "../utils/r2Keys";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const TODO_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PRESIGNED_URL_TTL_SECONDS = 3600 * 24 * 7;

type JsonRecord = Record<string, unknown>;

interface R2Config {
  bucketName: string;
  client: S3Client;
}

let cachedConfig: R2Config | null = null;

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getR2Config(): R2Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    throw new Error("R2 server environment variables are not configured");
  }

  cachedConfig = {
    bucketName,
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };

  return cachedConfig;
}

async function authenticate(request: Request): Promise<{ userId: string } | Response> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Supabase server environment variables are not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Supabase documents getUser(jwt) as a network-verified user lookup:
  // https://supabase.com/docs/reference/javascript/auth-getuser
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return { userId: user.id };
}

function getFormFile(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File ? file : null;
}

function assertImageFile(file: File, maxBytes: number): Response | null {
  if (!file.type.startsWith("image/")) {
    return jsonResponse({ error: "Only image files are allowed" }, 400);
  }
  if (file.size > maxBytes) {
    return jsonResponse({ error: "Image file is too large" }, 413);
  }

  return null;
}

function normalizeAllowedKey(input: unknown, bucketName: string): string | Response {
  if (typeof input !== "string") {
    return jsonResponse({ error: "Invalid R2 key" }, 400);
  }

  const key = normalizeR2Key(input, bucketName);
  if (!isAllowedR2Key(key)) {
    return jsonResponse({ error: "Invalid R2 key" }, 400);
  }

  return key;
}

function isNotFoundError(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404;
}

async function uploadObject(file: File, key: string, config: R2Config): Promise<Response> {
  const body = new Uint8Array(await file.arrayBuffer());

  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: file.type || "image/jpeg",
    })
  );

  return jsonResponse({ key });
}

async function getObjectUrl(key: string, config: R2Config): Promise<Response> {
  const url = await getSignedUrl(
    config.client,
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
    { expiresIn: PRESIGNED_URL_TTL_SECONDS }
  );

  return jsonResponse({ url });
}

async function getAvatarUrl(userId: string, config: R2Config): Promise<Response> {
  for (const key of getAvatarKeys(userId)) {
    try {
      await config.client.send(
        new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        })
      );
      return getObjectUrl(key, config);
    } catch (error) {
      if (isNotFoundError(error)) {
        continue;
      }
      throw error;
    }
  }

  return jsonResponse({ url: null });
}

async function handleFormAction(formData: FormData, userId: string, config: R2Config): Promise<Response> {
  const action = String(formData.get("action") || "");
  const file = getFormFile(formData);
  if (!file) {
    return jsonResponse({ error: "Image file is required" }, 400);
  }

  if (action === "uploadTodoImage") {
    const fileError = assertImageFile(file, TODO_IMAGE_MAX_BYTES);
    if (fileError) return fileError;

    const todoId = String(formData.get("todoId") || "");
    return uploadObject(file, buildTodoImageKey(todoId, file.name), config);
  }

  if (action === "uploadAvatar") {
    const fileError = assertImageFile(file, AVATAR_MAX_BYTES);
    if (fileError) return fileError;

    const requestedUserId = String(formData.get("userId") || "");
    if (requestedUserId !== userId) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    return uploadObject(file, buildAvatarKey(userId, file.name), config);
  }

  return jsonResponse({ error: "Unsupported R2 action" }, 400);
}

async function handleJsonAction(payload: JsonRecord, userId: string, config: R2Config): Promise<Response> {
  if (payload.action === "getUrl") {
    const key = normalizeAllowedKey(payload.key, config.bucketName);
    if (key instanceof Response) return key;

    return getObjectUrl(key, config);
  }

  if (payload.action === "delete") {
    const key = normalizeAllowedKey(payload.key, config.bucketName);
    if (key instanceof Response) return key;

    if (key.startsWith("users/") && !isOwnAvatarKey(key, userId)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    await config.client.send(
      new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      })
    );

    return jsonResponse({ ok: true });
  }

  if (payload.action === "getAvatar") {
    if (payload.userId !== userId) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    return getAvatarUrl(userId, config);
  }

  return jsonResponse({ error: "Unsupported R2 action" }, 400);
}

// Vercel's fetch-style Functions keep R2 secrets on the server:
// https://vercel.com/docs/functions
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const auth = await authenticate(request);
      if (auth instanceof Response) return auth;

      const config = getR2Config();
      const contentType = request.headers.get("content-type") || "";

      if (contentType.includes("multipart/form-data")) {
        return handleFormAction(await request.formData(), auth.userId, config);
      }

      return handleJsonAction((await request.json()) as JsonRecord, auth.userId, config);
    } catch (error) {
      console.error("R2 API error:", error);
      return jsonResponse({ error: "R2 operation failed" }, 500);
    }
  },
};
