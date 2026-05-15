import { createClient } from "@supabase/supabase-js";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2Operation = "get" | "put" | "delete" | "head";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const r2Endpoint = process.env.R2_ENDPOINT;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2BucketName = process.env.R2_BUCKET_NAME;

function parseJsonBody(req: any): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function getBearerToken(req: any): string | null {
  const header = req.headers.authorization || req.headers.Authorization;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function getExpiresIn(value: unknown, operation: R2Operation): number {
  const requested = typeof value === "number" ? value : Number(value);
  const defaultExpiry = operation === "get" ? 3600 : 600;
  const expiresIn = Number.isFinite(requested) ? requested : defaultExpiry;
  return Math.max(1, Math.min(expiresIn, 3600));
}

function isAllowedKeyForUser(key: string, userId: string): boolean {
  if (key.includes("..") || key.startsWith("/") || key.endsWith("/")) {
    return false;
  }

  if (key.startsWith("todos/")) return true;
  return key.startsWith(`users/${userId}/`);
}

function createS3Client(): S3Client | null {
  if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: r2Endpoint,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Supabase is not configured" });
  }

  const s3Client = createS3Client();
  if (!s3Client || !r2BucketName) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: "Invalid bearer token" });
  }

  const body = parseJsonBody(req);
  const operation = body.operation as R2Operation;
  const key = typeof body.key === "string" ? body.key : "";
  const contentType =
    typeof body.contentType === "string" ? body.contentType : undefined;

  if (!["get", "put", "delete", "head"].includes(operation)) {
    return res.status(400).json({ error: "Invalid operation" });
  }

  if (!key || !isAllowedKeyForUser(key, user.id)) {
    return res.status(403).json({ error: "Object key is not allowed" });
  }

  if (operation === "put" && !contentType?.startsWith("image/")) {
    return res.status(400).json({ error: "Only image uploads are allowed" });
  }

  const expiresIn = getExpiresIn(body.expiresIn, operation);
  const command =
    operation === "put"
      ? new PutObjectCommand({
          Bucket: r2BucketName,
          Key: key,
          ContentType: contentType,
        })
      : operation === "delete"
        ? new DeleteObjectCommand({ Bucket: r2BucketName, Key: key })
        : operation === "head"
          ? new HeadObjectCommand({ Bucket: r2BucketName, Key: key })
          : new GetObjectCommand({ Bucket: r2BucketName, Key: key });

  const url = await getSignedUrl(s3Client, command, { expiresIn });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ url, key, expiresIn });
}
