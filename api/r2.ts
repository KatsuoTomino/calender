import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { isUserAvatarKeyForUser, normalizeR2Key } from "../utils/r2Keys";

const R2_PRESIGNED_URL_TTL_SECONDS = 60 * 60;
const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getS3Client(): { client: S3Client; bucketName: string } {
  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getRequiredEnv("R2_BUCKET_NAME");
  const endpoint =
    process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
    bucketName,
  };
}

async function getAuthenticatedUser(req: any) {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase auth environment is not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Supabase docs: getUser(jwt) performs a network validation and is safe for authorization.
  // https://supabase.com/docs/reference/javascript/auth-getuser
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

function parseBody(req: any): Record<string, any> {
  if (!req.body) {
    return {};
  }
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }
  return req.body;
}

function validateContentType(contentType: unknown): string {
  if (typeof contentType !== "string" || !contentType.startsWith("image/")) {
    throw new Error("Only image uploads are allowed");
  }
  return contentType;
}

function assertAllowedKeyForUser(key: string, userId: string): void {
  if (key.startsWith("users/") && !isUserAvatarKeyForUser(key, userId)) {
    throw new Error("Cannot access another user's avatar object");
  }
}

async function findAvatarUrl(
  client: S3Client,
  bucketName: string,
  userId: string
): Promise<string | null> {
  for (const extension of AVATAR_EXTENSIONS) {
    const key = `users/${userId}/avatar.${extension}`;
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
        { expiresIn: R2_PRESIGNED_URL_TTL_SECONDS }
      );
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        continue;
      }
      throw error;
    }
  }

  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = parseBody(req);
    const { client, bucketName } = getS3Client();

    switch (body.action) {
      case "createUploadUrl": {
        const key = normalizeR2Key(String(body.key || ""));
        if (!key) {
          return res.status(400).json({ error: "Invalid key" });
        }
        assertAllowedKeyForUser(key, user.id);

        const contentType = validateContentType(body.contentType);
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: contentType,
        });
        // Cloudflare R2 docs recommend presigned URLs to grant browser access without credentials.
        // https://developers.cloudflare.com/r2/api/s3/presigned-urls/
        const uploadUrl = await getSignedUrl(client, command, {
          expiresIn: R2_PRESIGNED_URL_TTL_SECONDS,
        });
        return res.status(200).json({ uploadUrl, key });
      }

      case "getDownloadUrl": {
        const key = normalizeR2Key(String(body.key || ""));
        if (!key) {
          return res.status(400).json({ error: "Invalid key" });
        }
        assertAllowedKeyForUser(key, user.id);

        const url = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: bucketName, Key: key }),
          { expiresIn: R2_PRESIGNED_URL_TTL_SECONDS }
        );
        return res.status(200).json({ url });
      }

      case "deleteObject": {
        const key = normalizeR2Key(String(body.key || ""));
        if (!key) {
          return res.status(400).json({ error: "Invalid key" });
        }
        assertAllowedKeyForUser(key, user.id);

        await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
        return res.status(200).json({ success: true });
      }

      case "getAvatarUrl": {
        const userId = String(body.userId || "");
        if (userId !== user.id) {
          return res.status(403).json({ error: "Forbidden" });
        }
        const url = await findAvatarUrl(client, bucketName, userId);
        return res.status(200).json({ url });
      }

      default:
        return res.status(400).json({ error: "Unsupported action" });
    }
  } catch (error) {
    console.error("R2 API error:", error);
    return res.status(500).json({ error: "R2 operation failed" });
  }
}
