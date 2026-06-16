import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import {
  R2_AVATAR_EXTENSIONS,
  buildAvatarKey,
  buildTodoImageKey,
  extractR2Key,
  isAllowedR2Key,
  isAvatarKeyForUser,
  sanitizeFileExtension,
} from "../utils/r2Keys";

export const config = {
  runtime: "nodejs",
};

const MAX_PRESIGN_SECONDS = 60 * 60 * 24 * 7;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

type AuthenticatedContext = {
  jwt: string;
  user: { id: string };
};

type R2Config = {
  bucketName: string;
  endpoint: string;
  client: S3Client;
};

let cachedR2Config: R2Config | null = null;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function getRequiredEnv(name: string, fallbackName?: string): string {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getR2Config(): R2Config {
  if (cachedR2Config) {
    return cachedR2Config;
  }

  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getRequiredEnv("R2_BUCKET_NAME");
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

  cachedR2Config = {
    bucketName,
    endpoint,
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  };

  return cachedR2Config;
}

async function authenticate(request: Request): Promise<AuthenticatedContext | Response> {
  const authHeader = request.headers.get("authorization");
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!jwt) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });

  // Supabase docs: getUser(jwt) validates the token with the Auth server.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt);

  if (error || !user) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  return { jwt, user: { id: user.id } };
}

function clampExpiresIn(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return MAX_PRESIGN_SECONDS;
  }
  return Math.min(Math.floor(parsed), MAX_PRESIGN_SECONDS);
}

function assertSafeId(id: unknown, name: string): string {
  if (typeof id !== "string" || !SAFE_ID_PATTERN.test(id)) {
    throw new Error(`${name} is invalid`);
  }
  return id;
}

function normalizeAllowedKey(imageKeyOrUrl: unknown, bucketName: string): string {
  if (typeof imageKeyOrUrl !== "string") {
    throw new Error("imageKey is required");
  }

  const key = extractR2Key(imageKeyOrUrl, bucketName);
  if (!isAllowedR2Key(key)) {
    throw new Error("imageKey is not allowed");
  }

  return key;
}

function canUseKey(key: string, userId: string): boolean {
  if (key.startsWith("users/")) {
    return isAvatarKeyForUser(key, userId);
  }
  return key.startsWith("todos/");
}

async function uploadAvatar(file: File, userId: string, r2: R2Config): Promise<Response> {
  const extension = sanitizeFileExtension(file.name);
  const key = buildAvatarKey(userId, extension);
  const body = Buffer.from(await file.arrayBuffer());

  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
      Body: body,
      ContentType: file.type || "image/jpeg",
    })
  );

  return jsonResponse({ key });
}

async function uploadImage(file: File, todoId: string, r2: R2Config): Promise<Response> {
  const extension = sanitizeFileExtension(file.name);
  const key = buildTodoImageKey(todoId, Date.now(), extension);
  const body = Buffer.from(await file.arrayBuffer());

  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
      Body: body,
      ContentType: file.type || "image/jpeg",
    })
  );

  return jsonResponse({ key });
}

async function getImageUrl(key: string, expiresIn: number, r2: R2Config): Promise<Response> {
  const command = new GetObjectCommand({
    Bucket: r2.bucketName,
    Key: key,
  });
  const url = await getSignedUrl(r2.client, command, { expiresIn });

  return jsonResponse({ url });
}

async function getAvatar(userId: string, r2: R2Config): Promise<Response> {
  for (const extension of R2_AVATAR_EXTENSIONS) {
    const key = buildAvatarKey(userId, extension);
    try {
      await r2.client.send(
        new HeadObjectCommand({
          Bucket: r2.bucketName,
          Key: key,
        })
      );

      const command = new GetObjectCommand({
        Bucket: r2.bucketName,
        Key: key,
      });
      const url = await getSignedUrl(r2.client, command, { expiresIn: MAX_PRESIGN_SECONDS });
      return jsonResponse({ key, url });
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return jsonResponse({ url: null });
}

async function deleteImage(key: string, r2: R2Config): Promise<Response> {
  await r2.client.send(
    new DeleteObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
    })
  );

  return jsonResponse({ ok: true });
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = await authenticate(request);
  if (auth instanceof Response) {
    return auth;
  }

  const r2 = getR2Config();
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const action = formData.get("action");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonResponse({ error: "file is required" }, { status: 400 });
    }

    if (action === "uploadAvatar") {
      return uploadAvatar(file, auth.user.id, r2);
    }

    if (action === "uploadImage") {
      const todoId = assertSafeId(formData.get("todoId"), "todoId");
      return uploadImage(file, todoId, r2);
    }

    return jsonResponse({ error: "Unknown action" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return jsonResponse({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = (payload as { action?: unknown }).action;

  if (action === "getAvatar") {
    return getAvatar(auth.user.id, r2);
  }

  const rawKey = (payload as { imageKey?: unknown }).imageKey;
  const key = normalizeAllowedKey(rawKey, r2.bucketName);
  if (!canUseKey(key, auth.user.id)) {
    return jsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "getImageUrl") {
    return getImageUrl(key, clampExpiresIn((payload as { expiresIn?: unknown }).expiresIn), r2);
  }

  if (action === "deleteImage") {
    return deleteImage(key, r2);
  }

  return jsonResponse({ error: "Unknown action" }, { status: 400 });
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await handleRequest(request);
    } catch (error) {
      console.error("R2 API error:", error);
      return jsonResponse({ error: "R2 operation failed" }, { status: 500 });
    }
  },
};
