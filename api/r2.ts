import { randomUUID } from "crypto";
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
  AVATAR_IMAGE_EXTENSIONS,
  getImageExtension,
  isAllowedR2KeyForUser,
  normalizeR2Key,
  sanitizeR2KeySegment,
} from "../utils/r2Keys";

type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

type R2Config = {
  bucketName: string;
  client: S3Client;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PRESIGNED_URL_TTL_SECONDS = 3600 * 24 * 7;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

function getHeader(headers: ApiRequest["headers"], name: string): string | undefined {
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getRequestBody(req: ApiRequest): Record<string, unknown> {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  return req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
}

function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    return null;
  }

  return {
    bucketName,
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  };
}

async function authenticate(req: ApiRequest): Promise<{ id: string } | null> {
  const authHeader = getHeader(req.headers, "authorization");
  const jwt = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase環境変数が設定されていません。");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // getUser(jwt)はSupabase Authへ問い合わせるため、サーバー側認可判断に使える。
  // https://supabase.com/docs/reference/javascript/auth-getuser
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt);

  if (error || !user) return null;
  return { id: user.id };
}

function decodeBase64Image(dataBase64: unknown): Buffer | null {
  if (typeof dataBase64 !== "string" || !dataBase64) {
    return null;
  }

  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    return null;
  }

  return buffer;
}

function getImageContentType(contentType: unknown): string {
  return typeof contentType === "string" && contentType.startsWith("image/")
    ? contentType
    : "image/jpeg";
}

async function getPresignedImageUrl(
  r2: R2Config,
  key: string,
  expiresIn: number = PRESIGNED_URL_TTL_SECONDS
): Promise<string> {
  return getSignedUrl(
    r2.client,
    new GetObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
    }),
    { expiresIn }
  );
}

async function handleUploadImage(
  r2: R2Config,
  body: Record<string, unknown>
): Promise<{ key: string } | { error: string; status: number }> {
  const todoId = typeof body.todoId === "string" ? sanitizeR2KeySegment(body.todoId) : null;
  const contentType = getImageContentType(body.contentType);
  const fileName = typeof body.fileName === "string" ? body.fileName : "image.jpg";
  const imageBuffer = decodeBase64Image(body.dataBase64);

  if (!todoId || !imageBuffer) {
    return { error: "画像アップロードリクエストが不正です。", status: 400 };
  }

  const extension = getImageExtension(fileName, contentType);
  const key = `todos/${todoId}/${Date.now()}-${randomUUID()}.${extension}`;

  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
    })
  );

  return { key };
}

async function handleUploadAvatar(
  r2: R2Config,
  body: Record<string, unknown>,
  userId: string
): Promise<{ key: string } | { error: string; status: number }> {
  const requestedUserId = typeof body.userId === "string" ? body.userId : "";
  const contentType = getImageContentType(body.contentType);
  const fileName = typeof body.fileName === "string" ? body.fileName : "avatar.jpg";
  const imageBuffer = decodeBase64Image(body.dataBase64);

  if (requestedUserId !== userId || !imageBuffer) {
    return { error: "アバターアップロードリクエストが不正です。", status: 403 };
  }

  const extension = getImageExtension(fileName, contentType);
  const key = `users/${userId}/avatar.${extension}`;

  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
    })
  );

  return { key };
}

async function handleGetImageUrl(
  r2: R2Config,
  body: Record<string, unknown>,
  userId: string
): Promise<{ url: string } | { error: string; status: number }> {
  const key = typeof body.imageKey === "string" ? normalizeR2Key(body.imageKey, r2.bucketName) : null;
  const expiresIn = typeof body.expiresIn === "number" ? body.expiresIn : PRESIGNED_URL_TTL_SECONDS;

  if (!key || !isAllowedR2KeyForUser(key, userId)) {
    return { error: "画像キーが不正です。", status: 400 };
  }

  return { url: await getPresignedImageUrl(r2, key, expiresIn) };
}

async function handleDeleteImage(
  r2: R2Config,
  body: Record<string, unknown>,
  userId: string
): Promise<{ deleted: boolean } | { error: string; status: number }> {
  const key = typeof body.imageKey === "string" ? normalizeR2Key(body.imageKey, r2.bucketName) : null;
  if (!key || !isAllowedR2KeyForUser(key, userId)) {
    return { error: "画像キーが不正です。", status: 400 };
  }

  await r2.client.send(
    new DeleteObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
    })
  );

  return { deleted: true };
}

async function handleGetAvatar(
  r2: R2Config,
  body: Record<string, unknown>,
  userId: string
): Promise<{ url: string | null } | { error: string; status: number }> {
  const requestedUserId = typeof body.userId === "string" ? body.userId : "";
  if (requestedUserId !== userId) {
    return { error: "アバター取得リクエストが不正です。", status: 403 };
  }

  for (const extension of AVATAR_IMAGE_EXTENSIONS) {
    const key = `users/${userId}/avatar.${extension}`;
    try {
      await r2.client.send(
        new HeadObjectCommand({
          Bucket: r2.bucketName,
          Key: key,
        })
      );
      return { url: await getPresignedImageUrl(r2, key) };
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw err;
    }
  }

  return { url: null };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader?.("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const user = await authenticate(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const r2 = getR2Config();
    if (!r2) {
      res.status(500).json({ error: "R2環境変数が設定されていません。" });
      return;
    }

    const body = getRequestBody(req);
    const action = body.action;
    let result:
      | { key: string }
      | { url: string | null }
      | { deleted: boolean }
      | { error: string; status: number };

    switch (action) {
      case "uploadImage":
        result = await handleUploadImage(r2, body);
        break;
      case "uploadAvatar":
        result = await handleUploadAvatar(r2, body, user.id);
        break;
      case "getImageUrl":
        result = await handleGetImageUrl(r2, body, user.id);
        break;
      case "deleteImage":
        result = await handleDeleteImage(r2, body, user.id);
        break;
      case "getAvatar":
        result = await handleGetAvatar(r2, body, user.id);
        break;
      default:
        result = { error: "未対応のR2操作です。", status: 400 };
    }

    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("R2 APIエラー:", err);
    res.status(500).json({ error: "R2 API処理に失敗しました。" });
  }
}
