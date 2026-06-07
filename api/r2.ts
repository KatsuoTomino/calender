import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

interface AuthenticatedUser {
  id: string;
}

interface R2Config {
  bucketName: string;
  s3Client: S3Client;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint =
    process.env.R2_ENDPOINT ??
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
}

async function authenticate(request: Request): Promise<AuthenticatedUser | null> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!supabaseUrl || !supabaseAnonKey || !token) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Supabase docs: auth.getUser(jwt) validates the JWT with the Auth server.
  // https://supabase.com/docs/reference/javascript/auth-getuser
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return { id: user.id };
}

function sanitizeExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension || "jpg";
}

function normalizeObjectKey(value: string, bucketName: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    const url = new URL(value);
    let key = url.pathname.replace(/^\/+/, "");
    if (key.startsWith(`${bucketName}/`)) {
      key = key.slice(bucketName.length + 1);
    }
    return key;
  }

  return value.replace(/^\/+/, "");
}

function isAllowedObjectKey(key: string, userId: string): boolean {
  return key.startsWith("todos/") || key.startsWith(`users/${userId}/`);
}

async function handleUpload(
  request: Request,
  user: AuthenticatedUser,
  config: R2Config
): Promise<Response> {
  const formData = await request.formData();
  const kind = formData.get("kind");
  const ownerId = String(formData.get("ownerId") ?? "");
  const file = formData.get("file");

  if ((kind !== "avatar" && kind !== "todo") || !(file instanceof File)) {
    return json({ error: "Invalid upload request." }, 400);
  }

  if (!file.type.startsWith("image/")) {
    return json({ error: "Only image files are allowed." }, 400);
  }

  const maxSize = kind === "avatar" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return json({ error: "Image file is too large." }, 400);
  }

  const extension = sanitizeExtension(file.name);
  const key =
    kind === "avatar"
      ? `users/${user.id}/avatar.${extension}`
      : `todos/${ownerId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  if (!isAllowedObjectKey(key, user.id)) {
    return json({ error: "Object key is not allowed." }, 403);
  }

  const body = new Uint8Array(await file.arrayBuffer());
  await config.s3Client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: file.type || "image/jpeg",
    })
  );

  return json({ key });
}

async function handleGetUrl(
  imageKey: string,
  user: AuthenticatedUser,
  config: R2Config
): Promise<Response> {
  const key = normalizeObjectKey(imageKey, config.bucketName);
  if (!isAllowedObjectKey(key, user.id)) {
    return json({ error: "Object key is not allowed." }, 403);
  }

  const url = await getSignedUrl(
    config.s3Client,
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
    { expiresIn: 3600 * 24 * 7 }
  );

  return json({ url });
}

async function handleDelete(
  imageKey: string,
  user: AuthenticatedUser,
  config: R2Config
): Promise<Response> {
  const key = normalizeObjectKey(imageKey, config.bucketName);
  if (!isAllowedObjectKey(key, user.id)) {
    return json({ error: "Object key is not allowed." }, 403);
  }

  await config.s3Client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
  );

  return json({ ok: true });
}

async function handleGetAvatar(
  userId: string,
  user: AuthenticatedUser,
  config: R2Config
): Promise<Response> {
  if (userId !== user.id) {
    return json({ error: "Cannot read another user's avatar." }, 403);
  }

  for (const extension of ["jpg", "jpeg", "png", "webp", "gif"]) {
    const key = `users/${user.id}/avatar.${extension}`;

    try {
      await config.s3Client.send(
        new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        })
      );

      const url = await getSignedUrl(
        config.s3Client,
        new GetObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        }),
        { expiresIn: 3600 * 24 * 7 }
      );

      return json({ url });
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return json({ url: null });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const user = await authenticate(request);
    if (!user) {
      return json({ error: "Unauthorized." }, 401);
    }

    const config = getR2Config();
    if (!config) {
      return json({ error: "R2 is not configured." }, 500);
    }

    try {
      const contentType = request.headers.get("content-type") ?? "";
      if (contentType.includes("multipart/form-data")) {
        return await handleUpload(request, user, config);
      }

      const body = await request.json();
      if (body?.action === "getUrl" && typeof body.imageKey === "string") {
        return await handleGetUrl(body.imageKey, user, config);
      }
      if (body?.action === "delete" && typeof body.imageKey === "string") {
        return await handleDelete(body.imageKey, user, config);
      }
      if (body?.action === "getAvatar" && typeof body.userId === "string") {
        return await handleGetAvatar(body.userId, user, config);
      }

      return json({ error: "Invalid R2 action." }, 400);
    } catch (error) {
      console.error("R2 API error:", error);
      return json({ error: "R2 request failed." }, 500);
    }
  },
};
