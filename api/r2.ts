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
  AVATAR_EXTENSIONS,
  isReadableR2Key,
  isWritableR2Key,
  normalizeR2Key,
} from "../utils/r2Keys";

type R2RequestBody = {
  action?: string;
  key?: string;
  contentType?: string;
  expiresIn?: number;
  userId?: string;
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
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

function getSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new HttpError(500, "Supabase server configuration is incomplete");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function authenticate(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    throw new HttpError(401, "Authentication required");
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new HttpError(401, "Invalid session");
  }

  return user.id;
}

function getR2Config() {
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getEnv("R2_BUCKET_NAME");
  const endpoint =
    process.env.R2_ENDPOINT ??
    `https://${getEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return { client, bucketName };
}

function clampExpiresIn(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(60, Math.min(Math.floor(value), max));
}

async function handlePost(request: Request): Promise<Response> {
  const userId = await authenticate(request);
  const body = (await request.json()) as R2RequestBody;
  const { client, bucketName } = getR2Config();

  if (body.action === "getAvatar") {
    if (body.userId !== userId) {
      throw new HttpError(403, "Cannot access another user's avatar");
    }

    for (const ext of AVATAR_EXTENSIONS) {
      const key = `users/${userId}/avatar.${ext}`;
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
        const url = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: bucketName, Key: key }),
          { expiresIn: 60 * 60 * 24 * 7 }
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

  const key = body.key ? normalizeR2Key(body.key, bucketName) : null;
  if (!key) {
    throw new HttpError(400, "Invalid R2 key");
  }

  if (!isWritableR2Key(key, userId)) {
    throw new HttpError(403, "R2 key is not allowed");
  }

  switch (body.action) {
    case "presignPut": {
      if (!body.contentType?.startsWith("image/")) {
        throw new HttpError(400, "Only image uploads are allowed");
      }

      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: body.contentType,
        }),
        { expiresIn: 60 * 15 }
      );
      return jsonResponse({ uploadUrl, key });
    }

    case "presignGet": {
      if (!isReadableR2Key(key, userId)) {
        throw new HttpError(403, "R2 key is not readable");
      }

      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
        { expiresIn: clampExpiresIn(body.expiresIn, 60 * 60 * 24 * 7, 60 * 60 * 24 * 7) }
      );
      return jsonResponse({ url });
    }

    case "delete": {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
      return jsonResponse({ success: true });
    }

    default:
      throw new HttpError(400, "Unsupported R2 action");
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      return await handlePost(request);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, error.status);
      }
      console.error("R2 API error:", error);
      return jsonResponse({ error: "R2 operation failed" }, 500);
    }
  },
};
