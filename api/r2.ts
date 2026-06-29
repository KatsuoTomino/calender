import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import {
  AVATAR_EXTENSIONS,
  buildAvatarKey,
  buildTodoImageKey,
  canAccessR2Key,
  isUserAvatarKeyForUser,
  normalizeR2Key,
} from "../utils/r2Keys";

type R2Config = {
  bucketName: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type AuthedContext = {
  userId: string;
  s3Client: S3Client;
  bucketName: string;
};

const MAX_TODO_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_IMAGE_BYTES = 5 * 1024 * 1024;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
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

  return { bucketName, endpoint, accessKeyId, secretAccessKey };
}

async function authenticate(request: Request): Promise<AuthedContext | Response> {
  const config = getR2Config();
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!config || !supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "R2 service is not configured" }, 500);
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Supabase docs: getUser(jwt) validates the token with the Auth server.
  // https://supabase.com/docs/reference/javascript/auth-getuser
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  return {
    userId: user.id,
    bucketName: config.bucketName,
    s3Client: new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

function getFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function getImageFile(formData: FormData): File | null {
  const file = formData.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return null;
  }

  return file;
}

async function uploadObject(context: AuthedContext, key: string, file: File): Promise<void> {
  const body = Buffer.from(await file.arrayBuffer());
  await context.s3Client.send(
    new PutObjectCommand({
      Bucket: context.bucketName,
      Key: key,
      Body: body,
      ContentType: file.type || "image/jpeg",
    })
  );
}

async function handleUploadTodo(context: AuthedContext, formData: FormData): Promise<Response> {
  const file = getImageFile(formData);
  const todoId = getFormString(formData, "todoId");
  const key = file ? buildTodoImageKey(todoId, file.name, crypto.randomUUID()) : null;

  if (!file || file.size > MAX_TODO_IMAGE_BYTES || !key) {
    return jsonResponse({ error: "Invalid image upload" }, 400);
  }

  await uploadObject(context, key, file);
  return jsonResponse({ key });
}

async function handleUploadAvatar(context: AuthedContext, formData: FormData): Promise<Response> {
  const file = getImageFile(formData);
  const userId = getFormString(formData, "userId");
  const key = file && userId === context.userId ? buildAvatarKey(userId, file.name) : null;

  if (!file || file.size > MAX_AVATAR_IMAGE_BYTES || !key) {
    return jsonResponse({ error: "Invalid image upload" }, 400);
  }

  await uploadObject(context, key, file);
  return jsonResponse({ key });
}

async function handleGetUrl(context: AuthedContext, body: Record<string, unknown>): Promise<Response> {
  const key = typeof body.key === "string" ? normalizeR2Key(body.key, context.bucketName) : null;
  if (!key || !canAccessR2Key(key, context.userId)) {
    return jsonResponse({ error: "Invalid image key" }, 400);
  }

  const url = await getSignedUrl(
    context.s3Client,
    new GetObjectCommand({
      Bucket: context.bucketName,
      Key: key,
    }),
    { expiresIn: 3600 * 24 * 7 }
  );

  return jsonResponse({ url });
}

async function handleDelete(context: AuthedContext, body: Record<string, unknown>): Promise<Response> {
  const key = typeof body.key === "string" ? normalizeR2Key(body.key, context.bucketName) : null;
  if (!key || !canAccessR2Key(key, context.userId)) {
    return jsonResponse({ error: "Invalid image key" }, 400);
  }

  await context.s3Client.send(
    new DeleteObjectCommand({
      Bucket: context.bucketName,
      Key: key,
    })
  );

  return jsonResponse({ ok: true });
}

async function handleGetAvatar(context: AuthedContext, body: Record<string, unknown>): Promise<Response> {
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (userId !== context.userId) {
    return jsonResponse({ error: "Invalid image key" }, 400);
  }

  for (const extension of AVATAR_EXTENSIONS) {
    const key = `users/${userId}/avatar.${extension}`;
    if (!isUserAvatarKeyForUser(key, context.userId)) {
      continue;
    }

    try {
      await context.s3Client.send(
        new HeadObjectCommand({
          Bucket: context.bucketName,
          Key: key,
        })
      );
      const url = await getSignedUrl(
        context.s3Client,
        new GetObjectCommand({
          Bucket: context.bucketName,
          Key: key,
        }),
        { expiresIn: 3600 * 24 * 7 }
      );
      return jsonResponse({ url, key });
    } catch (error: any) {
      if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return jsonResponse({ url: null });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const context = await authenticate(request);
      if (context instanceof Response) {
        return context;
      }

      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const action = getFormString(formData, "action");
        if (action === "upload-todo") {
          return await handleUploadTodo(context, formData);
        }
        if (action === "upload-avatar") {
          return await handleUploadAvatar(context, formData);
        }
        return jsonResponse({ error: "Unsupported action" }, 400);
      }

      const body = (await request.json()) as Record<string, unknown>;
      if (body.action === "get-url") {
        return await handleGetUrl(context, body);
      }
      if (body.action === "delete") {
        return await handleDelete(context, body);
      }
      if (body.action === "get-avatar") {
        return await handleGetAvatar(context, body);
      }

      return jsonResponse({ error: "Unsupported action" }, 400);
    } catch (error) {
      console.error("R2 API error:", error);
      return jsonResponse({ error: "R2 operation failed" }, 500);
    }
  },
};
