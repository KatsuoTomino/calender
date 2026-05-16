import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const PRESIGNED_URL_TTL_SECONDS = 3600 * 24 * 7;

type AuthContext = {
  userId: string;
};

type R2Config = {
  bucketName: string;
  s3Client: S3Client;
};

const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init?.headers || {}),
    },
  });

const getEnv = (serverName: string, legacyClientName?: string): string | undefined =>
  process.env[serverName] || (legacyClientName ? process.env[legacyClientName] : undefined);

const getR2Config = (): R2Config | null => {
  // Vite docs: VITE_* values are bundled into browser code, so R2 secrets stay in this server function.
  // https://vite.dev/guide/env-and-mode#env-variables
  const accountId = getEnv("R2_ACCOUNT_ID", "VITE_R2_ACCOUNT_ID");
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID", "VITE_R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY", "VITE_R2_SECRET_ACCESS_KEY");
  const bucketName = getEnv("R2_BUCKET_NAME", "VITE_R2_BUCKET_NAME");
  const endpoint =
    getEnv("R2_ENDPOINT", "VITE_R2_ENDPOINT") ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

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
};

const authenticate = async (request: Request): Promise<AuthContext | null> => {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return null;
  }

  const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return { userId: data.user.id };
};

const normalizeKey = (rawKey: string, bucketName: string): string => {
  if (!rawKey || rawKey.length > 1024) {
    throw new Error("Invalid R2 key");
  }

  let key = rawKey;
  if (key.startsWith("http://") || key.startsWith("https://")) {
    const url = new URL(key);
    key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (key.startsWith(`${bucketName}/`)) {
      key = key.slice(bucketName.length + 1);
    }
  }

  key = key.replace(/^\/+/, "");
  if (
    !key ||
    key.includes("..") ||
    key.includes("\\") ||
    /[\0\r\n]/.test(key)
  ) {
    throw new Error("Invalid R2 key");
  }

  return key;
};

const assertAllowedKey = (key: string, auth: AuthContext) => {
  const isTodoImage = /^todos\/[A-Za-z0-9_-]+\/[0-9]+\.[A-Za-z0-9]+$/.test(key);
  const escapedUserId = auth.userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isOwnAvatar = new RegExp(
    `^users/${escapedUserId}/avatar\\.[A-Za-z0-9]+$`
  ).test(key);

  if (!isTodoImage && !isOwnAvatar) {
    throw new Error("R2 key is not allowed");
  }
};

const getImageExtension = (file: File): string => {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  const extension =
    fromName && /^[a-z0-9]{1,10}$/.test(fromName)
      ? fromName
      : file.type.split("/")[1]?.toLowerCase();

  if (!extension || !/^[a-z0-9]{1,10}$/.test(extension)) {
    return "jpg";
  }

  return extension === "jpeg" ? "jpg" : extension;
};

const validateImageFile = (file: File) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded");
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("Image file is too large");
  }
};

const signKey = async (config: R2Config, key: string): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  return getSignedUrl(config.s3Client, command, {
    expiresIn: PRESIGNED_URL_TTL_SECONDS,
  });
};

const findAvatar = async (config: R2Config, auth: AuthContext) => {
  for (const ext of AVATAR_EXTENSIONS) {
    const key = `users/${auth.userId}/avatar.${ext}`;
    try {
      await config.s3Client.send(
        new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        })
      );

      return {
        key,
        url: await signKey(config, key),
      };
    } catch (error: any) {
      if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return { key: null, url: null };
};

const requireContext = async (request: Request): Promise<{
  auth: AuthContext;
  config: R2Config;
} | Response> => {
  const auth = await authenticate(request);
  if (!auth) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getR2Config();
  if (!config) {
    return json({ error: "R2 is not configured" }, { status: 503 });
  }

  return { auth, config };
};

export async function GET(request: Request) {
  const context = await requireContext(request);
  if (context instanceof Response) return context;

  const url = new URL(request.url);

  try {
    if (url.searchParams.get("avatar") === "1") {
      return json(await findAvatar(context.config, context.auth));
    }

    const rawKey = url.searchParams.get("key");
    if (!rawKey) {
      return json({ error: "Missing key" }, { status: 400 });
    }

    const key = normalizeKey(rawKey, context.config.bucketName);
    assertAllowedKey(key, context.auth);

    return json({
      key,
      url: await signKey(context.config, key),
    });
  } catch (error) {
    console.error("R2 URL generation failed:", error);
    return json({ error: "Failed to generate image URL" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const context = await requireContext(request);
  if (context instanceof Response) return context;

  try {
    const form = await request.formData();
    const action = form.get("action");
    const file = form.get("file");

    if (!(file instanceof File)) {
      return json({ error: "Missing file" }, { status: 400 });
    }

    validateImageFile(file);
    const extension = getImageExtension(file);
    let key: string;

    if (action === "avatar") {
      key = `users/${context.auth.userId}/avatar.${extension}`;
    } else if (action === "todo-image") {
      const todoId = String(form.get("todoId") || "");
      if (!/^[A-Za-z0-9_-]+$/.test(todoId)) {
        return json({ error: "Invalid todo id" }, { status: 400 });
      }
      key = `todos/${todoId}/${Date.now()}.${extension}`;
    } else {
      return json({ error: "Invalid action" }, { status: 400 });
    }

    const body = new Uint8Array(await file.arrayBuffer());
    await context.config.s3Client.send(
      new PutObjectCommand({
        Bucket: context.config.bucketName,
        Key: key,
        Body: body,
        ContentType: file.type || "image/jpeg",
      })
    );

    return json({ key });
  } catch (error) {
    console.error("R2 upload failed:", error);
    return json({ error: "Failed to upload image" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const context = await requireContext(request);
  if (context instanceof Response) return context;

  try {
    const url = new URL(request.url);
    const rawKey = url.searchParams.get("key");
    if (!rawKey) {
      return json({ error: "Missing key" }, { status: 400 });
    }

    const key = normalizeKey(rawKey, context.config.bucketName);
    assertAllowedKey(key, context.auth);

    await context.config.s3Client.send(
      new DeleteObjectCommand({
        Bucket: context.config.bucketName,
        Key: key,
      })
    );

    return json({ ok: true });
  } catch (error) {
    console.error("R2 delete failed:", error);
    return json({ error: "Failed to delete image" }, { status: 400 });
  }
}
