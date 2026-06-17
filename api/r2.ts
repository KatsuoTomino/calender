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
  extractR2Key,
  isAllowedR2KeyForUser,
  R2_AVATAR_EXTENSIONS,
} from "../utils/r2Keys";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_TODO_IMAGE_BYTES = 10 * 1024 * 1024;
const PRESIGNED_URL_EXPIRES_SECONDS = 3600 * 24 * 7;

interface R2Config {
  bucketName: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

interface AuthenticatedUser {
  id: string;
}

let cachedClient: S3Client | null = null;
let cachedEndpoint: string | null = null;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

function getR2Config(): R2Config {
  const bucketName = process.env.R2_BUCKET_NAME;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : undefined);

  if (!bucketName || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("R2サーバー環境変数が設定されていません");
  }

  return { bucketName, endpoint, accessKeyId, secretAccessKey };
}

function getR2Client(config: R2Config): S3Client {
  if (cachedClient && cachedEndpoint === config.endpoint) {
    return cachedClient;
  }

  cachedEndpoint = config.endpoint;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedClient;
}

async function authenticate(request: Request): Promise<AuthenticatedUser | Response> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return jsonResponse(401, { error: "認証が必要です" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(500, { error: "Supabaseサーバー環境変数が設定されていません" });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Supabase公式ドキュメントでは、サーバー側ではgetSessionではなく
  // getUserでJWTを再検証することが推奨されています。
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return jsonResponse(401, { error: "認証トークンが無効です" });
  }

  return { id: data.user.id };
}

function getFormFile(formData: FormData): File | Response {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonResponse(400, { error: "画像ファイルがありません" });
  }
  return file;
}

function validateImageFile(file: File, maxBytes: number): Response | null {
  if (file.type && !file.type.startsWith("image/")) {
    return jsonResponse(400, { error: "画像ファイルのみアップロードできます" });
  }

  if (file.size > maxBytes) {
    return jsonResponse(400, { error: "画像サイズが上限を超えています" });
  }

  return null;
}

async function uploadObject(
  client: S3Client,
  bucketName: string,
  key: string,
  file: File
): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: new Uint8Array(arrayBuffer),
      ContentType: file.type || "image/jpeg",
    })
  );
}

async function createPresignedUrl(
  client: S3Client,
  bucketName: string,
  key: string,
  expiresIn = PRESIGNED_URL_EXPIRES_SECONDS
): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn }
  );
}

async function handleUploadTodoImage(
  request: Request,
  user: AuthenticatedUser,
  config: R2Config,
  client: S3Client
): Promise<Response> {
  const formData = await request.formData();
  const todoId = String(formData.get("todoId") || "");
  const file = getFormFile(formData);
  if (file instanceof Response) return file;

  const validationError = validateImageFile(file, MAX_TODO_IMAGE_BYTES);
  if (validationError) return validationError;

  const key = buildTodoImageKey(todoId, Date.now(), file.name);
  if (!isAllowedR2KeyForUser(key, user.id)) {
    return jsonResponse(403, { error: "このR2キーは使用できません" });
  }

  await uploadObject(client, config.bucketName, key, file);
  return jsonResponse(200, { key });
}

async function handleUploadAvatar(
  request: Request,
  user: AuthenticatedUser,
  config: R2Config,
  client: S3Client
): Promise<Response> {
  const formData = await request.formData();
  const requestedUserId = formData.get("userId");
  if (requestedUserId && requestedUserId !== user.id) {
    return jsonResponse(403, { error: "他のユーザーのアバターは更新できません" });
  }

  const file = getFormFile(formData);
  if (file instanceof Response) return file;

  const validationError = validateImageFile(file, MAX_AVATAR_BYTES);
  if (validationError) return validationError;

  const key = buildAvatarKey(user.id, file.name);
  await uploadObject(client, config.bucketName, key, file);
  return jsonResponse(200, { key });
}

async function handleJsonAction(
  request: Request,
  user: AuthenticatedUser,
  config: R2Config,
  client: S3Client
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    key?: string;
    userId?: string;
    expiresIn?: number;
  } | null;

  if (!body?.action) {
    return jsonResponse(400, { error: "actionが指定されていません" });
  }

  if (body.action === "getAvatar") {
    if (body.userId && body.userId !== user.id) {
      return jsonResponse(403, { error: "他のユーザーのアバターは取得できません" });
    }

    for (const ext of R2_AVATAR_EXTENSIONS) {
      const key = `users/${user.id}/avatar.${ext}`;
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key }));
        const url = await createPresignedUrl(client, config.bucketName, key);
        return jsonResponse(200, { url, key });
      } catch (error: any) {
        if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
          continue;
        }
        throw error;
      }
    }

    return jsonResponse(200, { url: null });
  }

  if (!body.key) {
    return jsonResponse(400, { error: "R2キーが指定されていません" });
  }

  const key = extractR2Key(body.key, config.bucketName);
  if (!isAllowedR2KeyForUser(key, user.id)) {
    return jsonResponse(403, { error: "このR2キーへのアクセスは許可されていません" });
  }

  if (body.action === "getImageUrl") {
    const expiresIn =
      typeof body.expiresIn === "number" && body.expiresIn > 0
        ? Math.min(body.expiresIn, PRESIGNED_URL_EXPIRES_SECONDS)
        : PRESIGNED_URL_EXPIRES_SECONDS;
    const url = await createPresignedUrl(client, config.bucketName, key, expiresIn);
    return jsonResponse(200, { url });
  }

  if (body.action === "deleteImage") {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
    return jsonResponse(200, { success: true });
  }

  return jsonResponse(400, { error: "未対応のactionです" });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204 });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authenticated = await authenticate(request);
    if (authenticated instanceof Response) return authenticated;

    const config = getR2Config();
    const client = getR2Client(config);
    const contentType = request.headers.get("content-type") || "";
    const action = request.headers.get("x-r2-action");

    if (contentType.includes("multipart/form-data")) {
      if (action === "uploadTodoImage") {
        return handleUploadTodoImage(request, authenticated, config, client);
      }
      if (action === "uploadAvatar") {
        return handleUploadAvatar(request, authenticated, config, client);
      }
      return jsonResponse(400, { error: "未対応のアップロードactionです" });
    }

    return handleJsonAction(request, authenticated, config, client);
  } catch (error) {
    console.error("R2 API error:", error);
    return jsonResponse(500, { error: "R2操作に失敗しました" });
  }
}
