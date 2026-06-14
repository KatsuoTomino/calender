import { supabase } from "./supabaseClient";

type R2ApiResponse = {
  key?: string;
  url?: string | null;
  deleted?: boolean;
  error?: string;
};

async function callR2Api(formData: FormData): Promise<R2ApiResponse | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    console.error("R2 APIの呼び出しにはログインが必要です。", error);
    return null;
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  const body = (await response.json().catch(() => null)) as R2ApiResponse | null;
  if (!response.ok) {
    console.error("R2 APIエラー:", body?.error || response.statusText);
    return null;
  }

  return body;
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
    const formData = new FormData();
    formData.append("action", "uploadAvatar");
    formData.append("userId", userId);
    formData.append("file", file);

    const response = await callR2Api(formData);
    if (!response?.key) {
      return null;
    }

    console.log("✅ R2へのアバター画像アップロード成功");
    return response.key;
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
    const formData = new FormData();
    formData.append("action", "uploadTodoImage");
    formData.append("todoId", todoId);
    formData.append("file", file);

    const response = await callR2Api(formData);
    if (!response?.key) {
      return null;
    }

    console.log("✅ R2へのアップロード成功");
    return response.key;
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
    const formData = new FormData();
    formData.append("action", "signedUrl");
    formData.append("key", imageKeyOrUrl);

    const response = await callR2Api(formData);
    if (response?.url) {
      console.log("✅ Presigned URL生成成功:", imageKeyOrUrl);
      return response.url;
    }

    return null;
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
    const formData = new FormData();
    formData.append("action", "delete");
    formData.append("key", imageKey);

    const response = await callR2Api(formData);
    const deleted = response?.deleted === true;
    if (deleted) {
      console.log("✅ R2からの画像削除成功:", imageKey);
    }
    return deleted;
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
    const formData = new FormData();
    formData.append("action", "avatarUrl");
    formData.append("userId", userId);

    const response = await callR2Api(formData);
    if (response?.url) {
      console.log(`✅ アバター画像をR2から取得成功`);
      return response.url;
    }

    console.log(`ℹ️ アバター画像が見つかりませんでした (userId: ${userId})`);
    return null;
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
  _expiresIn: number = 3600
): Promise<string | null> {
  return getImageUrl(imageUrl);
}
