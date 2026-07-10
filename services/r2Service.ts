import { supabase } from "./supabaseClient";

type R2ApiResponse = {
  key?: string;
  url?: string | null;
  success?: boolean;
  error?: string;
};

const R2_API_PATH = "/api/r2";

async function getAuthHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function requestR2(
  pathAndQuery: string,
  init: RequestInit = {}
): Promise<R2ApiResponse | null> {
  const authHeaders = await getAuthHeaders();
  if (!authHeaders) return null;

  const headers = new Headers(init.headers);
  Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value));

  const response = await fetch(`${R2_API_PATH}${pathAndQuery}`, {
    ...init,
    headers,
  });

  const body = (await response.json().catch(() => null)) as R2ApiResponse | null;
  if (!response.ok) {
    console.error("R2 APIエラー:", body?.error || response.statusText);
    return null;
  }

  return body;
}

async function uploadFile(action: string, file: File, todoId?: string): Promise<string | null> {
  const formData = new FormData();
  formData.append("action", action);
  formData.append("file", file);
  if (todoId) {
    formData.append("todoId", todoId);
  }

  const body = await requestR2("", {
    method: "POST",
    body: formData,
  });

  return body?.key || null;
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
  try {
    console.log("📤 アバター画像アップロード開始:", file.name);
    // Vite docs: VITE_* values are bundled into client code, so R2 secrets stay behind /api/r2.
    const uploadedKey = await uploadFile("upload-avatar", file);
    if (uploadedKey) {
      console.log("✅ R2へのアバター画像アップロード成功:", uploadedKey);
    }
    return uploadedKey;
  } catch (error: any) {
    console.error("❌ R2へのアバター画像アップロードエラー:", error);
    console.error("エラー詳細:", error.message);
    return null;
  }
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
  try {
    console.log("📤 画像アップロード開始:", file.name);
    const uploadedKey = await uploadFile("upload-image", file, todoId);
    if (uploadedKey) {
      console.log("✅ R2へのアップロード成功:", uploadedKey);
    }
    return uploadedKey;
  } catch (error: any) {
    console.error("❌ R2への画像アップロードエラー:", error);
    console.error("エラー詳細:", error.message);
    return null;
  }
}

/**
 * R2キーから画像の表示用URLを取得
 * パブリックアクセスが無効な場合はPresigned URLを生成
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  try {
    const body = await requestR2(
      `?action=get-url&key=${encodeURIComponent(imageKeyOrUrl)}`
    );
    return body?.url || null;
  } catch (error) {
    console.error("❌ 画像URL取得エラー:", error);
    return null;
  }
}

/**
 * R2から画像を削除
 * @param imageKey 削除する画像のキー（R2キーまたはURL）
 * @returns 削除成功時true、失敗時false
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    const body = await requestR2("", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "delete", key: imageKey }),
    });
    const success = body?.success === true;
    if (success) {
      console.log("✅ R2からの画像削除成功:", imageKey);
    }
    return success;
  } catch (error) {
    console.error("❌ R2からの画像削除エラー:", error);
    return false;
  }
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

  console.log(`🔍 R2からアバター画像を検索中... userId: ${userId}`);

  try {
    const body = await requestR2(
      `?action=get-avatar&userId=${encodeURIComponent(userId)}`
    );
    return body?.url || null;
  } catch (error: any) {
    console.error("❌ アバター画像取得エラー:", error);
    console.error("エラー詳細:", error.message, error);
    return null;
  }
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
  void expiresIn;
  return getImageUrl(imageUrl);
}
