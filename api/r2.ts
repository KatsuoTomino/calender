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
  buildAvatarImageKey,
  buildTodoImageKey,
  normalizeR2Key,
} from "../utils/r2Keys";

const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const DEFAULT_PRESIGNED_EXPIRY_SECONDS = 3600 * 24 * 7;
const MAX_TODO_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_IMAGE_BYTES = 5 * 1024 * 1024;

type R2Action =
  | "upload-avatar"
  | "upload-image"
  | "get-url"
  | "get-avatar"
  | "delete";

type R2Config = {
  bucketName: string;
  s3Client: S3Client;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function getEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function getR2Config(): R2Config | null {
  const accountId = getEnv("R2_ACCOUNT_ID");
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getEnv("R2_BUCKET_NAME");
  const endpoint = getEnv("R2_ENDPOINT") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    return null;
  }

  return {
    bucketName,
    s3Client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  };
}

async function authenticateRequest(request: Request): Promise<boolean> {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY");
  const authHeader = request.headers.get("authorization");
  const jwt = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!supabaseUrl || !supabaseAnonKey || !jwt) {
    return false;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Supabase docs: getUser(jwt) validates the token with the Auth server.
  // https://supabase.com/docs/reference/javascript/auth-getuser
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt);

  return !error && !!user;
}

function asString(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

async function uploadObject(
  config: R2Config,
  key: string,
  file: File,
  maxBytes: number
): Promise<Response> {
  if (!isImageFile(file)) {
    return jsonResponse({ ok: false, error: "invalid_file_type" }, 400);
  }

  if (file.size > maxBytes) {
    return jsonResponse({ ok: false, error: "file_too_large" }, 413);
  }

  const body = new Uint8Array(await file.arrayBuffer());
  await config.s3Client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: file.type || "image/jpeg",
    })
  );

  return jsonResponse({ ok: true, key });
}

async function handleMultipartAction(action: R2Action, formData: FormData, config: R2Config): Promise<Response> {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonResponse({ ok: false, error: "missing_file" }, 400);
  }

  if (action === "upload-avatar") {
    const userId = asString(formData.get("userId"));
    if (!userId) return jsonResponse({ ok: false, error: "missing_user_id" }, 400);

    return uploadObject(config, buildAvatarImageKey(userId, file.name), file, MAX_AVATAR_IMAGE_BYTES);
  }

  if (action === "upload-image") {
    const todoId = asString(formData.get("todoId"));
    if (!todoId) return jsonResponse({ ok: false, error: "missing_todo_id" }, 400);

    return uploadObject(config, buildTodoImageKey(todoId, file.name), file, MAX_TODO_IMAGE_BYTES);
  }

  return jsonResponse({ ok: false, error: "invalid_action" }, 400);
}

async function getPresignedImageUrl(config: R2Config, key: string, expiresIn?: number): Promise<string> {
  return getSignedUrl(
    config.s3Client,
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
    {
      expiresIn: Math.min(
        Math.max(expiresIn || DEFAULT_PRESIGNED_EXPIRY_SECONDS, 60),
        DEFAULT_PRESIGNED_EXPIRY_SECONDS
      ),
    }
  );
}

async function handleJsonAction(request: Request, config: R2Config): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    action?: R2Action;
    key?: string;
    userId?: string;
    expiresIn?: number;
  } | null;

  if (!body?.action) {
    return jsonResponse({ ok: false, error: "missing_action" }, 400);
  }

  if (body.action === "get-url") {
    const key = body.key ? normalizeR2Key(body.key, config.bucketName) : null;
    if (!key) return jsonResponse({ ok: false, error: "invalid_key" }, 400);

    const url = await getPresignedImageUrl(config, key, body.expiresIn);
    return jsonResponse({ ok: true, url });
  }

  if (body.action === "delete") {
    const key = body.key ? normalizeR2Key(body.key, config.bucketName) : null;
    if (!key) return jsonResponse({ ok: false, error: "invalid_key" }, 400);

    await config.s3Client.send(
      new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      })
    );
    return jsonResponse({ ok: true });
  }

  if (body.action === "get-avatar") {
    if (!body.userId) return jsonResponse({ ok: false, error: "missing_user_id" }, 400);

    for (const extension of AVATAR_EXTENSIONS) {
      const key = `users/${body.userId}/avatar.${extension}`;
      try {
        await config.s3Client.send(
          new HeadObjectCommand({
            Bucket: config.bucketName,
            Key: key,
          })
        );
        const url = await getPresignedImageUrl(config, key);
        return jsonResponse({ ok: true, url });
      } catch (error: any) {
        if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
          continue;
        }
        throw error;
      }
    }

    return jsonResponse({ ok: false, error: "not_found" }, 404);
  }

  return jsonResponse({ ok: false, error: "invalid_action" }, 400);
}

export async function POST(request: Request): Promise<Response> {
  const isAuthenticated = await authenticateRequest(request);
  if (!isAuthenticated) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const config = getR2Config();
  if (!config) {
    return jsonResponse({ ok: false, error: "r2_not_configured" }, 500);
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const action = asString(formData.get("action")) as R2Action | null;
      if (!action) return jsonResponse({ ok: false, error: "missing_action" }, 400);
      return handleMultipartAction(action, formData, config);
    }

    return handleJsonAction(request, config);
  } catch (error) {
    console.error("R2 API error:", error);
    return jsonResponse({ ok: false, error: "r2_request_failed" }, 500);
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204 });
}
