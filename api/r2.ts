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
  avatarKeysForUser,
  buildAvatarKey,
  buildTodoImageKey,
  isAllowedR2KeyForUser,
  isSafeR2PathSegment,
  normalizeR2Key,
} from "../utils/r2Keys";

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

type R2RequestBody = {
  action?: string;
  key?: string;
  todoId?: string;
  fileName?: string;
  contentType?: string;
  expiresIn?: number;
};

function getEnv(name: string, fallbackName?: string): string | undefined {
  return process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
}

function getBearerToken(headers: ApiRequest["headers"]): string | null {
  const header = headers.authorization || headers.Authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
}

function parseBody(body: unknown): R2RequestBody {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as R2RequestBody;
    } catch {
      return {};
    }
  }
  return body as R2RequestBody;
}

function badRequest(res: ApiResponse, error: string) {
  return res.status(400).json({ error });
}

function getR2Client(): { client: S3Client; bucketName: string } | null {
  const accountId = getEnv("R2_ACCOUNT_ID");
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getEnv("R2_BUCKET_NAME");
  const endpoint = getEnv("R2_ENDPOINT") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    return null;
  }

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

async function getAuthenticatedUser(req: ApiRequest) {
  const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  const token = getBearerToken(req.headers);

  if (!supabaseUrl || !supabaseAnonKey || !token) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Supabase公式ドキュメントどおり、JWTを渡したgetUserはAuthサーバーへ確認する。
  // https://supabase.com/docs/reference/javascript/auth-getuser
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user;
}

function validateImageContentType(contentType: string | undefined): string {
  return contentType?.startsWith("image/") ? contentType : "image/jpeg";
}

function validateKey(key: string | undefined, bucketName: string, userId: string): string | null {
  if (!key) return null;
  const normalizedKey = normalizeR2Key(key, bucketName);
  if (!normalizedKey || !isAllowedR2KeyForUser(normalizedKey, userId)) return null;
  return normalizedKey;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Allow", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const r2 = getR2Client();
  if (!r2) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  const body = parseBody(req.body);
  const { client, bucketName } = r2;

  try {
    switch (body.action) {
      case "createTodoUploadUrl": {
        if (!body.todoId || !body.fileName || !isSafeR2PathSegment(body.todoId)) {
          return badRequest(res, "todoId and fileName are required");
        }

        const key = buildTodoImageKey(body.todoId, body.fileName);
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: validateImageContentType(body.contentType),
        });
        const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });
        return res.status(200).json({ key, uploadUrl });
      }

      case "createAvatarUploadUrl": {
        if (!body.fileName) {
          return badRequest(res, "fileName is required");
        }

        const key = buildAvatarKey(user.id, body.fileName);
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: validateImageContentType(body.contentType),
        });
        const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });
        return res.status(200).json({ key, uploadUrl });
      }

      case "getImageUrl": {
        const key = validateKey(body.key, bucketName, user.id);
        if (!key) return badRequest(res, "Invalid key");

        const expiresIn = Math.max(60, Math.min(body.expiresIn || 3600 * 24 * 7, 3600 * 24 * 7));
        const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
        const url = await getSignedUrl(client, command, { expiresIn });
        return res.status(200).json({ url });
      }

      case "deleteImage": {
        const key = validateKey(body.key, bucketName, user.id);
        if (!key) return badRequest(res, "Invalid key");

        await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
        return res.status(200).json({ success: true });
      }

      case "getAvatar": {
        for (const key of avatarKeysForUser(user.id)) {
          try {
            await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
            const url = await getSignedUrl(
              client,
              new GetObjectCommand({ Bucket: bucketName, Key: key }),
              { expiresIn: 3600 * 24 * 7 }
            );
            return res.status(200).json({ key, url });
          } catch (error: any) {
            if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
              continue;
            }
            throw error;
          }
        }

        return res.status(200).json({ url: null });
      }

      default:
        return badRequest(res, "Unknown action");
    }
  } catch (error) {
    console.error("R2 API error:", error);
    return res.status(500).json({ error: "R2 operation failed" });
  }
}
