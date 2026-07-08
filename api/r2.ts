import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const MAX_TODO_IMAGE_SIZE = 10 * 1024 * 1024;
const PRESIGNED_URL_TTL_SECONDS = 3600 * 24 * 7;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function getRequiredEnv(name: string, fallbackName?: string): string {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new HttpError(500, `${name} is not configured`);
  }
  return value;
}

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!endpoint) {
    throw new HttpError(500, "R2_ENDPOINT or R2_ACCOUNT_ID is not configured");
  }

  return {
    bucketName: getRequiredEnv("R2_BUCKET_NAME"),
    endpoint,
    accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
  };
}

function createR2Client(): { client: S3Client; bucketName: string } {
  const { bucketName, endpoint, accessKeyId, secretAccessKey } = getR2Config();

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

async function authenticate(request: Request): Promise<string> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "認証が必要です");
  }

  const jwt = authorization.slice("Bearer ".length).trim();
  if (!jwt) {
    throw new HttpError(401, "認証が必要です");
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Supabase公式ドキュメント: auth.getUser(jwt) はAuthサーバーへ問い合わせ、
  // ローカルストレージ由来ではない検証済みユーザー情報を返す。
  // https://supabase.com/docs/reference/javascript/auth-getuser
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt);

  if (error || !user) {
    throw new HttpError(401, "認証トークンが無効です");
  }

  return user.id;
}

function normalizeKey(input: string, bucketName: string): string {
  let key = input.trim();
  if (!key) {
    throw new HttpError(400, "画像キーが指定されていません");
  }

  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const url = new URL(key);
      key = url.pathname.replace(/^\/+/, "");
    } catch {
      throw new HttpError(400, "画像URLが不正です");
    }
  }

  key = key.replace(/^\/+/, "");
  if (key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  if (!key || key.includes("..") || key.includes("\\") || key.includes("//")) {
    throw new HttpError(400, "画像キーが不正です");
  }

  return key;
}

function validateKeyAccess(key: string, userId: string): void {
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const userAvatarPattern = new RegExp(
    `^users/${escapedUserId}/avatar\\.(${IMAGE_EXTENSIONS.join("|")})$`
  );
  const todoImagePattern = new RegExp(
    `^todos/[A-Za-z0-9_-]+/[0-9]+\\.(${IMAGE_EXTENSIONS.join("|")})$`
  );

  if (userAvatarPattern.test(key) || todoImagePattern.test(key)) {
    return;
  }

  throw new HttpError(403, "この画像キーへのアクセスは許可されていません");
}

function sanitizeExtension(fileName: string, contentType: string): string {
  const rawExtension = fileName.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.includes(rawExtension as (typeof IMAGE_EXTENSIONS)[number])) {
    return rawExtension;
  }

  const fromType = contentType.split("/")[1]?.toLowerCase();
  if (fromType === "jpeg") return "jpg";
  if (IMAGE_EXTENSIONS.includes(fromType as (typeof IMAGE_EXTENSIONS)[number])) {
    return fromType;
  }

  return "jpg";
}

function getFormFile(formData: FormData): File {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new HttpError(400, "画像ファイルが指定されていません");
  }
  if (!file.type.startsWith("image/")) {
    throw new HttpError(400, "画像ファイルのみアップロードできます");
  }
  return file;
}

async function uploadObject(
  request: Request,
  userId: string,
  client: S3Client,
  bucketName: string
): Promise<Response> {
  const formData = await request.formData();
  const action = formData.get("action");
  const file = getFormFile(formData);
  const extension = sanitizeExtension(file.name, file.type);

  let key: string;
  let maxSize: number;
  if (action === "upload-avatar") {
    const requestedUserId = formData.get("userId");
    if (typeof requestedUserId !== "string" || requestedUserId !== userId) {
      throw new HttpError(403, "他のユーザーのアバターは更新できません");
    }
    key = `users/${userId}/avatar.${extension}`;
    maxSize = MAX_AVATAR_SIZE;
  } else if (action === "upload-todo-image") {
    const todoId = formData.get("todoId");
    if (typeof todoId !== "string" || !/^[A-Za-z0-9_-]+$/.test(todoId)) {
      throw new HttpError(400, "Todo IDが不正です");
    }
    key = `todos/${todoId}/${Date.now()}.${extension}`;
    maxSize = MAX_TODO_IMAGE_SIZE;
  } else {
    throw new HttpError(400, "不明なR2操作です");
  }

  if (file.size > maxSize) {
    throw new HttpError(400, "画像サイズが上限を超えています");
  }

  // Cloudflare R2公式ドキュメントではS3互換APIのAccess Key/Secretを
  // SDK資格情報として扱うため、ブラウザへ配布せずサーバー関数内だけで使用する。
  // https://developers.cloudflare.com/r2/api/s3/tokens/
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: new Uint8Array(await file.arrayBuffer()),
      ContentType: file.type || "image/jpeg",
    })
  );

  return jsonResponse({ key });
}

async function getImageUrl(
  url: URL,
  userId: string,
  client: S3Client,
  bucketName: string
): Promise<Response> {
  const rawKey = url.searchParams.get("key");
  if (!rawKey) {
    throw new HttpError(400, "画像キーが指定されていません");
  }

  const key = normalizeKey(rawKey, bucketName);
  validateKeyAccess(key, userId);

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn: PRESIGNED_URL_TTL_SECONDS }
  );

  return jsonResponse({ url: signedUrl });
}

async function getAvatarUrl(
  url: URL,
  userId: string,
  client: S3Client,
  bucketName: string
): Promise<Response> {
  const requestedUserId = url.searchParams.get("userId");
  if (requestedUserId !== userId) {
    throw new HttpError(403, "他のユーザーのアバターは取得できません");
  }

  for (const extension of IMAGE_EXTENSIONS) {
    const key = `users/${userId}/avatar.${extension}`;
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );

      const signedUrl = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
        { expiresIn: PRESIGNED_URL_TTL_SECONDS }
      );

      return jsonResponse({ url: signedUrl, key });
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return jsonResponse({ url: null });
}

async function deleteObject(
  request: Request,
  userId: string,
  client: S3Client,
  bucketName: string
): Promise<Response> {
  let body: { key?: unknown };
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "リクエストボディが不正です");
  }

  if (typeof body.key !== "string") {
    throw new HttpError(400, "画像キーが指定されていません");
  }

  const key = normalizeKey(body.key, bucketName);
  validateKeyAccess(key, userId);

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  );

  return jsonResponse({ ok: true });
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const userId = await authenticate(request);
      const { client, bucketName } = createR2Client();
      const url = new URL(request.url);

      if (request.method === "POST") {
        return await uploadObject(request, userId, client, bucketName);
      }

      if (request.method === "GET") {
        const action = url.searchParams.get("action");
        if (action === "get-url") {
          return await getImageUrl(url, userId, client, bucketName);
        }
        if (action === "get-avatar") {
          return await getAvatarUrl(url, userId, client, bucketName);
        }
        throw new HttpError(400, "不明なR2操作です");
      }

      if (request.method === "DELETE") {
        return await deleteObject(request, userId, client, bucketName);
      }

      return jsonResponse({ error: "Method Not Allowed" }, 405);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, error.status);
      }

      console.error("R2 APIエラー:", error);
      return jsonResponse({ error: "R2 APIで予期しないエラーが発生しました" }, 500);
    }
  },
};
