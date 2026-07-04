import { supabase } from "./supabaseClient";
import { buildAvatarKey, buildTodoImageKey } from "../utils/r2Keys";

interface R2UploadUrlResponse {
  uploadUrl: string;
  key: string;
  contentType: string;
}

interface R2DownloadUrlResponse {
  downloadUrl: string | null;
  key: string | null;
}

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Supabaseセッション取得エラー:", error);
    return null;
  }
  return data.session?.access_token || null;
}

async function r2Request<T>(payload: Record<string, unknown>): Promise<T | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  try {
    const response = await fetch("/api/r2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("R2 APIエラー:", body?.error || response.statusText);
      return null;
    }

    return body as T;
  } catch (error) {
    console.error("R2 API呼び出しエラー:", error);
    return null;
  }
}

async function uploadFileWithSignedUrl(file: File, key: string): Promise<string | null> {
  const contentType = file.type || "image/jpeg";
  const uploadInfo = await r2Request<R2UploadUrlResponse>({
    action: "createUploadUrl",
    key,
    contentType,
  });
  if (!uploadInfo?.uploadUrl) return null;

  const uploadResponse = await fetch(uploadInfo.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": uploadInfo.contentType || contentType,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    console.error("R2署名URLアップロードエラー:", uploadResponse.statusText);
    return null;
  }

  return uploadInfo.key;
}

/**
 * ユーザーアバター画像をR2にアップロードする。
 *
 * Vite公式ドキュメントではVITE_*環境変数がクライアントバンドルへ露出すると
 * 明記されているため、R2の実認証情報は/api/r2のサーバレス関数だけで扱う。
 */
export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  if (!userId) return null;
  const key = buildAvatarKey(userId, file.name);
  return uploadFileWithSignedUrl(file, key);
}

/**
 * Todo画像をR2にアップロードする。
 */
export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  if (!todoId) return null;
  const key = buildTodoImageKey(todoId, file.name);
  return uploadFileWithSignedUrl(file, key);
}

/**
 * R2キーから画像の表示用URLを取得する。
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  const downloadInfo = await r2Request<R2DownloadUrlResponse>({
    action: "getDownloadUrl",
    key: imageKeyOrUrl,
  });
  return downloadInfo?.downloadUrl || null;
}

/**
 * R2から画像を削除する。
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  const result = await r2Request<{ success: boolean }>({
    action: "deleteObject",
    key: imageKey,
  });
  return result?.success === true;
}

/**
 * ユーザーのアバター画像をR2から取得する。
 */
export async function getAvatarFromR2(userId: string): Promise<string | null> {
  if (!userId) return null;
  const downloadInfo = await r2Request<R2DownloadUrlResponse>({
    action: "getAvatarUrl",
    userId,
  });
  return downloadInfo?.downloadUrl || null;
}

/**
 * 互換API: 既存呼び出し元向けにR2キーの署名URLを返す。
 */
export async function getPresignedUrl(
  imageUrl: string,
  _expiresIn: number = 3600
): Promise<string | null> {
  return getImageUrl(imageUrl);
}
