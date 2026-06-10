import { supabase } from "./supabaseClient";

// Vite docs: VITE_* values are bundled into client code, so R2 secrets stay behind /api/r2.
// https://vite.dev/guide/env-and-mode#env-variables
const R2_API_PATH = "/api/r2";

type R2ApiResponse<T> =
  | ({ ok: true } & T)
  | { ok: false; error?: string };

async function getAuthHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.error("R2 APIの利用にはログインが必要です。");
    return null;
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function requestR2<T>(
  init: RequestInit
): Promise<R2ApiResponse<T>> {
  const authHeaders = await getAuthHeaders();
  if (!authHeaders) {
    return { ok: false, error: "unauthorized" };
  }

  try {
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value);
    }

    const response = await fetch(R2_API_PATH, {
      ...init,
      headers,
    });
    const payload = (await response.json().catch(() => ({}))) as R2ApiResponse<T>;

    if (payload.ok !== true) {
      console.error("R2 APIエラー:", payload);
      return { ok: false, error: "error" in payload ? payload.error : undefined };
    }

    if (!response.ok) {
      console.error("R2 APIエラー:", response.statusText);
      return { ok: false, error: response.statusText };
    }

    return payload;
  } catch (error) {
    console.error("R2 APIリクエストエラー:", error);
    return { ok: false, error: "request_failed" };
  }
}

async function uploadToR2(
  action: "upload-avatar" | "upload-image",
  file: File,
  ownerId: string
): Promise<string | null> {
  const formData = new FormData();
  formData.set("action", action);
  formData.set("file", file);
  formData.set(action === "upload-avatar" ? "userId" : "todoId", ownerId);

  const result = await requestR2<{ key: string }>({
    method: "POST",
    body: formData,
  });

  return result.ok ? result.key : null;
}

/**
 * ユーザーアバター画像をR2にアップロード
 * @param file アップロードする画像ファイル
 * @param userId ユーザーID（ファイル名に使用）
 * @returns アップロードされた画像のURL（R2キーパス）、失敗時はnull
 */
export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  return uploadToR2("upload-avatar", file, userId);
}

/**
 * 画像ファイルをR2にアップロード
 * @param file アップロードする画像ファイル
 * @param todoId TodoのID（ファイル名に使用）
 * @returns アップロードされた画像のURL（R2キーパス）、失敗時はnull
 */
export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  return uploadToR2("upload-image", file, todoId);
}

/**
 * R2キーから画像の表示用URLを取得
 * パブリックアクセスが無効な場合はPresigned URLを生成
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  const result = await requestR2<{ url: string }>({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get-url", key: imageKeyOrUrl }),
  });

  return result.ok ? result.url : null;
}

/**
 * R2から画像を削除
 * @param imageKey 削除する画像のキー（R2キーまたはURL）
 * @returns 削除成功時true、失敗時false
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  const result = await requestR2<Record<string, never>>({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", key: imageKey }),
  });

  return result.ok;
}

/**
 * ユーザーのアバター画像をR2から取得
 * @param userId ユーザーID
 * @returns アバター画像の表示用URL、存在しない場合はnull
 */
export async function getAvatarFromR2(userId: string): Promise<string | null> {
  if (!userId) {
    console.error("❌ userIdが指定されていません");
    return null;
  }

  const result = await requestR2<{ url: string }>({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get-avatar", userId }),
  });

  return result.ok ? result.url : null;
}

/**
 * Presigned URLを生成（プライベートバケットの場合）
 * @param imageUrl 画像のURL
 * @param expiresIn 有効期限（秒、デフォルト: 1時間）
 * @returns Presigned URL、失敗時はnull
 */
export async function getPresignedUrl(
  imageUrl: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const result = await requestR2<{ url: string }>({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get-url", key: imageUrl, expiresIn }),
  });

  return result.ok ? result.url : null;
}
