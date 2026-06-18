import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { isAllowedR2Key, normalizeR2Key } from "../utils/r2Keys";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface R2Config {
  bucketName: string;
  endpoint: string;
  s3Client: S3Client;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name}が設定されていません`);
  }
  return value;
}

function getR2Config(): R2Config {
  const accountId = getEnv("R2_ACCOUNT_ID");
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getEnv("R2_BUCKET_NAME");
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    bucketName,
    endpoint,
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

function normalizeObjectKey(keyOrUrl: string, bucketName: string): string {
  const normalized = normalizeR2Key(keyOrUrl);
  const key = normalized?.startsWith(`${bucketName}/`)
    ? normalized.slice(bucketName.length + 1)
    : normalized;

  if (!key || !isAllowedR2Key(key) || key.includes("..")) {
    throw new Error("許可されていないR2キーです");
  }

  return key;
}

function fileExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  return IMAGE_EXTENSIONS.includes(extension) ? extension : "jpg";
}

function assertImageFile(file: File): void {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error("画像ファイルのみアップロードできます");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("画像サイズは10MB以下にしてください");
  }
}

async function authenticate(request: Request): Promise<{ id: string }> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Supabase公式推奨どおり、サーバー側では保存済みセッションではなくJWTをgetUserで検証する。
  // https://supabase.com/docs/reference/javascript/auth-getsession
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return { id: data.user.id };
}

async function getObjectUrl(config: R2Config, keyOrUrl: string): Promise<string> {
  const key = normalizeObjectKey(keyOrUrl, config.bucketName);
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });
  return getSignedUrl(config.s3Client, command, { expiresIn: 3600 * 24 * 7 });
}

async function getAvatarUrl(config: R2Config, userId: string, currentUserId: string): Promise<string | null> {
  if (userId !== currentUserId) {
    throw new Response("Forbidden", { status: 403 });
  }

  for (const extension of IMAGE_EXTENSIONS) {
    const key = `users/${userId}/avatar.${extension}`;
    try {
      await config.s3Client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key }));
      return getObjectUrl(config, key);
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }
  return null;
}

async function uploadImage(config: R2Config, file: File, todoId: string): Promise<string> {
  assertImageFile(file);
  if (!todoId.trim()) {
    throw new Error("todoIdが指定されていません");
  }

  const key = `todos/${todoId}/${Date.now()}.${fileExtension(file)}`;
  const body = Buffer.from(await file.arrayBuffer());
  await config.s3Client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: file.type,
    })
  );
  return key;
}

async function uploadAvatar(config: R2Config, file: File, userId: string, currentUserId: string): Promise<string> {
  if (userId !== currentUserId) {
    throw new Response("Forbidden", { status: 403 });
  }

  assertImageFile(file);
  const key = `users/${userId}/avatar.${fileExtension(file)}`;
  const body = Buffer.from(await file.arrayBuffer());
  await config.s3Client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: file.type,
    })
  );
  return key;
}

async function deleteImage(config: R2Config, keyOrUrl: string): Promise<boolean> {
  const key = normalizeObjectKey(keyOrUrl, config.bucketName);
  await config.s3Client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
  return true;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
    }

    try {
      const currentUser = await authenticate(request);
      const config = getR2Config();
      const contentType = request.headers.get("content-type") || "";

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const action = String(formData.get("action") || "");
        const file = formData.get("file");
        if (!(file instanceof File)) {
          return jsonResponse({ error: "fileが指定されていません" }, { status: 400 });
        }

        if (action === "uploadImage") {
          const key = await uploadImage(config, file, String(formData.get("todoId") || ""));
          return jsonResponse({ key });
        }
        if (action === "uploadAvatar") {
          const key = await uploadAvatar(config, file, String(formData.get("userId") || ""), currentUser.id);
          return jsonResponse({ key });
        }
        return jsonResponse({ error: "不明なactionです" }, { status: 400 });
      }

      const body = (await request.json()) as { action?: string; key?: string; userId?: string };
      if (body.action === "getImageUrl" && body.key) {
        return jsonResponse({ url: await getObjectUrl(config, body.key) });
      }
      if (body.action === "getAvatar" && body.userId) {
        return jsonResponse({ url: await getAvatarUrl(config, body.userId, currentUser.id) });
      }
      if (body.action === "deleteImage" && body.key) {
        return jsonResponse({ deleted: await deleteImage(config, body.key) });
      }

      return jsonResponse({ error: "不明なactionです" }, { status: 400 });
    } catch (error: any) {
      if (error instanceof Response) {
        return error;
      }
      console.error("R2 APIエラー:", error);
      return jsonResponse({ error: error?.message || "R2 APIエラー" }, { status: 500 });
    }
  },
};
