import { supabase } from "./supabaseClient";

const R2_API_PATH = "/api/r2";

type R2ApiResponse<T> =
  | ({ success: true } & T)
  | { success: false; error?: string };

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

async function callR2Api<T>(
  action: string,
  payload: Record<string, unknown>
): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2 APIの呼び出しにはログインが必要です。");
    return null;
  }

  const response = await fetch(R2_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const result = (await response.json().catch(() => null)) as
    | R2ApiResponse<T>
    | null;

  if (!response.ok || !result) {
    console.error("R2 APIエラー:", response.statusText);
    return null;
  }

  if (!result.success) {
    console.error("R2 APIエラー:", result.error || response.statusText);
    return null;
  }

  return result;
}

async function createUploadUrl(
  uploadType: "avatar" | "todo",
  file: File,
  targetId: string
): Promise<{ key: string; uploadUrl: string } | null> {
  return callR2Api<{ key: string; uploadUrl: string }>("createUploadUrl", {
    uploadType,
    targetId,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
  });
}

async function uploadFileWithSignedUrl(
  uploadUrl: string,
  file: File
): Promise<boolean> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    console.error("R2署名URLアップロードエラー:", response.statusText);
    return false;
  }

  return true;
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
    const upload = await createUploadUrl("avatar", file, userId);
    if (!upload) return null;

    const uploaded = await uploadFileWithSignedUrl(upload.uploadUrl, file);
    if (!uploaded) return null;

    console.log("✅ R2へのアバター画像アップロード成功");
    return upload.key;
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
    const upload = await createUploadUrl("todo", file, todoId);
    if (!upload) return null;

    const uploaded = await uploadFileWithSignedUrl(upload.uploadUrl, file);
    if (!uploaded) return null;

    console.log("✅ R2へのアップロード成功");
    return upload.key;
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
    const result = await callR2Api<{ url: string }>("getImageUrl", {
      key: imageKeyOrUrl,
    });

    return result?.url ?? null;
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
    const result = await callR2Api<Record<string, never>>("deleteImage", {
      key: imageKey,
    });
    const success = Boolean(result);
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
    const result = await callR2Api<{ url: string | null }>("getAvatar", {
      userId,
    });

    if (result?.url) {
      console.log(`✅ アバター画像をR2から取得成功: ${userId}`);
      return result.url;
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
