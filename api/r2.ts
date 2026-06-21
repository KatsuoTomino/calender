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
  AVATAR_EXTENSIONS,
  buildAvatarKey,
  buildTodoImageKey,
  getSafeFileExtension,
  getTodoIdFromR2Key,
  isAllowedR2Key,
  isOwnAvatarKey,
  normalizeR2Key,
} from "../utils/r2Keys";

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
};

type AuthenticatedUser = {
  id: string;
};

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;
const UPLOAD_URL_EXPIRES_IN_SECONDS = 60 * 10;

let r2Client: S3Client | null = null;

// Vite documents that VITE_* values are bundled into client code:
// https://vite.dev/guide/env-and-mode#env-variables
function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  const accountId = requireEnv("R2_ACCOUNT_ID");
  const endpoint =
    process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

  r2Client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });

  return r2Client;
}

function getBucketName(): string {
  return requireEnv("R2_BUCKET_NAME");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new HttpError(500, `${name} is not configured`);
  }
  return value;
}

function getSupabaseServerClient(jwt?: string) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new HttpError(500, "Supabase environment variables are not configured");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: jwt
      ? {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        }
      : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function requireUser(req: VercelRequest): Promise<{
  user: AuthenticatedUser;
  jwt: string;
}> {
  const authHeader = getHeader(req, "authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    throw new HttpError(401, "Missing authorization token");
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new HttpError(401, "Invalid authorization token");
  }

  return { user: { id: user.id }, jwt: token };
}

function getHeader(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] || req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  if (typeof req.body === "string") {
    return JSON.parse(req.body) as Record<string, unknown>;
  }

  if (req.body && typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }

  return {};
}

async function ensureTodoReadable(todoId: string, jwt: string): Promise<void> {
  const supabase = getSupabaseServerClient(jwt);
  const { data, error } = await supabase
    .from("todos")
    .select("id")
    .eq("id", todoId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to verify todo access");
  }

  if (!data) {
    throw new HttpError(403, "Todo is not accessible");
  }
}

function getKeyFromPayload(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "R2 key is required");
  }

  const key = normalizeR2Key(value, getBucketName());
  if (!key || !isAllowedR2Key(key)) {
    throw new HttpError(400, "R2 key is invalid");
  }

  return key;
}

async function createUploadUrl(
  body: Record<string, unknown>,
  user: AuthenticatedUser,
  jwt: string
): Promise<{ key: string; uploadUrl: string }> {
  const uploadType = body.uploadType;
  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  const contentType =
    typeof body.contentType === "string"
      ? body.contentType
      : "application/octet-stream";
  const extension = getSafeFileExtension(fileName, contentType);

  let key: string;
  if (uploadType === "avatar") {
    if (targetId !== user.id) {
      throw new HttpError(403, "Cannot upload another user's avatar");
    }
    key = buildAvatarKey(user.id, extension);
  } else if (uploadType === "todo") {
    await ensureTodoReadable(targetId, jwt);
    key = buildTodoImageKey(targetId, extension);
  } else {
    throw new HttpError(400, "uploadType is invalid");
  }

  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: UPLOAD_URL_EXPIRES_IN_SECONDS }
  );

  return { key, uploadUrl };
}

async function getImageUrl(key: string): Promise<{ url: string }> {
  const url = await getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
    { expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS }
  );

  return { url };
}

async function getAvatarUrl(userId: string): Promise<{ url: string | null }> {
  for (const extension of AVATAR_EXTENSIONS) {
    const key = buildAvatarKey(userId, extension);
    try {
      await getR2Client().send(
        new HeadObjectCommand({
          Bucket: getBucketName(),
          Key: key,
        })
      );
      return getImageUrl(key);
    } catch (error: any) {
      if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return { url: null };
}

async function deleteImage(key: string, user: AuthenticatedUser): Promise<void> {
  if (key.startsWith("users/") && !isOwnAvatarKey(key, user.id)) {
    throw new HttpError(403, "Cannot delete another user's avatar");
  }

  if (key.startsWith("todos/") && !getTodoIdFromR2Key(key)) {
    throw new HttpError(400, "Todo image key is invalid");
  }

  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  try {
    const { user, jwt } = await requireUser(req);
    const body = parseBody(req);
    const action = body.action;

    if (action === "createUploadUrl") {
      const result = await createUploadUrl(body, user, jwt);
      res.status(200).json({ success: true, ...result });
      return;
    }

    if (action === "getImageUrl") {
      const key = getKeyFromPayload(body.key);
      const result = await getImageUrl(key);
      res.status(200).json({ success: true, ...result });
      return;
    }

    if (action === "getAvatar") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (userId !== user.id) {
        throw new HttpError(403, "Cannot read another user's avatar");
      }
      const result = await getAvatarUrl(user.id);
      res.status(200).json({ success: true, ...result });
      return;
    }

    if (action === "deleteImage") {
      const key = getKeyFromPayload(body.key);
      await deleteImage(key, user);
      res.status(200).json({ success: true });
      return;
    }

    throw new HttpError(400, "Unknown action");
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(statusCode).json({ success: false, error: message });
  }
}
