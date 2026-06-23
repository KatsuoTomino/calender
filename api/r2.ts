import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient, type User } from "@supabase/supabase-js";
import { AVATAR_EXTENSIONS, isAllowedR2KeyForUser, normalizeR2Key } from "../utils/r2Keys";

type JsonValue = Record<string, unknown>;

type R2Config = {
  bucketName: string;
  client: S3Client;
};

function json(status: number, body: JsonValue): Response {
  return Response.json(body, { status });
}

function getRequiredEnv(name: string, fallbackName?: string): string {
  const value = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getR2Config(): R2Config {
  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getRequiredEnv("R2_BUCKET_NAME");
  const endpoint = process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`;

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

async function authenticate(request: Request): Promise<{ user: User } | { response: Response }> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { response: json(401, { error: "Authentication required" }) };
  }

  try {
    const supabaseUrl = getRequiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Supabase documents auth.getUser(jwt) as a network-verified user lookup:
    // https://supabase.com/docs/reference/javascript/auth-getuser
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return { response: json(401, { error: "Invalid session" }) };
    }

    return { user: data.user };
  } catch (error) {
    console.error("R2 auth failed:", error);
    return { response: json(500, { error: "Authentication service is not configured" }) };
  }
}

function normalizeAllowedKey(keyOrUrl: unknown, userId: string, bucketName: string): string | null {
  if (typeof keyOrUrl !== "string") return null;

  const key = normalizeR2Key(keyOrUrl, bucketName);
  if (!isAllowedR2KeyForUser(key, userId)) return null;

  return key;
}

async function getAvatarUrl(config: R2Config, userId: string): Promise<Response> {
  for (const extension of AVATAR_EXTENSIONS) {
    const key = `users/${userId}/avatar.${extension}`;
    try {
      await config.client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key }));
      const url = await getSignedUrl(
        config.client,
        new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
        { expiresIn: 3600 }
      );
      return json(200, { key, url });
    } catch (error: any) {
      if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return json(404, { error: "Avatar not found" });
}

// Vercel Functions support Web standard Request/Response handlers:
// https://vercel.com/docs/functions/functions-api-reference
export async function GET(request: Request): Promise<Response> {
  const authResult = await authenticate(request);
  if ("response" in authResult) return authResult.response;

  try {
    const config = getR2Config();
    const url = new URL(request.url);

    if (url.searchParams.get("avatar") === "current") {
      return await getAvatarUrl(config, authResult.user.id);
    }

    const key = normalizeAllowedKey(url.searchParams.get("key"), authResult.user.id, config.bucketName);
    if (!key) {
      return json(400, { error: "Invalid R2 key" });
    }

    const signedUrl = await getSignedUrl(
      config.client,
      new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
      { expiresIn: 3600 }
    );

    return json(200, { key, url: signedUrl });
  } catch (error) {
    console.error("R2 GET failed:", error);
    return json(500, { error: "Failed to create image URL" });
  }
}

export async function POST(request: Request): Promise<Response> {
  const authResult = await authenticate(request);
  if ("response" in authResult) return authResult.response;

  try {
    const config = getR2Config();
    const body = await request.json().catch(() => null);
    const key = normalizeAllowedKey(body?.key, authResult.user.id, config.bucketName);
    const contentType = typeof body?.contentType === "string" ? body.contentType : "";

    if (!key) {
      return json(400, { error: "Invalid R2 key" });
    }
    if (!contentType.startsWith("image/")) {
      return json(400, { error: "Only image uploads are allowed" });
    }

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ContentType: contentType,
    });

    // AWS SDK v3 presigner docs require signed headers to be sent by the client:
    // https://github.com/aws/aws-sdk-js-v3/tree/main/packages/s3-request-presigner
    const uploadUrl = await getSignedUrl(config.client, command, {
      expiresIn: 300,
      signableHeaders: new Set(["content-type"]),
    });

    return json(200, { key, uploadUrl });
  } catch (error) {
    console.error("R2 POST failed:", error);
    return json(500, { error: "Failed to create upload URL" });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const authResult = await authenticate(request);
  if ("response" in authResult) return authResult.response;

  try {
    const config = getR2Config();
    const body = await request.json().catch(() => null);
    const key = normalizeAllowedKey(body?.key, authResult.user.id, config.bucketName);

    if (!key) {
      return json(400, { error: "Invalid R2 key" });
    }

    await config.client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
    return json(200, { key, deleted: true });
  } catch (error) {
    console.error("R2 DELETE failed:", error);
    return json(500, { error: "Failed to delete image" });
  }
}
