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
  isAllowedR2KeyForUser,
  isAvatarKeyForUser,
  normalizeR2Key,
  R2_IMAGE_EXTENSIONS,
} from "../utils/r2Keys";

type R2Action =
  | "createUploadUrl"
  | "getDownloadUrl"
  | "getAvatarUrl"
  | "deleteObject";

interface R2RequestBody {
  action?: R2Action;
  key?: string;
  contentType?: string;
  userId?: string;
}

interface R2Config {
  bucketName: string;
  s3Client: S3Client;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    return null;
  }

  return {
    bucketName,
    s3Client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  };
}

async function authenticateRequest(request: Request): Promise<
  | { userId: string }
  | { response: Response }
> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  if (!token) {
    return { response: jsonResponse(401, { error: "認証が必要です" }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { response: jsonResponse(500, { error: "Supabase環境変数が未設定です" }) };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { response: jsonResponse(401, { error: "認証に失敗しました" }) };
  }

  return { userId: data.user.id };
}

function getContentType(contentType: string | undefined): string {
  return contentType?.startsWith("image/") ? contentType : "image/jpeg";
}

async function handleR2Request(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;

  const config = getR2Config();
  if (!config) {
    return jsonResponse(500, { error: "R2環境変数が未設定です" });
  }

  let body: R2RequestBody;
  try {
    body = (await request.json()) as R2RequestBody;
  } catch {
    return jsonResponse(400, { error: "リクエストJSONが不正です" });
  }

  try {
    switch (body.action) {
      case "createUploadUrl": {
        const key = normalizeR2Key(body.key || "", config.bucketName);
        if (!key || !isAllowedR2KeyForUser(key, auth.userId)) {
          return jsonResponse(403, { error: "このR2キーへのアップロードは許可されていません" });
        }

        const contentType = getContentType(body.contentType);
        const command = new PutObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          ContentType: contentType,
        });
        const uploadUrl = await getSignedUrl(config.s3Client, command, { expiresIn: 300 });
        return jsonResponse(200, { uploadUrl, key, contentType });
      }

      case "getDownloadUrl": {
        const key = normalizeR2Key(body.key || "", config.bucketName);
        if (!key || !isAllowedR2KeyForUser(key, auth.userId)) {
          return jsonResponse(403, { error: "このR2キーの取得は許可されていません" });
        }

        const command = new GetObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        });
        const downloadUrl = await getSignedUrl(config.s3Client, command, {
          expiresIn: 3600 * 24 * 7,
        });
        return jsonResponse(200, { downloadUrl, key });
      }

      case "getAvatarUrl": {
        if (!body.userId || body.userId !== auth.userId) {
          return jsonResponse(403, { error: "他ユーザーのアバターは取得できません" });
        }

        for (const extension of R2_IMAGE_EXTENSIONS) {
          const key = `users/${auth.userId}/avatar.${extension}`;
          if (!isAvatarKeyForUser(key, auth.userId)) continue;

          try {
            await config.s3Client.send(
              new HeadObjectCommand({
                Bucket: config.bucketName,
                Key: key,
              })
            );

            const downloadUrl = await getSignedUrl(
              config.s3Client,
              new GetObjectCommand({
                Bucket: config.bucketName,
                Key: key,
              }),
              { expiresIn: 3600 * 24 * 7 }
            );
            return jsonResponse(200, { downloadUrl, key });
          } catch (error: any) {
            if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
              continue;
            }
            throw error;
          }
        }

        return jsonResponse(200, { downloadUrl: null, key: null });
      }

      case "deleteObject": {
        const key = normalizeR2Key(body.key || "", config.bucketName);
        if (!key || !isAllowedR2KeyForUser(key, auth.userId)) {
          return jsonResponse(403, { error: "このR2キーの削除は許可されていません" });
        }

        await config.s3Client.send(
          new DeleteObjectCommand({
            Bucket: config.bucketName,
            Key: key,
          })
        );
        return jsonResponse(200, { success: true, key });
      }

      default:
        return jsonResponse(400, { error: "未対応のR2操作です" });
    }
  } catch (error) {
    console.error("R2 API error:", error);
    return jsonResponse(500, { error: "R2操作に失敗しました" });
  }
}

export const POST = handleR2Request;

export default {
  fetch: handleR2Request,
};
