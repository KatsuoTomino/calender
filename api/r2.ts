import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { AVATAR_EXTENSIONS, extractR2Key, isAllowedR2Key, buildAvatarKey } from "../utils/r2Keys";

type R2Action = "upload" | "get-url" | "delete" | "get-avatar";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new HttpError(500, `${name} is not configured`);
  }
  return value;
}

function createR2Client() {
  const accountId = getEnv("R2_ACCOUNT_ID");
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    bucketName: getEnv("R2_BUCKET_NAME"),
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: getEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: getEnv("R2_SECRET_ACCESS_KEY"),
      },
    }),
  };
}

async function authenticate(request: Request): Promise<string> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    throw new HttpError(401, "Authentication required");
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new HttpError(500, "Supabase auth is not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new HttpError(401, "Invalid session");
  }

  return user.id;
}

function requireAllowedKey(rawKey: string, bucketName: string, userId: string): string {
  const key = extractR2Key(rawKey, bucketName);
  if (!key || !isAllowedR2Key(key, userId)) {
    throw new HttpError(403, "R2 key is not allowed");
  }

  return key;
}

function readJsonBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Invalid JSON body");
  }

  return body as Record<string, unknown>;
}

async function parseRequest(request: Request): Promise<{
  action: R2Action;
  fields: Record<string, string>;
  file: File | null;
}> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const action = String(form.get("action") || "") as R2Action;
    const fields: Record<string, string> = {};
    for (const [name, value] of form.entries()) {
      if (typeof value === "string") fields[name] = value;
    }

    const maybeFile = form.get("file");
    const file = maybeFile && typeof (maybeFile as File).arrayBuffer === "function"
      ? (maybeFile as File)
      : null;

    return { action, fields, file };
  }

  const fields = readJsonBody(await request.json()) as Record<string, string>;
  return {
    action: String(fields.action || "") as R2Action,
    fields,
    file: null,
  };
}

async function signedGetUrl(client: S3Client, bucketName: string, key: string, expiresIn = 604800): Promise<string> {
  const safeExpiresIn = Math.min(Math.max(expiresIn, 60), 604800);
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn: safeExpiresIn }
  );
}

function isNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404;
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      const userId = await authenticate(request);
      const { bucketName, client } = createR2Client();
      const { action, fields, file } = await parseRequest(request);

      if (action === "upload") {
        if (!file) {
          throw new HttpError(400, "File is required");
        }

        const key = requireAllowedKey(String(fields.key || ""), bucketName, userId);
        const body = new Uint8Array(await file.arrayBuffer());

        await client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: body,
            ContentType: fields.contentType || file.type || "application/octet-stream",
          })
        );

        return json({ key });
      }

      if (action === "get-url") {
        const key = requireAllowedKey(String(fields.key || ""), bucketName, userId);
        const expiresIn = Number(fields.expiresIn || 604800);
        const url = await signedGetUrl(client, bucketName, key, Number.isFinite(expiresIn) ? expiresIn : 604800);
        return json({ url });
      }

      if (action === "delete") {
        const key = requireAllowedKey(String(fields.key || ""), bucketName, userId);
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
          })
        );
        return json({ deleted: true });
      }

      if (action === "get-avatar") {
        const requestedUserId = String(fields.userId || "");
        if (requestedUserId !== userId) {
          throw new HttpError(403, "Avatar access is not allowed");
        }

        for (const extension of AVATAR_EXTENSIONS) {
          const key = buildAvatarKey(userId, extension);
          try {
            await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
            return json({ key, url: await signedGetUrl(client, bucketName, key) });
          } catch (error) {
            if (isNotFound(error)) continue;
            throw error;
          }
        }

        return json({ key: null, url: null });
      }

      throw new HttpError(400, "Unknown action");
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
      }

      console.error("R2 API error:", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
};
