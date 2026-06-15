import { supabase } from "./supabaseClient";

async function callR2Api<T>(
  body: BodyInit,
  headers: Record<string, string> = {}
): Promise<T | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    console.error("R2 API認証エラー:", error);
    return null;
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.access_token}`,
      ...headers,
    },
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("R2 APIエラー:", payload || response.statusText);
    return null;
  }

  return payload as T;
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
    console.log("📤 アバター画像アップロード開始:", file.name, userId);
    const formData = new FormData();
    formData.append("action", "uploadAvatar");
    formData.append("file", file);

    const result = await callR2Api<{ key: string }>(formData);
    return result?.key || null;
  } catch (error) {
    console.error("❌ R2へのアバター画像アップロードエラー:", error);
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
    const formData = new FormData();
    formData.append("action", "uploadTodoImage");
    formData.append("todoId", todoId);
    formData.append("file", file);

    const result = await callR2Api<{ key: string }>(formData);
    return result?.key || null;
  } catch (error) {
    console.error("❌ R2への画像アップロードエラー:", error);
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
    const result = await callR2Api<{ url: string | null }>(
      JSON.stringify({ action: "getUrl", key: imageKeyOrUrl }),
      { "content-type": "application/json" }
    );
    return result?.url || null;
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
    const result = await callR2Api<{ success: boolean }>(
      JSON.stringify({ action: "delete", key: imageKey }),
      { "content-type": "application/json" }
    );
    return result?.success === true;
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
    const result = await callR2Api<{ url: string | null }>(
      JSON.stringify({ action: "getAvatar", userId }),
      { "content-type": "application/json" }
    );
    return result?.url || null;
  } catch (error) {
    console.error("❌ アバター画像取得エラー:", error);
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
