import { supabase } from "./supabaseClient";

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

async function callR2Json<T>(
  body: Record<string, unknown>
): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2 APIの呼び出しにはログインが必要です。");
    return null;
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("R2 APIエラー:", result.error || response.statusText);
    return null;
  }

  return result as T;
}

async function callR2Upload<T>(
  action: "uploadAvatar" | "uploadTodoImage",
  formData: FormData
): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2 APIの呼び出しにはログインが必要です。");
    return null;
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-R2-Action": action,
    },
    body: formData,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("R2 APIエラー:", result.error || response.statusText);
    return null;
  }

  return result as T;
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
    formData.set("file", file);
    formData.set("userId", userId);

    const result = await callR2Upload<{ key: string }>("uploadAvatar", formData);
    if (!result?.key) return null;

    console.log("✅ R2へのアバター画像アップロード成功");
    return result.key;
  } catch (error: any) {
    console.error("❌ R2へのアバター画像アップロードエラー:", error);
    console.error("エラー詳細:", error.message);
    if (error.$metadata) {
      console.error("リクエストID:", error.$metadata.requestId);
    }
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
    formData.set("file", file);
    formData.set("todoId", todoId);

    const result = await callR2Upload<{ key: string }>("uploadTodoImage", formData);
    if (!result?.key) return null;

    console.log("✅ R2へのアップロード成功");
    return result.key;
  } catch (error: any) {
    console.error("❌ R2への画像アップロードエラー:", error);
    console.error("エラー詳細:", error.message);
    if (error.$metadata) {
      console.error("リクエストID:", error.$metadata.requestId);
    }
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
    const result = await callR2Json<{ url: string | null }>({
      action: "getImageUrl",
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
    const result = await callR2Json<{ success: boolean }>({
      action: "deleteImage",
      key: imageKey,
    });
    if (result?.success) {
      console.log("✅ R2からの画像削除成功:", imageKey);
      return true;
    }
    return false;
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
    const result = await callR2Json<{ url: string | null }>({
      action: "getAvatar",
      userId,
    });
    return result?.url ?? null;
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
  try {
    const result = await callR2Json<{ url: string | null }>({
      action: "getImageUrl",
      key: imageUrl,
      expiresIn,
    });
    return result?.url ?? null;
  } catch (error) {
    console.error("Presigned URL生成エラー:", error);
    return null;
  }
}
