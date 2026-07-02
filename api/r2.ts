import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { isAllowedR2Key, isAvatarKeyForUser, normalizeR2Key } from "../utils/r2Keys";

const DEFAULT_URL_EXPIRES_IN = 3600 * 24 * 7;
const UPLOAD_URL_EXPIRES_IN = 60 * 5;
const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

type R2RequestBody = {
  action?: string;
  key?: string;
  contentType?: string;
  userId?: string;
  expiresIn?: number;
};

type EnvConfig = {
  bucketName: string;
  s3Client: S3Client;
};

export async function POST(request: Request): Promise<Response> {
  const user = await authenticateRequest(request);
  if (!user) {
    return json({ error: "認証が必要です" }, 401);
  }

  const config = getEnvConfig();
  if (!config) {
    return json({ error: "R2設定が不完全です" }, 500);
  }

  let body: R2RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "リクエスト形式が不正です" }, 400);
  }

  switch (body.action) {
    case "createUploadUrl":
      return createUploadUrl(body, user.id, config);
    case "getImageUrl":
      return createImageUrl(body, config);
    case "deleteImage":
      return deleteImage(body, user.id, config);
    case "getAvatar":
      return getAvatar(body, user.id, config);
    default:
      return json({ error: "未対応のR2操作です" }, 400);
  }
}

async function authenticateRequest(request: Request): Promise<{ id: string } | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase環境変数が設定されていません。");
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error("R2 API認証エラー:", error);
    return null;
  }

  return { id: user.id };
}

function getEnvConfig(): EnvConfig | null {
  // Vite docs: VITE_* values are bundled into client code, so R2 secrets must stay server-only here.
  // https://vite.dev/guide/env-and-mode#env-variables
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    return null;
  }

  return {
    bucketName,
    s3Client: new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function createUploadUrl(
  body: R2RequestBody,
  userId: string,
  { bucketName, s3Client }: EnvConfig
): Promise<Response> {
  const key = normalizeAndValidateKey(body.key, bucketName);
  if (!key) {
    return json({ error: "R2キーが不正です" }, 400);
  }

  if (key.startsWith("users/") && !isAvatarKeyForUser(key, userId)) {
    return json({ error: "他ユーザーのアバターは変更できません" }, 403);
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: body.contentType || "application/octet-stream",
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: UPLOAD_URL_EXPIRES_IN });
  return json({ uploadUrl, key });
}

async function createImageUrl(
  body: R2RequestBody,
  { bucketName, s3Client }: EnvConfig
): Promise<Response> {
  const key = normalizeAndValidateKey(body.key, bucketName);
  if (!key) {
    return json({ error: "R2キーが不正です" }, 400);
  }

  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const url = await getSignedUrl(s3Client, command, {
    expiresIn: normalizeExpiresIn(body.expiresIn),
  });
  return json({ url });
}

async function deleteImage(
  body: R2RequestBody,
  userId: string,
  { bucketName, s3Client }: EnvConfig
): Promise<Response> {
  const key = normalizeAndValidateKey(body.key, bucketName);
  if (!key) {
    return json({ error: "R2キーが不正です" }, 400);
  }

  if (key.startsWith("users/") && !isAvatarKeyForUser(key, userId)) {
    return json({ error: "他ユーザーのアバターは削除できません" }, 403);
  }

  await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
  return json({ success: true });
}

async function getAvatar(
  body: R2RequestBody,
  authUserId: string,
  { bucketName, s3Client }: EnvConfig
): Promise<Response> {
  if (!body.userId || body.userId !== authUserId) {
    return json({ error: "他ユーザーのアバターは取得できません" }, 403);
  }

  for (const extension of AVATAR_EXTENSIONS) {
    const key = `users/${body.userId}/avatar.${extension}`;
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
        { expiresIn: DEFAULT_URL_EXPIRES_IN }
      );
      return json({ url });
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        continue;
      }
      console.error("アバター取得エラー:", error);
      return json({ error: "アバター取得に失敗しました" }, 500);
    }
  }

  return json({ url: null });
}

function normalizeAndValidateKey(input: string | undefined, bucketName: string): string | null {
  if (!input) {
    return null;
  }

  const key = normalizeR2Key(input, bucketName);
  return isAllowedR2Key(key) ? key : null;
}

function normalizeExpiresIn(expiresIn: number | undefined): number {
  if (!expiresIn || !Number.isFinite(expiresIn)) {
    return DEFAULT_URL_EXPIRES_IN;
  }
  return Math.min(Math.max(Math.trunc(expiresIn), 60), DEFAULT_URL_EXPIRES_IN);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
