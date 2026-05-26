import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

type R2Action =
  | {
      action: "createUploadUrl";
      uploadType: "todo";
      todoId: string;
      fileName: string;
      contentType: string;
    }
  | {
      action: "createUploadUrl";
      uploadType: "avatar";
      fileName: string;
      contentType: string;
    }
  | { action: "getDownloadUrl"; key: string }
  | { action: "deleteObject"; key: string }
  | { action: "getAvatar"; userId: string };

const accountId = process.env.R2_ACCOUNT_ID || process.env.VITE_R2_ACCOUNT_ID;
const accessKeyId =
  process.env.R2_ACCESS_KEY_ID || process.env.VITE_R2_ACCESS_KEY_ID;
const secretAccessKey =
  process.env.R2_SECRET_ACCESS_KEY || process.env.VITE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || process.env.VITE_R2_BUCKET_NAME;
const endpoint =
  process.env.R2_ENDPOINT ||
  process.env.VITE_R2_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const s3Client =
  accountId && accessKeyId && secretAccessKey && bucketName && endpoint
    ? new S3Client({
        region: "auto",
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      })
    : null;

const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

const json = (body: unknown, status = 200) =>
  Response.json(body, { status });

const getAuthUser = async (request: Request) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are missing");
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }
  return data.user;
};

const normalizeObjectKey = (keyOrUrl: string): string => {
  if (keyOrUrl.startsWith("http://") || keyOrUrl.startsWith("https://")) {
    const url = new URL(keyOrUrl);
    let key = url.pathname.substring(1);
    if (bucketName && key.startsWith(`${bucketName}/`)) {
      key = key.substring(bucketName.length + 1);
    }
    return key;
  }

  return keyOrUrl;
};

const getImageExtension = (fileName: string): string => {
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension && allowedImageExtensions.has(extension) ? extension : "jpg";
};

const assertImageContentType = (contentType: string) => {
  if (!contentType.startsWith("image/")) {
    throw new Error("Only image uploads are allowed");
  }
};

const assertTodoId = (todoId: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(todoId)) {
    throw new Error("Invalid todo id");
  }
};

const canAccessKey = (key: string, userId: string) =>
  key.startsWith("todos/") || key.startsWith(`users/${userId}/`);

const createUploadUrl = async (
  action: Extract<R2Action, { action: "createUploadUrl" }>,
  userId: string
) => {
  if (!s3Client || !bucketName) {
    throw new Error("R2 environment variables are missing");
  }

  assertImageContentType(action.contentType);

  const extension = getImageExtension(action.fileName);
  const key =
    action.uploadType === "avatar"
      ? `users/${userId}/avatar.${extension}`
      : (() => {
          assertTodoId(action.todoId);
          return `todos/${action.todoId}/${Date.now()}.${extension}`;
        })();

  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: action.contentType,
    }),
    { expiresIn: 300 }
  );

  return { key, uploadUrl };
};

const createDownloadUrl = async (keyOrUrl: string, userId: string) => {
  if (!s3Client || !bucketName) {
    throw new Error("R2 environment variables are missing");
  }

  const key = normalizeObjectKey(keyOrUrl);
  if (!canAccessKey(key, userId)) {
    throw new Error("Forbidden object key");
  }

  const url = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn: 3600 * 24 * 7 }
  );

  return { url };
};

const deleteObject = async (keyOrUrl: string, userId: string) => {
  if (!s3Client || !bucketName) {
    throw new Error("R2 environment variables are missing");
  }

  const key = normalizeObjectKey(keyOrUrl);
  if (!canAccessKey(key, userId)) {
    throw new Error("Forbidden object key");
  }

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  );

  return { deleted: true };
};

const getAvatar = async (requestedUserId: string, userId: string) => {
  if (!s3Client || !bucketName) {
    throw new Error("R2 environment variables are missing");
  }

  if (requestedUserId !== userId) {
    throw new Error("Forbidden user id");
  }

  const extensions = ["jpg", "jpeg", "png", "webp", "gif"];
  for (const extension of extensions) {
    const key = `users/${userId}/avatar.${extension}`;
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );

      const { url } = await createDownloadUrl(key, userId);
      return { url };
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return { url: null };
};

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      const user = await getAuthUser(request);
      if (!user) {
        return json({ error: "Unauthorized" }, 401);
      }

      const body = (await request.json()) as R2Action;
      switch (body.action) {
        case "createUploadUrl":
          return json(await createUploadUrl(body, user.id));
        case "getDownloadUrl":
          return json(await createDownloadUrl(body.key, user.id));
        case "deleteObject":
          return json(await deleteObject(body.key, user.id));
        case "getAvatar":
          return json(await getAvatar(body.userId, user.id));
        default:
          return json({ error: "Unknown action" }, 400);
      }
    } catch (error) {
      console.error("R2 API error:", error);
      return json(
        { error: error instanceof Error ? error.message : "Unexpected error" },
        500
      );
    }
  },
};
