import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

type R2RequestBody =
  | {
      operation: "upload-url";
      kind: "todo";
      todoId: string;
      fileName: string;
      contentType?: string;
    }
  | {
      operation: "upload-url";
      kind: "avatar";
      fileName: string;
      contentType?: string;
    }
  | {
      operation: "delete";
      key: string;
    }
  | {
      operation: "delete-avatar-variants";
    };

type AuthenticatedUser = {
  id: string;
};

const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2BucketName = process.env.R2_BUCKET_NAME;
const r2Endpoint = process.env.R2_ENDPOINT;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const avatarExtensions = ["jpg", "jpeg", "png", "webp", "gif"];

const s3Client =
  r2AccountId &&
  r2AccessKeyId &&
  r2SecretAccessKey &&
  r2BucketName &&
  r2Endpoint
    ? new S3Client({
        region: "auto",
        endpoint: r2Endpoint,
        credentials: {
          accessKeyId: r2AccessKeyId,
          secretAccessKey: r2SecretAccessKey,
        },
      })
    : null;

const authClient =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

function getQueryValue(query: Record<string, unknown>, key: string): string | null {
  const value = query[key];
  if (Array.isArray(value)) return value[0] ? String(value[0]) : null;
  return typeof value === "string" ? value : null;
}

function sendJson(response: any, status: number, body: Record<string, unknown>) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function assertR2Configured() {
  if (!s3Client || !r2BucketName) {
    throw new Error("R2 server environment variables are not configured");
  }
}

async function requireUser(request: any): Promise<AuthenticatedUser> {
  if (!authClient) {
    throw new Error("Supabase server environment variables are not configured");
  }

  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) {
    const error = new Error("Authentication is required");
    (error as any).statusCode = 401;
    throw error;
  }

  // Supabase getUser(jwt) performs a network validation suitable for authorization decisions:
  // https://supabase.com/docs/reference/javascript/auth-getuser
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    const authError = new Error("Invalid authentication token");
    (authError as any).statusCode = 401;
    throw authError;
  }

  return { id: data.user.id };
}

function normalizeKeyInput(input: string): string {
  let key = input.trim();
  if (!key) {
    throw new Error("R2 object key is required");
  }

  if (key.startsWith("http://") || key.startsWith("https://")) {
    const url = new URL(key);
    key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (r2BucketName && key.startsWith(`${r2BucketName}/`)) {
      key = key.slice(r2BucketName.length + 1);
    }
  }

  if (key.includes("..") || key.startsWith("/") || key.endsWith("/")) {
    throw new Error("Invalid R2 object key");
  }

  return key;
}

function ensureKeyAllowedForUser(key: string, userId: string) {
  if (key.startsWith(`users/${userId}/`) || key.startsWith("todos/")) {
    return;
  }

  const error = new Error("R2 object key is not allowed");
  (error as any).statusCode = 403;
  throw error;
}

function extensionFromFileName(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || "jpg";
  return /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
}

function createTodoImageKey(todoId: string, fileName: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(todoId)) {
    throw new Error("Invalid todo id");
  }

  const extension = extensionFromFileName(fileName);
  return `todos/${todoId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

function createAvatarKey(userId: string, fileName: string): string {
  const extension = extensionFromFileName(fileName);
  return `users/${userId}/avatar.${extension}`;
}

async function createSignedPutUrl(key: string, contentType?: string) {
  assertR2Configured();

  const command = new PutObjectCommand({
    Bucket: r2BucketName,
    Key: key,
    ContentType: contentType || "application/octet-stream",
  });

  // AWS presigned URLs provide temporary upload capability without shipping credentials:
  // https://docs.aws.amazon.com/AmazonS3/latest/API/s3_example_s3_Scenario_PresignedUrl_section.html
  return getSignedUrl(s3Client!, command, { expiresIn: 60 * 10 });
}

async function createSignedGetUrl(key: string) {
  assertR2Configured();

  const command = new GetObjectCommand({
    Bucket: r2BucketName,
    Key: key,
  });

  return getSignedUrl(s3Client!, command, { expiresIn: 3600 * 24 * 7 });
}

async function deleteObject(key: string) {
  assertR2Configured();

  const command = new DeleteObjectCommand({
    Bucket: r2BucketName,
    Key: key,
  });

  await s3Client!.send(command);
}

async function findAvatarUrl(userId: string): Promise<string | null> {
  assertR2Configured();

  for (const extension of avatarExtensions) {
    const key = `users/${userId}/avatar.${extension}`;
    try {
      await s3Client!.send(
        new HeadObjectCommand({
          Bucket: r2BucketName,
          Key: key,
        })
      );

      return createSignedGetUrl(key);
    } catch (error: any) {
      if (
        error.name === "NotFound" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        continue;
      }

      throw error;
    }
  }

  return null;
}

async function deleteAvatarVariants(userId: string) {
  await Promise.all(
    avatarExtensions.map(async (extension) => {
      try {
        await deleteObject(`users/${userId}/avatar.${extension}`);
      } catch (error: any) {
        if (
          error.name !== "NotFound" &&
          error.$metadata?.httpStatusCode !== 404
        ) {
          throw error;
        }
      }
    })
  );
}

export default async function handler(request: any, response: any) {
  try {
    if (request.method === "OPTIONS") {
      return response.status(204).end();
    }

    const user = await requireUser(request);

    if (request.method === "GET") {
      const operation = getQueryValue(request.query || {}, "operation");

      if (operation === "image-url") {
        const key = normalizeKeyInput(getQueryValue(request.query || {}, "key") || "");
        ensureKeyAllowedForUser(key, user.id);
        const url = await createSignedGetUrl(key);
        return sendJson(response, 200, { url });
      }

      if (operation === "avatar-url") {
        const userId = getQueryValue(request.query || {}, "userId") || "";
        if (userId !== user.id) {
          return sendJson(response, 403, { error: "Avatar access is not allowed" });
        }

        const url = await findAvatarUrl(user.id);
        return sendJson(response, 200, { url });
      }

      return sendJson(response, 400, { error: "Unsupported R2 operation" });
    }

    if (request.method === "POST") {
      const body = request.body as R2RequestBody | undefined;
      if (!body || typeof body.operation !== "string") {
        return sendJson(response, 400, { error: "Request body is invalid" });
      }

      if (body.operation === "upload-url") {
        const key =
          body.kind === "avatar"
            ? createAvatarKey(user.id, body.fileName)
            : createTodoImageKey(body.todoId, body.fileName);
        ensureKeyAllowedForUser(key, user.id);

        const uploadUrl = await createSignedPutUrl(key, body.contentType);
        return sendJson(response, 200, { key, uploadUrl });
      }

      if (body.operation === "delete") {
        const key = normalizeKeyInput(body.key);
        ensureKeyAllowedForUser(key, user.id);
        await deleteObject(key);
        return sendJson(response, 200, { success: true });
      }

      if (body.operation === "delete-avatar-variants") {
        await deleteAvatarVariants(user.id);
        return sendJson(response, 200, { success: true });
      }

      return sendJson(response, 400, { error: "Unsupported R2 operation" });
    }

    return sendJson(response, 405, { error: "Method not allowed" });
  } catch (error: any) {
    const status = error.statusCode || 500;
    console.error("R2 API error:", error);
    return sendJson(response, status, {
      error: status === 500 ? "R2 operation failed" : error.message,
    });
  }
}
