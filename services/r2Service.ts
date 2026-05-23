import { supabase } from "./supabaseClient";

interface R2ApiResponse {
  key?: string;
  url?: string | null;
  success?: boolean;
  error?: string;
}

async function getAuthHeaders(): Promise<HeadersInit | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    console.error("R2 API認証エラー:", error);
    return null;
  }

  return {
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

async function requestR2(
  action: string,
  init: RequestInit = {},
  queryParams?: Record<string, string>
): Promise<R2ApiResponse | null> {
  const authHeaders = await getAuthHeaders();
  if (!authHeaders) return null;

  const url = new URL("/api/r2", window.location.origin);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(queryParams || {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders,
      ...(init.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as R2ApiResponse | null;
  if (!response.ok) {
    console.error("R2 APIエラー:", payload?.error || response.statusText);
    return null;
  }

  return payload;
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
    formData.append("file", file);
    formData.append("userId", userId);

    const result = await requestR2("upload-avatar", {
      method: "POST",
      body: formData,
    });
    if (!result?.key) return null;

    console.log("✅ R2へのアバター画像アップロード成功");
    return result.key;
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
    formData.append("file", file);
    formData.append("todoId", todoId);

    const result = await requestR2("upload-image", {
      method: "POST",
      body: formData,
    });
    if (!result?.key) return null;
    
    console.log("✅ R2へのアップロード成功");
    return result.key;
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
    const result = await requestR2("image-url", undefined, { key: imageKeyOrUrl });
    if (result?.url) {
      console.log("✅ Presigned URL取得成功");
      return result.url;
    }

    // 既存データが公開URLの場合は、API障害時も表示を維持する
    if (imageKeyOrUrl.startsWith("http://") || imageKeyOrUrl.startsWith("https://")) {
      return imageKeyOrUrl;
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
    const result = await requestR2("delete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ key: imageKey }),
    });
    if (!result?.success) return false;

    console.log("✅ R2からの画像削除成功:", imageKey);
    return result.success;
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
    const result = await requestR2("avatar");
    if (!result?.url) {
      console.log(`ℹ️ アバター画像が見つかりませんでした (userId: ${userId})`);
      return null;
    }

    console.log(`✅ アバター画像をR2から取得成功`);
    return result.url;
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
