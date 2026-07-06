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
  SUPPORTED_IMAGE_EXTENSIONS,
  assertAllowedR2ObjectKeyForUser,
  makeAvatarKey,
} from "../utils/r2Keys";

type R2RequestBody =
  | { action: "create-upload-url"; key: string; contentType: string }
  | { action: "create-read-url"; key: string }
  | { action: "delete-object"; key: string }
  | { action: "get-avatar"; userId: string };

const READ_URL_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;
const UPLOAD_URL_EXPIRES_IN_SECONDS = 60 * 5;

function jsonResponse(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getR2Client(): { client: S3Client; bucketName: string } {
  const endpoint =
    process.env.R2_ENDPOINT ||
    `https://${getRequiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;

  return {
    bucketName: getRequiredEnv("R2_BUCKET_NAME"),
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
      },
    }),
  };
}

async function authenticateRequest(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user.id;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" });
    }

    try {
      const userId = await authenticateRequest(request);
      if (!userId) {
        return jsonResponse(401, { error: "Unauthorized" });
      }

      const body = (await request.json()) as R2RequestBody;
      const { client, bucketName } = getR2Client();

      if (body.action === "get-avatar") {
        if (body.userId !== userId) {
          return jsonResponse(403, { error: "Forbidden" });
        }

        for (const extension of SUPPORTED_IMAGE_EXTENSIONS) {
          const key = makeAvatarKey(userId, `avatar.${extension}`);
          await assertAllowedR2ObjectKeyForUser(key, userId, bucketName);

          try {
            await client.send(
              new HeadObjectCommand({
                Bucket: bucketName,
                Key: key,
              })
            );

            const url = await getSignedUrl(
              client,
              new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
              }),
              { expiresIn: READ_URL_EXPIRES_IN_SECONDS }
            );

            return jsonResponse(200, { key, url });
          } catch (error: any) {
            if (
              error?.name === "NotFound" ||
              error?.$metadata?.httpStatusCode === 404
            ) {
              continue;
            }

            throw error;
          }
        }

        return jsonResponse(200, { key: null, url: null });
      }

      const key = assertAllowedR2ObjectKeyForUser(body.key, userId, bucketName);

      if (body.action === "create-upload-url") {
        if (!body.contentType.startsWith("image/")) {
          return jsonResponse(400, { error: "Only image uploads are allowed" });
        }

        const url = await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            ContentType: body.contentType,
          }),
          { expiresIn: UPLOAD_URL_EXPIRES_IN_SECONDS }
        );

        return jsonResponse(200, { key, url });
      }

      if (body.action === "create-read-url") {
        const url = await getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
          }),
          { expiresIn: READ_URL_EXPIRES_IN_SECONDS }
        );

        return jsonResponse(200, { key, url });
      }

      if (body.action === "delete-object") {
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
          })
        );

        return jsonResponse(200, { key, deleted: true });
      }

      return jsonResponse(400, { error: "Unsupported action" });
    } catch (error) {
      console.error("R2 API error:", error);
      return jsonResponse(500, {
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  },
};
