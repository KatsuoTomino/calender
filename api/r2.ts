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
  getAvatarUserIdFromKey,
  isSafeR2Key,
  normalizeR2Key,
} from "../utils/r2Keys";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

function getRequiredEnv(name: string, fallbackName?: string): string {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function createR2Client(): { client: S3Client; bucketName: string } {
  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getRequiredEnv("R2_BUCKET_NAME");
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

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
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) {
    return jsonResponse({ error: "Authentication required" }, { status: 401 });
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Supabase公式ドキュメント: getUser(jwt) はAuthサーバーへ問い合わせるため、
  // クライアントから渡されたJWTをサーバー側認可の根拠にできる。
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return jsonResponse({ error: "Invalid session" }, { status: 401 });
  }

  return { id: data.user.id };
}

function ensureKeyAllowedForUser(key: string, userId: string): Response | null {
  if (!isSafeR2Key(key)) {
    return jsonResponse({ error: "Invalid object key" }, { status: 400 });
  }

  const avatarUserId = getAvatarUserIdFromKey(key);
  if (avatarUserId && avatarUserId !== userId) {
    return jsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

async function getPresignedImageUrl(client: S3Client, bucketName: string, key: string): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn: 3600 * 24 * 7 }
  );
}

async function handleGet(request: Request, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const { client, bucketName } = createR2Client();

  if (action === "avatar") {
    const requestedUserId = url.searchParams.get("userId");
    if (requestedUserId && requestedUserId !== userId) {
      return jsonResponse({ error: "Forbidden" }, { status: 403 });
    }

    for (const ext of AVATAR_EXTENSIONS) {
      const key = `users/${userId}/avatar.${ext}`;
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
        return jsonResponse({
          key,
          url: await getPresignedImageUrl(client, bucketName, key),
        });
      } catch (error: any) {
        if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
          continue;
        }
        throw error;
      }
    }

    return jsonResponse({ key: null, url: null });
  }

  const key = normalizeR2Key(url.searchParams.get("key") || "", bucketName);
  const keyError = ensureKeyAllowedForUser(key, userId);
  if (keyError) return keyError;

  return jsonResponse({
    key,
    url: await getPresignedImageUrl(client, bucketName, key),
  });
}

async function handleUpload(request: Request, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const fileName = url.searchParams.get("fileName") || "image.jpg";
  const { client, bucketName } = createR2Client();
  const bytes = new Uint8Array(await request.arrayBuffer());

  if (bytes.byteLength === 0) {
    return jsonResponse({ error: "Empty upload" }, { status: 400 });
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: "File too large" }, { status: 413 });
  }

  const key =
    type === "avatar"
      ? buildAvatarKey(userId, fileName)
      : buildTodoImageKey(url.searchParams.get("todoId") || "", fileName);

  const keyError = ensureKeyAllowedForUser(key, userId);
  if (keyError) return keyError;

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: bytes,
      ContentType: request.headers.get("content-type") || "image/jpeg",
    })
  );

  return jsonResponse({
    key,
    url: await getPresignedImageUrl(client, bucketName, key),
  });
}

async function handleDelete(request: Request, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const { client, bucketName } = createR2Client();
  const key = normalizeR2Key(url.searchParams.get("key") || "", bucketName);
  const keyError = ensureKeyAllowedForUser(key, userId);
  if (keyError) return keyError;

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
      const authResult = await authenticate(request);
      if (authResult instanceof Response) return authResult;

      if (request.method === "GET") {
        return handleGet(request, authResult.id);
      }
      if (request.method === "POST") {
        return handleUpload(request, authResult.id);
      }
      if (request.method === "DELETE") {
        return handleDelete(request, authResult.id);
      }

      return jsonResponse({ error: "Method not allowed" }, { status: 405 });
    } catch (error) {
      console.error("R2 API error:", error);
      return jsonResponse({ error: "R2 operation failed" }, { status: 500 });
    }
  },
};
