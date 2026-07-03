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
  buildAvatarKey,
  buildTodoImageKey,
  isAvatarKeyForUser,
  isTodoImageKey,
  normalizeR2Key,
} from "../utils/r2Keys";

type AuthUser = {
  id: string;
};

type R2RequestBody =
  | {
      action: "createUploadUrl";
      kind: "todo";
      todoId: string;
      fileName: string;
      contentType: string;
    }
  | {
      action: "createUploadUrl";
      kind: "avatar";
      fileName: string;
      contentType: string;
    }
  | {
      action: "getUrl" | "delete";
      key: string;
    }
  | {
      action: "getAvatar";
      userId: string;
    };

const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const SIGNED_GET_TTL_SECONDS = 3600 * 24 * 7;
const SIGNED_PUT_TTL_SECONDS = 300;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function getRequiredEnv(name: string, fallbackName?: string): string {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function createR2Client(): { client: S3Client; bucketName: string } {
  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getRequiredEnv("R2_BUCKET_NAME");
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

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

async function authenticate(request: Request): Promise<AuthUser> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return { id: data.user.id };
}

function ensureCanAccessKey(key: string, userId: string): boolean {
  return isTodoImageKey(key) || isAvatarKeyForUser(key, userId);
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: R2RequestBody;
  try {
    body = (await request.json()) as R2RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  try {
    const user = await authenticate(request);
    const { client, bucketName } = createR2Client();

    if (body.action === "createUploadUrl") {
      if (!body.contentType.startsWith("image/")) {
        return jsonResponse({ error: "Only image uploads are allowed" }, 400);
      }

      const key =
        body.kind === "avatar"
          ? buildAvatarKey(user.id, body.fileName, body.contentType)
          : buildTodoImageKey(body.todoId, body.fileName, body.contentType);

      if (!key) {
        return jsonResponse({ error: "Invalid upload key" }, 400);
      }

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: body.contentType,
      });
      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: SIGNED_PUT_TTL_SECONDS,
      });

      return jsonResponse({ key, uploadUrl });
    }

    if (body.action === "getAvatar") {
      if (body.userId !== user.id) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      for (const extension of AVATAR_EXTENSIONS) {
        const key = `users/${user.id}/avatar.${extension}`;
        try {
          await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
          const url = await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: bucketName, Key: key }),
            { expiresIn: SIGNED_GET_TTL_SECONDS }
          );
          return jsonResponse({ url, key });
        } catch (error: any) {
          if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
            continue;
          }
          throw error;
        }
      }

      return jsonResponse({ url: null });
    }

    const key = normalizeR2Key(body.key, bucketName);
    if (!key || !ensureCanAccessKey(key, user.id)) {
      return jsonResponse({ error: "Invalid key" }, 400);
    }

    if (body.action === "getUrl") {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
        { expiresIn: SIGNED_GET_TTL_SECONDS }
      );
      return jsonResponse({ url, key });
    }

    if (body.action === "delete") {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
      return jsonResponse({ deleted: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("R2 API error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

export default {
  fetch: handleRequest,
};
