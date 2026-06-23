import { supabase } from "./supabaseClient";
import { getSafeImageExtension, normalizeR2Key } from "../utils/r2Keys";

type UploadUrlResponse = {
  key: string;
  uploadUrl: string;
};

type ImageUrlResponse = {
  key: string;
  url: string;
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("Supabaseセッション取得エラー:", error);
    return null;
  }

  return session?.access_token ?? null;
}

async function requestR2<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api/r2${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    console.error("R2 APIエラー:", response.status, errorBody);
    return null;
  }

  return (await response.json()) as T;
}

async function uploadFileWithSignedUrl(file: File, key: string): Promise<string | null> {
  const contentType = file.type || "image/jpeg";
  const signed = await requestR2<UploadUrlResponse>("", {
    method: "POST",
    body: JSON.stringify({ key, contentType }),
  });

  if (!signed?.uploadUrl) {
    return null;
  }

  // The server signs the content-type header, so the upload must send the same value.
  const uploadResponse = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    console.error("R2へのアップロードエラー:", uploadResponse.status, await uploadResponse.text().catch(() => ""));
    return null;
  }

  return signed.key;
}

/**
 * ユーザーアバター画像をR2にアップロード
 * @param file アップロードする画像ファイル
 * @param userId ユーザーID（ファイル名に使用）
 * @returns アップロードされたR2キー、失敗時はnull
 */
export async function uploadAvatarToR2(file: File, userId: string): Promise<string | null> {
  try {
    const extension = getSafeImageExtension(file.name);
    const key = `users/${userId}/avatar.${extension}`;
    return await uploadFileWithSignedUrl(file, key);
  } catch (error) {
    console.error("R2へのアバター画像アップロードエラー:", error);
    return null;
  }
}

/**
 * 画像ファイルをR2にアップロード
 * @param file アップロードする画像ファイル
 * @param todoId TodoのID（ファイル名に使用）
 * @returns アップロードされたR2キー、失敗時はnull
 */
export async function uploadImageToR2(file: File, todoId: string): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const extension = getSafeImageExtension(file.name);
    const key = `todos/${todoId}/${timestamp}.${extension}`;
    return await uploadFileWithSignedUrl(file, key);
  } catch (error) {
    console.error("R2への画像アップロードエラー:", error);
    return null;
  }
}

/**
 * R2キーから画像の表示用URLを取得
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  const key = normalizeR2Key(imageKeyOrUrl);
  if (!key) return null;

  const params = new URLSearchParams({ key });
  const result = await requestR2<ImageUrlResponse>(`?${params.toString()}`);
  return result?.url ?? null;
}

/**
 * R2から画像を削除
 * @param imageKey 削除する画像のキー（R2キーまたはURL）
 * @returns 削除成功時true、失敗時false
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  const key = normalizeR2Key(imageKey);
  if (!key) return false;

  const result = await requestR2<{ deleted: boolean }>("", {
    method: "DELETE",
    body: JSON.stringify({ key }),
  });

  return result?.deleted === true;
}

/**
 * ユーザーのアバター画像をR2から取得
 * @param userId ユーザーID
 * @returns アバター画像の表示用URL、存在しない場合はnull
 */
export async function getAvatarFromR2(userId: string): Promise<string | null> {
  if (!userId) {
    console.error("userIdが指定されていません");
    return null;
  }

  const result = await requestR2<ImageUrlResponse>("?avatar=current");
  return result?.url ?? null;
}

/**
 * Presigned URLを生成（後方互換API）
 * @param imageUrl 画像のURLまたはR2キー
 * @returns 表示用URL、失敗時はnull
 */
export async function getPresignedUrl(imageUrl: string): Promise<string | null> {
  return getImageUrl(imageUrl);
}
