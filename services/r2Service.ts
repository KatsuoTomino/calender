import { supabase } from "./supabaseClient";
import {
  createAvatarKey,
  createTodoImageKey,
} from "../utils/r2Keys";

interface R2ApiResponse {
  key?: string | null;
  url?: string | null;
  deleted?: boolean;
  error?: string;
}

async function getAuthHeader(): Promise<Record<string, string> | null> {
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

async function requestR2Api(
  path: string,
  init: RequestInit = {}
): Promise<R2ApiResponse | null> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return null;

  const response = await fetch(`/api/r2${path}`, {
    ...init,
    headers: {
      ...authHeader,
      ...(init.headers || {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as R2ApiResponse;
  if (!response.ok) {
    console.error("R2 APIエラー:", data.error || response.statusText);
    return null;
  }

  return data;
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

    const fileName = createAvatarKey(userId, file.name);

    console.log("📁 ファイル名:", fileName);

    const result = await requestR2Api(
      `?action=upload&key=${encodeURIComponent(fileName)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": file.type || "image/jpeg",
        },
        body: file,
      }
    );
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

    const fileName = createTodoImageKey(todoId, file.name);

    console.log("📁 ファイル名:", fileName);

    const result = await requestR2Api(
      `?action=upload&key=${encodeURIComponent(fileName)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": file.type || "image/jpeg",
        },
        body: file,
      }
    );
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
    const result = await requestR2Api(
      `?action=getUrl&key=${encodeURIComponent(imageKeyOrUrl)}`,
      { method: "GET" }
    );
    if (!result?.url) return null;

    console.log("✅ Presigned URL生成成功:", result.key || imageKeyOrUrl);
    return result.url;
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
    const result = await requestR2Api(
      `?action=delete&key=${encodeURIComponent(imageKey)}`,
      { method: "DELETE" }
    );
    if (!result?.deleted) return false;

    console.log("✅ R2からの画像削除成功:", result.key || imageKey);
    return result.deleted;
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
    const result = await requestR2Api(
      `?action=getAvatar&userId=${encodeURIComponent(userId)}`,
      { method: "GET" }
    );
    if (result?.url) {
      console.log(`✅ アバター画像をR2から取得成功: ${result.key}`);
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
