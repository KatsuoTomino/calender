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
  buildAvatarKey,
  buildTodoImageKey,
  canAccessR2Key,
  isAvatarKeyForUser,
  normalizeR2Key,
  R2_IMAGE_EXTENSIONS,
} from "../utils/r2Keys";

interface R2Config {
  bucketName: string;
  s3Client: S3Client;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

let cachedConfig: R2Config | null = null;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getConfig(): R2Config {
  if (cachedConfig) return cachedConfig;

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

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucketName ||
    !endpoint ||
    !supabaseUrl ||
    !supabaseAnonKey
  ) {
    throw new Error("Required server environment variables are missing");
  }

  cachedConfig = {
    bucketName,
    supabaseUrl,
    supabaseAnonKey,
    s3Client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  };

  return cachedConfig;
}

async function authenticate(request: Request, config: R2Config): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Supabase getUser(jwt) performs a server round-trip and is safe for auth decisions.
  // Docs: https://supabase.com/docs/reference/javascript/auth-getuser
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user.id;
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

async function deleteKeyIfPresent(config: R2Config, key: string): Promise<void> {
  await config.s3Client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
  );
}

async function getSignedImageUrl(config: R2Config, key: string): Promise<string> {
  return getSignedUrl(
    config.s3Client,
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
    { expiresIn: 3600 * 24 * 7 }
  );
}

export async function POST(request: Request): Promise<Response> {
  let config: R2Config;
  try {
    config = getConfig();
  } catch (error) {
    console.error("R2 API configuration error:", error);
    return jsonResponse(500, { error: "R2 is not configured" });
  }

  const userId = await authenticate(request, config);
  if (!userId) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const action = formData.get("action");
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return jsonResponse(400, { error: "Image file is required" });
      }

      if (action === "uploadTodoImage") {
        const todoId = formData.get("todoId");
        if (typeof todoId !== "string") {
          return jsonResponse(400, { error: "todoId is required" });
        }

        const key = buildTodoImageKey(todoId, file.name);
        await config.s3Client.send(
          new PutObjectCommand({
            Bucket: config.bucketName,
            Key: key,
            Body: await readFileBytes(file),
            ContentType: file.type || "image/jpeg",
          })
        );

        return jsonResponse(200, { key });
      }

      if (action === "uploadAvatar") {
        const key = buildAvatarKey(userId, file.name);
        await config.s3Client.send(
          new PutObjectCommand({
            Bucket: config.bucketName,
            Key: key,
            Body: await readFileBytes(file),
            ContentType: file.type || "image/jpeg",
          })
        );

        await Promise.allSettled(
          R2_IMAGE_EXTENSIONS
            .map((extension) => `users/${userId}/avatar.${extension}`)
            .filter((avatarKey) => avatarKey !== key)
            .map((avatarKey) => deleteKeyIfPresent(config, avatarKey))
        );

        return jsonResponse(200, { key });
      }

      return jsonResponse(400, { error: "Unsupported upload action" });
    }

    const body = (await request.json()) as {
      action?: string;
      key?: string;
      userId?: string;
    };

    if (body.action === "getUrl") {
      if (!body.key) return jsonResponse(400, { error: "key is required" });

      const key = normalizeR2Key(body.key, config.bucketName);
      if (!canAccessR2Key(key, userId)) {
        return jsonResponse(403, { error: "Forbidden" });
      }

      return jsonResponse(200, { url: await getSignedImageUrl(config, key) });
    }

    if (body.action === "delete") {
      if (!body.key) return jsonResponse(400, { error: "key is required" });

      const key = normalizeR2Key(body.key, config.bucketName);
      if (!canAccessR2Key(key, userId)) {
        return jsonResponse(403, { error: "Forbidden" });
      }

      await deleteKeyIfPresent(config, key);
      return jsonResponse(200, { success: true });
    }

    if (body.action === "getAvatar") {
      const requestedUserId = body.userId || userId;
      if (requestedUserId !== userId) {
        return jsonResponse(403, { error: "Forbidden" });
      }

      for (const extension of R2_IMAGE_EXTENSIONS) {
        const key = `users/${requestedUserId}/avatar.${extension}`;
        if (!isAvatarKeyForUser(key, userId)) continue;

        try {
          await config.s3Client.send(
            new HeadObjectCommand({
              Bucket: config.bucketName,
              Key: key,
            })
          );

          return jsonResponse(200, { url: await getSignedImageUrl(config, key), key });
        } catch (error: any) {
          if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
            continue;
          }
          throw error;
        }
      }

      return jsonResponse(200, { url: null });
    }

    return jsonResponse(400, { error: "Unsupported action" });
  } catch (error) {
    console.error("R2 API error:", error);
    return jsonResponse(500, { error: "R2 operation failed" });
  }
}
