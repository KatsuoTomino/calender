import { supabase } from "./supabaseClient";

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("認証セッションの取得エラー:", error);
    return null;
  }
  return data.session?.access_token ?? null;
}

async function requestR2(
  input: string,
  init: RequestInit = {}
): Promise<Response | null> {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(input, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let message = `R2 APIエラー: ${response.status}`;
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch {
        // JSONでないエラー応答はステータスのみログに残す
      }
      console.error(message);
      return null;
    }

    return response;
  } catch (error) {
    console.error("R2 API通信エラー:", error);
    return null;
  }
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
    formData.set("action", "upload-avatar");
    formData.set("userId", userId);
    formData.set("file", file);

    const response = await requestR2("/api/r2", {
      method: "POST",
      body: formData,
    });
    if (!response) return null;

    const body = await response.json();
    console.log("✅ R2へのアバター画像アップロード成功");
    return typeof body.key === "string" ? body.key : null;
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
    formData.set("action", "upload-todo-image");
    formData.set("todoId", todoId);
    formData.set("file", file);

    const response = await requestR2("/api/r2", {
      method: "POST",
      body: formData,
    });
    if (!response) return null;

    const body = await response.json();
    console.log("✅ R2へのアップロード成功");
    return typeof body.key === "string" ? body.key : null;
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
    const response = await requestR2(
      `/api/r2?action=get-url&key=${encodeURIComponent(imageKeyOrUrl)}`
    );
    if (!response) return null;

    const body = await response.json();
    if (typeof body.url === "string") {
      console.log("✅ Presigned URL生成成功:", imageKeyOrUrl);
      return body.url;
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
    const response = await requestR2("/api/r2", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key: imageKey }),
    });
    if (!response) return false;

    console.log("✅ R2からの画像削除成功:", imageKey);
    return true;
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
    const response = await requestR2(
      `/api/r2?action=get-avatar&userId=${encodeURIComponent(userId)}`
    );
    if (!response) return null;

    const body = await response.json();
    if (typeof body.url === "string") {
      console.log(`✅ アバター画像をR2から取得成功 (userId: ${userId})`);
      return body.url;
    }

    console.log(`ℹ️ アバター画像が見つかりませんでした (userId: ${userId})`);
    return null;
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
