import { createClient } from "@supabase/supabase-js";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  R2_IMAGE_EXTENSIONS,
  isAllowedR2KeyForUser,
  isUserAvatarKeyForUser,
  normalizeR2Key,
} from "../utils/r2Keys";

type R2RequestBody =
  | {
      action: "createUploadUrl";
      key: string;
      contentType: string;
    }
  | {
      action: "getDownloadUrl";
      key: string;
    }
  | {
      action: "deleteObject";
      key: string;
    }
  | {
      action: "getAvatarUrl";
      userId: string;
    };

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function getServerEnv(name: string): string | undefined {
  return process.env[name];
}

function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = getServerEnv("SUPABASE_URL") ?? getServerEnv("VITE_SUPABASE_URL");
  const anonKey = getServerEnv("SUPABASE_ANON_KEY") ?? getServerEnv("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function getR2Config(): R2Config | null {
  const accountId = getServerEnv("R2_ACCOUNT_ID");
  const accessKeyId = getServerEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getServerEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getServerEnv("R2_BUCKET_NAME");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint: getServerEnv("R2_ENDPOINT") ?? `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function getAuthenticatedUser(request: Request): Promise<{ id: string } | null> {
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) return null;

  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) {
    return null;
  }

  return { id: data.user.id };
}

function parseBody(request: Request): Promise<R2RequestBody | null> {
  return request.json().catch(() => null) as Promise<R2RequestBody | null>;
}

function resolveAuthorizedKey(rawKey: string, bucketName: string, userId: string): string | null {
  if (typeof rawKey !== "string") return null;
  const key = normalizeR2Key(rawKey, bucketName);
  if (!key || !isAllowedR2KeyForUser(key, userId)) {
    return null;
  }
  return key;
}

async function createDownloadUrl(client: S3Client, bucketName: string, key: string): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn: 3600 * 24 * 7 }
  );
}

async function handleR2Request(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const user = await getAuthenticatedUser(request);
  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const r2Config = getR2Config();
  if (!r2Config) {
    return jsonResponse({ error: "R2 is not configured" }, 500);
  }

  const body = await parseBody(request);
  if (!body?.action) {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  const client = createR2Client(r2Config);

  try {
    switch (body.action) {
      case "createUploadUrl": {
        const key = resolveAuthorizedKey(body.key, r2Config.bucketName, user.id);
        if (!key) {
          return jsonResponse({ error: "Forbidden key" }, 403);
        }
        if (typeof body.contentType !== "string" || !body.contentType.startsWith("image/")) {
          return jsonResponse({ error: "Only image uploads are allowed" }, 400);
        }

        // Vite docs warn that VITE_* values are bundled into client code; keep R2
        // credentials server-only and return a short-lived URL instead.
        const uploadUrl = await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key,
            ContentType: body.contentType,
          }),
          { expiresIn: 300 }
        );

        return jsonResponse({ uploadUrl, key });
      }

      case "getDownloadUrl": {
        const key = resolveAuthorizedKey(body.key, r2Config.bucketName, user.id);
        if (!key) {
          return jsonResponse({ error: "Forbidden key" }, 403);
        }

        const url = await createDownloadUrl(client, r2Config.bucketName, key);
        return jsonResponse({ url });
      }

      case "deleteObject": {
        const key = resolveAuthorizedKey(body.key, r2Config.bucketName, user.id);
        if (!key) {
          return jsonResponse({ error: "Forbidden key" }, 403);
        }

        await client.send(
          new DeleteObjectCommand({
            Bucket: r2Config.bucketName,
            Key: key,
          })
        );
        return jsonResponse({ deleted: true });
      }

      case "getAvatarUrl": {
        if (typeof body.userId !== "string" || body.userId !== user.id) {
          return jsonResponse({ error: "Forbidden user" }, 403);
        }

        for (const extension of R2_IMAGE_EXTENSIONS) {
          const key = `users/${user.id}/avatar.${extension}`;
          if (!isUserAvatarKeyForUser(key, user.id)) continue;

          try {
            await client.send(
              new HeadObjectCommand({
                Bucket: r2Config.bucketName,
                Key: key,
              })
            );
            const url = await createDownloadUrl(client, r2Config.bucketName, key);
            return jsonResponse({ url });
          } catch (error: any) {
            if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
              continue;
            }
            throw error;
          }
        }

        return jsonResponse({ url: null });
      }
    }
  } catch (error) {
    console.error("R2 API error:", error);
    return jsonResponse({ error: "R2 operation failed" }, 500);
  }
}

export default {
  fetch: handleR2Request,
};
