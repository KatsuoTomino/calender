import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { getAvatarKeys, isValidR2Key } from "../utils/r2Keys";

type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
};

type R2Action =
  | "createUploadUrl"
  | "getDownloadUrl"
  | "deleteObject"
  | "getAvatar";

type R2RequestBody = {
  action?: R2Action;
  key?: string;
  contentType?: string;
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const endpoint =
  process.env.R2_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined);

function getR2Client(): S3Client {
  if (
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !bucketName ||
    !endpoint
  ) {
    throw new Error("R2 server environment variables are incomplete");
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseBody(body: unknown): R2RequestBody {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body) as R2RequestBody;
  return body as R2RequestBody;
}

function isOwnUserKey(key: string, userId: string): boolean {
  return key.startsWith(`users/${userId}/`);
}

function ensureAllowedKey(key: string, userId: string): void {
  if (!isValidR2Key(key)) {
    throw new Error("Invalid R2 key");
  }
  if (key.startsWith("users/") && !isOwnUserKey(key, userId)) {
    throw new Error("Forbidden R2 key");
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: "Supabase environment variables are incomplete" });
    return;
  }

  const authorization = getHeaderValue(req.headers.authorization);
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Supabase公式docs: auth.getUser(jwt) performs a network request and is suitable
  // for server-side authorization decisions.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  let body: R2RequestBody;
  try {
    body = parseBody(req.body);
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  try {
    const s3Client = getR2Client();

    if (body.action === "getAvatar") {
      for (const key of getAvatarKeys(user.id)) {
        try {
          await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
          const url = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucketName, Key: key }),
            { expiresIn: 3600 * 24 * 7 }
          );
          res.status(200).json({ key, url });
          return;
        } catch (error: any) {
          const statusCode = error?.$metadata?.httpStatusCode;
          if (error?.name === "NotFound" || statusCode === 404) continue;
          throw error;
        }
      }
      res.status(200).json({ key: null, url: null });
      return;
    }

    if (!body.action || !body.key) {
      res.status(400).json({ error: "Missing action or key" });
      return;
    }

    ensureAllowedKey(body.key, user.id);

    if (body.action === "createUploadUrl") {
      if (!body.contentType?.startsWith("image/")) {
        res.status(400).json({ error: "Invalid content type" });
        return;
      }
      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: bucketName,
          Key: body.key,
          ContentType: body.contentType,
        }),
        { expiresIn: 300 }
      );
      res.status(200).json({ key: body.key, uploadUrl });
      return;
    }

    if (body.action === "getDownloadUrl") {
      const url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: bucketName, Key: body.key }),
        { expiresIn: 3600 * 24 * 7 }
      );
      res.status(200).json({ key: body.key, url });
      return;
    }

    if (body.action === "deleteObject") {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: bucketName, Key: body.key })
      );
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "Unsupported action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "R2 operation failed";
    const statusCode = message === "Forbidden R2 key" ? 403 : 500;
    res.status(statusCode).json({ error: message });
  }
}
