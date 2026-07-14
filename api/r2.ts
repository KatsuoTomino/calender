import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Single R2 function (Hobby ≤12 limit). All helpers are inlined — relative
 * imports of api/_lib crash on Vercel Vite deploys (module not packaged).
 * Routed via ?op= or vercel/vite rewrite from /api/r2/<op>.
 */

const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const TODO_KEY = /^todos\/[^/]+\/[^/]+$/;
const USER_AVATAR_KEY = /^users\/[^/]+\/avatar\.[a-z0-9]+$/i;
const USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PRESIGN_KEYS = 50;
const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

type AwsBundle = {
  S3Client: new (config: Record<string, unknown>) => {
    send: (command: unknown) => Promise<unknown>;
  };
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
  HeadObjectCommand: new (input: Record<string, unknown>) => unknown;
  getSignedUrl: (
    client: unknown,
    command: unknown,
    options: { expiresIn: number }
  ) => Promise<string>;
};

let awsBundle: AwsBundle | null = null;
let r2Client: InstanceType<AwsBundle["S3Client"]> | null = null;

async function loadAws(): Promise<AwsBundle> {
  if (awsBundle) return awsBundle;
  const s3 = await import("@aws-sdk/client-s3");
  const signer = await import("@aws-sdk/s3-request-presigner");
  awsBundle = {
    S3Client: s3.S3Client as unknown as AwsBundle["S3Client"],
    PutObjectCommand: s3.PutObjectCommand as unknown as AwsBundle["PutObjectCommand"],
    GetObjectCommand: s3.GetObjectCommand as unknown as AwsBundle["GetObjectCommand"],
    DeleteObjectCommand:
      s3.DeleteObjectCommand as unknown as AwsBundle["DeleteObjectCommand"],
    HeadObjectCommand: s3.HeadObjectCommand as unknown as AwsBundle["HeadObjectCommand"],
    getSignedUrl: signer.getSignedUrl as unknown as AwsBundle["getSignedUrl"],
  };
  return awsBundle;
}

async function getR2Client() {
  if (r2Client) return r2Client;
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  try {
    const { S3Client } = await loadAws();
    // https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
    r2Client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  } catch (error) {
    console.error("Failed to init R2 client:", error);
    return null;
  }
  return r2Client;
}

function getBucketName() {
  return process.env.R2_BUCKET_NAME?.trim() || "";
}

async function getAuthUser(req: VercelRequest): Promise<{ id: string } | null> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return { id: user.id };
  } catch (error) {
    console.error("Auth load/verify failed:", error);
    return null;
  }
}

function isSafeObjectKey(key: unknown): key is string {
  if (typeof key !== "string" || !key) return false;
  if (key.includes("..") || key.includes("\\") || key.startsWith("/")) return false;
  if (key.length > 512) return false;
  return TODO_KEY.test(key) || USER_AVATAR_KEY.test(key);
}

function isAllowedImageContentType(contentType: unknown): contentType is string {
  return (
    typeof contentType === "string" &&
    IMAGE_CONTENT_TYPES.has(contentType.toLowerCase())
  );
}

function isValidUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID.test(userId);
}

function authorizeObjectKey(
  key: string,
  authUserId: string,
  mode: "read" | "write"
): { ok: true } | { ok: false; status: 400 | 403; error: string } {
  if (!isSafeObjectKey(key)) {
    return { ok: false, status: 400, error: "Invalid key" };
  }
  if (key.startsWith("users/")) {
    const ownerId = key.split("/")[1];
    if (!isValidUserId(ownerId)) {
      return { ok: false, status: 400, error: "Invalid key" };
    }
    if (mode === "write" && ownerId !== authUserId) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
  }
  return { ok: true };
}

function denyKeyAccess(
  res: VercelResponse,
  access: { ok: true } | { ok: false; status: 400 | 403; error: string }
): boolean {
  if (access.ok) return false;
  res.status(access.status).json({ error: access.error });
  return true;
}

function getOp(req: VercelRequest): string {
  const q = req.query?.op;
  if (typeof q === "string" && q) return q;
  if (Array.isArray(q) && q[0]) return q[0];
  // Fallback: last path segment of /api/r2/<op>
  const path = (req.url || "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return last && last !== "r2" ? last : "";
}

async function handlePing(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ ok: true, route: "r2" });
}

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  if (!(await getAuthUser(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const client = await getR2Client();
  const bucket = getBucketName();
  return res.status(200).json({
    r2Configured: Boolean(client && bucket),
    bucketSet: Boolean(bucket),
  });
}

async function handlePresignUpload(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { key, contentType } = req.body ?? {};
  if (!key || !contentType) {
    return res.status(400).json({ error: "key and contentType are required" });
  }
  if (!isAllowedImageContentType(contentType)) {
    return res.status(400).json({ error: "Unsupported contentType" });
  }
  const access = authorizeObjectKey(key, user.id, "write");
  if (denyKeyAccess(res, access)) return;

  const client = await getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    const aws = await loadAws();
    const command = new aws.PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await aws.getSignedUrl(client, command, { expiresIn: 600 });
    return res.json({ url, key });
  } catch (error) {
    console.error("Presign upload error:", error);
    return res.status(500).json({ error: "Failed to generate upload URL" });
  }
}

async function handlePresignGet(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { key, keys } = req.body ?? {};
  const client = await getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    const aws = await loadAws();
    if (keys && Array.isArray(keys)) {
      if (keys.length === 0 || keys.length > MAX_PRESIGN_KEYS) {
        return res.status(400).json({
          error: `keys must contain 1-${MAX_PRESIGN_KEYS} items`,
        });
      }
      const urls: Record<string, string> = {};
      for (const k of keys) {
        const access = authorizeObjectKey(k, user.id, "read");
        if (denyKeyAccess(res, access)) return;
        const command = new aws.GetObjectCommand({ Bucket: bucket, Key: k });
        urls[k] = await aws.getSignedUrl(client, command, { expiresIn: 3600 });
      }
      return res.json({ urls });
    }

    if (!key) {
      return res.status(400).json({ error: "key or keys is required" });
    }
    const access = authorizeObjectKey(key, user.id, "read");
    if (denyKeyAccess(res, access)) return;

    const command = new aws.GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await aws.getSignedUrl(client, command, { expiresIn: 3600 });
    return res.json({ url });
  } catch (error) {
    console.error("Presign get error:", error);
    return res.status(500).json({ error: "Failed to generate download URL" });
  }
}

async function handleUpload(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { key, contentType, data } = req.body ?? {};
  if (!key || !contentType || !data) {
    return res
      .status(400)
      .json({ error: "key, contentType and data are required" });
  }
  if (!isAllowedImageContentType(contentType)) {
    return res.status(400).json({ error: "Unsupported contentType" });
  }
  const access = authorizeObjectKey(key, user.id, "write");
  if (denyKeyAccess(res, access)) return;

  const client = await getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    const body = Buffer.from(String(data), "base64");
    if (!body.length) {
      return res.status(400).json({ error: "Empty body" });
    }
    if (body.length > 3 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (max 3MB)" });
    }
    const aws = await loadAws();
    const command = new aws.PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: String(contentType).toLowerCase(),
    });
    await client.send(command);
    return res.json({ key });
  } catch (error) {
    console.error("R2 upload error:", error);
    return res.status(500).json({ error: "Failed to upload" });
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { key } = req.body ?? {};
  if (!key) return res.status(400).json({ error: "key is required" });

  const access = authorizeObjectKey(key, user.id, "write");
  if (denyKeyAccess(res, access)) return;

  const client = await getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    const aws = await loadAws();
    const command = new aws.DeleteObjectCommand({ Bucket: bucket, Key: key });
    await client.send(command);
    return res.json({ success: true });
  } catch (error) {
    console.error("R2 delete error:", error);
    return res.status(500).json({ error: "Failed to delete object" });
  }
}

async function handleFindAvatar(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { userId } = req.body ?? {};
  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "Valid userId is required" });
  }

  const client = await getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    const aws = await loadAws();
    for (const ext of AVATAR_EXTENSIONS) {
      const avatarKey = `users/${userId}/avatar.${ext}`;
      try {
        const head = new aws.HeadObjectCommand({
          Bucket: bucket,
          Key: avatarKey,
        });
        await client.send(head);
        const getCommand = new aws.GetObjectCommand({
          Bucket: bucket,
          Key: avatarKey,
        });
        const url = await aws.getSignedUrl(client, getCommand, {
          expiresIn: 3600,
        });
        return res.json({ url, key: avatarKey });
      } catch (error: any) {
        if (
          error.name === "NotFound" ||
          error.$metadata?.httpStatusCode === 404
        ) {
          continue;
        }
        throw error;
      }
    }
    return res.json({ url: null, key: null });
  } catch (error) {
    console.error("Find avatar error:", error);
    return res.status(500).json({ error: "Failed to find avatar" });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = getOp(req);

  if (op === "ping") {
    return handlePing(req, res);
  }
  if (op === "status") {
    if (req.method !== "GET" && req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    return handleStatus(req, res);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  switch (op) {
    case "presign-upload":
      return handlePresignUpload(req, res);
    case "presign-get":
      return handlePresignGet(req, res);
    case "upload":
      return handleUpload(req, res);
    case "delete":
      return handleDelete(req, res);
    case "find-avatar":
      return handleFindAvatar(req, res);
    default:
      return res.status(404).json({ error: "Unknown R2 operation", op });
  }
}
