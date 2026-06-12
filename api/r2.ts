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
  generateAvatarKey,
  generateTodoImageKey,
  isAllowedR2KeyForUser,
  normalizeR2Key,
} from "../utils/r2Keys";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const endpoint =
  process.env.R2_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const s3Client =
  endpoint && accessKeyId && secretAccessKey
    ? new S3Client({
        region: "auto",
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      })
    : null;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function getAuthenticatedUser(request: Request) {
  if (!supabase) {
    return { error: json({ error: "Supabase設定が不完全です" }, 500) };
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { error: json({ error: "認証が必要です" }, 401) };
  }

  // Supabase公式docs: auth.getUser(jwt) はAuthサーバーへ問い合わせるため認可判断に使用できる。
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { error: json({ error: "認証に失敗しました" }, 401) };
  }

  return { user };
}

function ensureR2Configured() {
  if (!s3Client || !bucketName) {
    return json({ error: "R2設定が不完全です" }, 500);
  }
  return null;
}

async function getObjectUrl(key: string): Promise<string> {
  if (!s3Client || !bucketName) {
    throw new Error("R2設定が不完全です");
  }

  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn: 3600 }
  );
}

async function handleGet(request: Request, userId: string) {
  const configError = ensureR2Configured();
  if (configError) return configError;

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "avatar") {
    const requestedUserId = url.searchParams.get("userId");
    if (!requestedUserId || requestedUserId !== userId) {
      return json({ error: "許可されていないアバターです" }, 403);
    }

    const extensions = ["jpg", "jpeg", "png", "webp", "gif"];
    for (const ext of extensions) {
      const key = `users/${userId}/avatar.${ext}`;
      try {
        await s3Client!.send(
          new HeadObjectCommand({
            Bucket: bucketName,
            Key: key,
          })
        );
        return json({ url: await getObjectUrl(key), key });
      } catch (error: any) {
        if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
          continue;
        }
        console.warn("アバター確認中にエラー:", error);
      }
    }

    return json({ url: null, key: null });
  }

  const rawKey = url.searchParams.get("key");
  const key = rawKey ? normalizeR2Key(rawKey, bucketName) : null;
  if (!key || !isAllowedR2KeyForUser(key, userId)) {
    return json({ error: "許可されていないR2キーです" }, 403);
  }

  return json({ url: await getObjectUrl(key), key });
}

async function handlePost(request: Request, userId: string) {
  const configError = ensureR2Configured();
  if (configError) return configError;

  const formData = await request.formData();
  const action = String(formData.get("action") || "");
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return json({ error: "画像ファイルがありません" }, 400);
  }

  if (!file.type.startsWith("image/")) {
    return json({ error: "画像ファイルを指定してください" }, 400);
  }

  const maxFileSize = action === "uploadAvatar" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxFileSize) {
    return json({ error: "ファイルサイズが大きすぎます" }, 413);
  }

  let key: string;
  if (action === "uploadAvatar") {
    const requestedUserId = String(formData.get("userId") || "");
    if (requestedUserId !== userId) {
      return json({ error: "許可されていないアバターです" }, 403);
    }
    key = generateAvatarKey(userId, file.name);
  } else if (action === "uploadImage") {
    const todoId = String(formData.get("todoId") || "");
    if (!todoId) {
      return json({ error: "Todo IDがありません" }, 400);
    }
    key = generateTodoImageKey(todoId, file.name);
  } else {
    return json({ error: "不明な操作です" }, 400);
  }

  if (!isAllowedR2KeyForUser(key, userId)) {
    return json({ error: "許可されていないR2キーです" }, 403);
  }

  const body = new Uint8Array(await file.arrayBuffer());
  await s3Client!.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: file.type || "application/octet-stream",
    })
  );

  return json({ key });
}

async function handleDelete(request: Request, userId: string) {
  const configError = ensureR2Configured();
  if (configError) return configError;

  const url = new URL(request.url);
  const rawKey = url.searchParams.get("key");
  const key = rawKey ? normalizeR2Key(rawKey, bucketName) : null;
  if (!key || !isAllowedR2KeyForUser(key, userId)) {
    return json({ error: "許可されていないR2キーです" }, 403);
  }

  await s3Client!.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  );

  return json({ success: true });
}

export default {
  async fetch(request: Request) {
    try {
      const auth = await getAuthenticatedUser(request);
      if (auth.error) return auth.error;

      if (request.method === "GET") {
        return handleGet(request, auth.user.id);
      }
      if (request.method === "POST") {
        return handlePost(request, auth.user.id);
      }
      if (request.method === "DELETE") {
        return handleDelete(request, auth.user.id);
      }

      return json({ error: "Method Not Allowed" }, 405);
    } catch (error) {
      console.error("R2 API error:", error);
      return json({ error: "R2操作に失敗しました" }, 500);
    }
  },
};
