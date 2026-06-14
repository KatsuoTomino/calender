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
  createAvatarKey,
  createTodoImageKey,
  isAllowedR2Key,
  isUserAvatarKey,
  normalizeR2Key,
} from "../utils/r2Keys";

const MAX_TODO_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

type R2Config = {
  bucketName: string;
  client: S3Client;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const configuredEndpoint = process.env.R2_ENDPOINT;
  const endpoint = configuredEndpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

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

async function authenticate(request: Request): Promise<{ id: string } | Response> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";

  if (!supabaseUrl || !supabaseAnonKey || !token) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Supabase docs: auth.getUser(jwt) performs a network validation of the JWT for authorization decisions.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return { id: user.id };
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value && "type" in value;
}

function assertImageFile(file: File, maxBytes: number): Response | null {
  if (!file.type.startsWith("image/")) {
    return jsonResponse({ error: "Only image files are allowed" }, 400);
  }

  if (file.size > maxBytes) {
    return jsonResponse({ error: "Image file is too large" }, 413);
  }

  return null;
}

async function putFile(config: R2Config, key: string, file: File): Promise<void> {
  const body = Buffer.from(await file.arrayBuffer());

  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: body,
      ContentType: file.type || "image/jpeg",
    })
  );
}

async function signedUrlForKey(config: R2Config, key: string): Promise<string> {
  return getSignedUrl(
    config.client,
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
    { expiresIn: 3600 * 24 * 7 }
  );
}

async function handleUploadTodoImage(config: R2Config, formData: FormData): Promise<Response> {
  const todoId = String(formData.get("todoId") || "");
  const file = formData.get("file");
  if (!todoId || !isFileLike(file)) {
    return jsonResponse({ error: "todoId and file are required" }, 400);
  }

  const fileError = assertImageFile(file, MAX_TODO_IMAGE_BYTES);
  if (fileError) return fileError;

  const key = createTodoImageKey(todoId, file.name, `${Date.now()}-${crypto.randomUUID()}`);
  if (!key) {
    return jsonResponse({ error: "Invalid todo image key" }, 400);
  }

  await putFile(config, key, file);
  return jsonResponse({ key });
}

async function handleUploadAvatar(config: R2Config, formData: FormData, userId: string): Promise<Response> {
  const requestedUserId = String(formData.get("userId") || userId);
  const file = formData.get("file");
  if (requestedUserId !== userId || !isFileLike(file)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const fileError = assertImageFile(file, MAX_AVATAR_BYTES);
  if (fileError) return fileError;

  const key = createAvatarKey(userId, file.name);
  if (!key) {
    return jsonResponse({ error: "Invalid avatar key" }, 400);
  }

  await putFile(config, key, file);
  return jsonResponse({ key });
}

async function handleSignedUrl(config: R2Config, formData: FormData, userId: string): Promise<Response> {
  const key = normalizeR2Key(String(formData.get("key") || ""), config.bucketName);
  if (!key || !isAllowedR2Key(key)) {
    return jsonResponse({ error: "Invalid image key" }, 400);
  }

  if (key.startsWith("users/") && !isUserAvatarKey(key, userId)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  return jsonResponse({ url: await signedUrlForKey(config, key) });
}

async function handleDelete(config: R2Config, formData: FormData, userId: string): Promise<Response> {
  const key = normalizeR2Key(String(formData.get("key") || ""), config.bucketName);
  if (!key || !isAllowedR2Key(key)) {
    return jsonResponse({ error: "Invalid image key" }, 400);
  }

  if (key.startsWith("users/") && !isUserAvatarKey(key, userId)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  await config.client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
  );

  return jsonResponse({ deleted: true });
}

async function handleAvatarUrl(config: R2Config, formData: FormData, userId: string): Promise<Response> {
  const requestedUserId = String(formData.get("userId") || userId);
  if (requestedUserId !== userId) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  for (const extension of AVATAR_EXTENSIONS) {
    const key = `users/${userId}/avatar.${extension}`;
    try {
      await config.client.send(
        new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        })
      );
      return jsonResponse({ url: await signedUrlForKey(config, key), key });
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
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

    const config = getR2Config();
    if (!config) {
      return jsonResponse({ error: "R2 is not configured" }, 503);
    }

    const authResult = await authenticate(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    try {
      const formData = await request.formData();
      const action = String(formData.get("action") || "");

      switch (action) {
        case "uploadTodoImage":
          return await handleUploadTodoImage(config, formData);
        case "uploadAvatar":
          return await handleUploadAvatar(config, formData, authResult.id);
        case "signedUrl":
          return await handleSignedUrl(config, formData, authResult.id);
        case "delete":
          return await handleDelete(config, formData, authResult.id);
        case "avatarUrl":
          return await handleAvatarUrl(config, formData, authResult.id);
        default:
          return jsonResponse({ error: "Unknown action" }, 400);
      }
    } catch (error) {
      console.error("R2 API error:", error);
      return jsonResponse({ error: "R2 operation failed" }, 500);
    }
  },
};
