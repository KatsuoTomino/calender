import type { IncomingMessage, ServerResponse } from "node:http";
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
  createAvatarCandidateKeys,
  normalizeR2Key,
} from "../utils/r2Keys";

type QueryValue = string | string[] | undefined;

type ApiRequest = IncomingMessage & {
  query?: Record<string, QueryValue>;
  body?: unknown;
};

type ApiResponse = ServerResponse & {
  status?: (statusCode: number) => ApiResponse;
  json?: (body: unknown) => void;
  send?: (body: unknown) => void;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PRESIGNED_URL_EXPIRES_IN_SECONDS = 3600 * 24 * 7;

// Vite docs: only VITE_* env vars are bundled into client code, so R2 credentials stay server-only here.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const endpoint =
  process.env.R2_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

const s3Client =
  endpoint && accessKeyId && secretAccessKey
    ? new S3Client({
        region: "auto",
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      })
    : null;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

function sendJson(res: ApiResponse, statusCode: number, body: unknown): void {
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(statusCode).json(body);
    return;
  }

  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getQueryParam(req: ApiRequest, name: string): string | undefined {
  const value = req.query?.[name];
  if (Array.isArray(value)) return value[0];
  if (value) return value;

  const url = new URL(req.url || "/", "http://localhost");
  return url.searchParams.get(name) || undefined;
}

async function requireAuthenticatedUser(req: ApiRequest): Promise<boolean> {
  if (!supabase) return false;

  const authHeader = req.headers.authorization;
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  return !error && !!user;
}

function getRequiredR2(): { client: S3Client; bucketName: string } | null {
  if (!s3Client || !bucketName) return null;
  return { client: s3Client, bucketName };
}

async function readUploadBody(req: ApiRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body instanceof ArrayBuffer) return Buffer.from(req.body);
  if (typeof req.body === "string") return Buffer.from(req.body);

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_UPLOAD_BYTES) {
      throw new Error("UPLOAD_TOO_LARGE");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

async function getPresignedImageUrl(key: string): Promise<string> {
  const r2 = getRequiredR2();
  if (!r2) throw new Error("R2_NOT_CONFIGURED");

  const command = new GetObjectCommand({
    Bucket: r2.bucketName,
    Key: key,
  });

  return getSignedUrl(r2.client, command, {
    expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!(await requireAuthenticatedUser(req))) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  const r2 = getRequiredR2();
  if (!r2) {
    sendJson(res, 500, { error: "R2 is not configured" });
    return;
  }

  const action = getQueryParam(req, "action");

  try {
    if (req.method === "GET" && action === "getUrl") {
      const key = normalizeR2Key(getQueryParam(req, "key") || "", r2.bucketName);
      if (!key) {
        sendJson(res, 400, { error: "Invalid image key" });
        return;
      }

      const url = await getPresignedImageUrl(key);
      sendJson(res, 200, { key, url });
      return;
    }

    if (req.method === "GET" && action === "getAvatar") {
      const userId = getQueryParam(req, "userId") || "";
      if (!userId) {
        sendJson(res, 400, { error: "Missing userId" });
        return;
      }

      for (const candidateKey of createAvatarCandidateKeys(userId)) {
        const key = normalizeR2Key(candidateKey, r2.bucketName);
        if (!key) continue;

        try {
          await r2.client.send(
            new HeadObjectCommand({
              Bucket: r2.bucketName,
              Key: key,
            })
          );
          const url = await getPresignedImageUrl(key);
          sendJson(res, 200, { key, url });
          return;
        } catch (error: any) {
          if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
            continue;
          }
          throw error;
        }
      }

      sendJson(res, 200, { key: null, url: null });
      return;
    }

    if (req.method === "POST" && action === "upload") {
      const key = normalizeR2Key(getQueryParam(req, "key") || "", r2.bucketName);
      if (!key) {
        sendJson(res, 400, { error: "Invalid image key" });
        return;
      }

      const body = await readUploadBody(req);
      if (body.length === 0) {
        sendJson(res, 400, { error: "Missing upload body" });
        return;
      }
      if (body.length > MAX_UPLOAD_BYTES) {
        sendJson(res, 413, { error: "File is too large" });
        return;
      }

      await r2.client.send(
        new PutObjectCommand({
          Bucket: r2.bucketName,
          Key: key,
          Body: body,
          ContentType: req.headers["content-type"] || "application/octet-stream",
        })
      );

      sendJson(res, 200, { key });
      return;
    }

    if (req.method === "DELETE" && action === "delete") {
      const key = normalizeR2Key(getQueryParam(req, "key") || "", r2.bucketName);
      if (!key) {
        sendJson(res, 400, { error: "Invalid image key" });
        return;
      }

      await r2.client.send(
        new DeleteObjectCommand({
          Bucket: r2.bucketName,
          Key: key,
        })
      );

      sendJson(res, 200, { key, deleted: true });
      return;
    }

    sendJson(res, 405, { error: "Unsupported R2 action" });
  } catch (error: any) {
    if (error?.message === "UPLOAD_TOO_LARGE") {
      sendJson(res, 413, { error: "File is too large" });
      return;
    }

    console.error("R2 API error:", error);
    sendJson(res, 500, { error: "R2 operation failed" });
  }
}
