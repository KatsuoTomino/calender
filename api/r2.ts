import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const GET_URL_EXPIRES_SECONDS = 3600 * 24 * 7;
const PUT_URL_EXPIRES_SECONDS = 300;

type AuthenticatedUser = {
  id: string;
};

type R2Config = {
  bucketName: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type UploadUrlPayload = {
  operation: "upload-url";
  target: "avatar" | "todo";
  userId?: string;
  todoId?: string;
  fileName?: string;
  contentType?: string;
};

type KeyPayload = {
  operation: "get-url" | "delete";
  imageKey?: string;
};

type AvatarPayload = {
  operation: "get-avatar";
  userId?: string;
};

type R2Payload = UploadUrlPayload | KeyPayload | AvatarPayload;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const getRequiredEnv = (names: string[]): string | null => {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return null;
};

const getR2Config = (): R2Config | null => {
  const accountId = getRequiredEnv(["R2_ACCOUNT_ID", "VITE_R2_ACCOUNT_ID"]);
  const endpoint =
    getRequiredEnv(["R2_ENDPOINT", "VITE_R2_ENDPOINT"]) ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
  const accessKeyId = getRequiredEnv(["R2_ACCESS_KEY_ID", "VITE_R2_ACCESS_KEY_ID"]);
  const secretAccessKey = getRequiredEnv([
    "R2_SECRET_ACCESS_KEY",
    "VITE_R2_SECRET_ACCESS_KEY",
  ]);
  const bucketName = getRequiredEnv(["R2_BUCKET_NAME", "VITE_R2_BUCKET_NAME"]);

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  return {
    bucketName,
    endpoint,
    accessKeyId,
    secretAccessKey,
  };
};

const createR2Client = (config: R2Config): S3Client =>
  new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

const authenticate = async (request: Request): Promise<AuthenticatedUser | null> => {
  const supabaseUrl = getRequiredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const supabaseAnonKey = getRequiredEnv([
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
  ]);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !supabaseAnonKey || !token) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Supabase auth.getUser(jwt) performs a network verification of the JWT.
  // Docs: https://supabase.com/docs/reference/javascript/auth-getuser
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return { id: data.user.id };
};

const safePathSegment = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+$/.test(value) || value.includes("..")) {
    throw new Error(`${fieldName}が不正です。`);
  }
  return value;
};

const extensionFromFile = (fileName: unknown, contentType: unknown): string => {
  const lowerName = typeof fileName === "string" ? fileName.toLowerCase() : "";
  const extension = lowerName.split(".").pop() || "";
  if (IMAGE_EXTENSIONS.has(extension)) {
    return extension;
  }

  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";

  throw new Error("画像ファイル形式が不正です。");
};

const assertImageContentType = (contentType: unknown): string => {
  if (typeof contentType !== "string" || !contentType.startsWith("image/")) {
    throw new Error("画像ファイルのみアップロードできます。");
  }
  return contentType;
};

const normalizeObjectKey = (imageKey: unknown, bucketName: string): string => {
  if (typeof imageKey !== "string" || !imageKey.trim()) {
    throw new Error("画像キーが不正です。");
  }

  let key = imageKey.trim();
  if (key.startsWith("http://") || key.startsWith("https://")) {
    const url = new URL(key);
    key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  }

  if (key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  validateAllowedObjectKey(key);
  return key;
};

const validateAllowedObjectKey = (key: string): void => {
  const parts = key.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("画像キーが不正です。");
  }

  if (parts.length === 3 && parts[0] === "todos") {
    safePathSegment(parts[1], "todoId");
    const fileName = safePathSegment(parts[2], "ファイル名");
    const extension = fileName.toLowerCase().split(".").pop() || "";
    if (IMAGE_EXTENSIONS.has(extension)) return;
  }

  if (parts.length === 3 && parts[0] === "users") {
    safePathSegment(parts[1], "userId");
    const fileName = parts[2].toLowerCase();
    if (fileName.startsWith("avatar.") && IMAGE_EXTENSIONS.has(fileName.split(".").pop() || "")) {
      return;
    }
  }

  throw new Error("許可されていない画像キーです。");
};

const createObjectKey = (
  payload: UploadUrlPayload,
  authenticatedUser: AuthenticatedUser
): string => {
  const contentType = assertImageContentType(payload.contentType);
  const extension = extensionFromFile(payload.fileName, contentType);

  if (payload.target === "avatar") {
    const userId = safePathSegment(payload.userId, "userId");
    if (userId !== authenticatedUser.id) {
      throw new Error("他のユーザーのアバターは変更できません。");
    }
    return `users/${userId}/avatar.${extension}`;
  }

  const todoId = safePathSegment(payload.todoId, "todoId");
  return `todos/${todoId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
};

const handleUploadUrl = async (
  payload: UploadUrlPayload,
  user: AuthenticatedUser,
  r2Client: S3Client,
  config: R2Config
): Promise<Response> => {
  const contentType = assertImageContentType(payload.contentType);
  const key = createObjectKey(payload, user);
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(r2Client, command, {
    expiresIn: PUT_URL_EXPIRES_SECONDS,
  });

  return json(200, { key, uploadUrl });
};

const handleGetUrl = async (
  payload: KeyPayload,
  r2Client: S3Client,
  config: R2Config
): Promise<Response> => {
  const key = normalizeObjectKey(payload.imageKey, config.bucketName);
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });
  const url = await getSignedUrl(r2Client, command, {
    expiresIn: GET_URL_EXPIRES_SECONDS,
  });

  return json(200, { key, url });
};

const handleDelete = async (
  payload: KeyPayload,
  r2Client: S3Client,
  config: R2Config
): Promise<Response> => {
  const key = normalizeObjectKey(payload.imageKey, config.bucketName);
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
  );

  return json(200, { success: true });
};

const handleGetAvatar = async (
  payload: AvatarPayload,
  r2Client: S3Client,
  config: R2Config
): Promise<Response> => {
  const userId = safePathSegment(payload.userId, "userId");

  for (const extension of AVATAR_EXTENSIONS) {
    const key = `users/${userId}/avatar.${extension}`;
    try {
      await r2Client.send(
        new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        })
      );

      const url = await getSignedUrl(
        r2Client,
        new GetObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        }),
        { expiresIn: GET_URL_EXPIRES_SECONDS }
      );

      return json(200, { key, url });
    } catch (error) {
      const statusCode =
        typeof error === "object" && error !== null && "$metadata" in error
          ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
          : undefined;
      const name =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (statusCode === 404 || name === "NotFound") {
        continue;
      }
      throw error;
    }
  }

  return json(404, { error: "アバター画像が見つかりません。" });
};

// ViteのVITE_*環境変数はクライアントにバンドルされるため、R2秘密鍵はここでのみ扱う。
// Docs: https://vite.dev/guide/env-and-mode.html#env-variables
export async function POST(request: Request): Promise<Response> {
  const user = await authenticate(request);
  if (!user) {
    return json(401, { error: "認証が必要です。" });
  }

  const config = getR2Config();
  if (!config) {
    return json(500, { error: "R2環境変数が設定されていません。" });
  }

  let payload: R2Payload;
  try {
    payload = (await request.json()) as R2Payload;
  } catch {
    return json(400, { error: "JSONリクエストを送信してください。" });
  }

  const r2Client = createR2Client(config);
  try {
    if (payload.operation === "upload-url") {
      return await handleUploadUrl(payload, user, r2Client, config);
    }
    if (payload.operation === "get-url") {
      return await handleGetUrl(payload, r2Client, config);
    }
    if (payload.operation === "delete") {
      return await handleDelete(payload, r2Client, config);
    }
    if (payload.operation === "get-avatar") {
      return await handleGetAvatar(payload, r2Client, config);
    }
  } catch (error) {
    console.error("R2 APIエラー:", error);
    return json(400, {
      error: error instanceof Error ? error.message : "R2操作に失敗しました。",
    });
  }

  return json(400, { error: "未対応のR2操作です。" });
}
