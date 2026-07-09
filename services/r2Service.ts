import { supabase } from "./supabaseClient";
import { buildAvatarKey, buildTodoImageKey, normalizeR2Key } from "../utils/r2Keys";

type R2Action =
  | "createUploadUrl"
  | "getDownloadUrl"
  | "deleteObject"
  | "getAvatarUrl";

async function callR2Api<T>(
  action: R2Action,
  body: Record<string, unknown>
): Promise<T | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });

  if (!response.ok) {
    const message = await response.text();
    console.error(`R2 APIエラー (${response.status}):`, message);
    return null;
  }

  return (await response.json()) as T;
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

    const fileName = buildAvatarKey(userId, file.name);
    const result = await callR2Api<{ uploadUrl: string; key: string }>("createUploadUrl", {
      key: fileName,
      contentType: file.type || "image/jpeg",
    });
    if (!result) {
      return null;
    }

    const uploadResponse = await fetch(result.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "image/jpeg",
      },
      body: file,
    });
    if (!uploadResponse.ok) {
      console.error("❌ R2へのアバター画像アップロードに失敗:", uploadResponse.status);
      return null;
    }

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

    const fileName = buildTodoImageKey(todoId, file.name);
    const result = await callR2Api<{ uploadUrl: string; key: string }>("createUploadUrl", {
      key: fileName,
      contentType: file.type || "image/jpeg",
    });
    if (!result) {
      return null;
    }

    const uploadResponse = await fetch(result.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "image/jpeg",
      },
      body: file,
    });
    if (!uploadResponse.ok) {
      console.error("❌ R2への画像アップロードに失敗:", uploadResponse.status);
      return null;
    }

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
    const imageKey = normalizeR2Key(imageKeyOrUrl);
    if (!imageKey) {
      console.error("無効なR2キーです。");
      return null;
    }

    const result = await callR2Api<{ url: string }>("getDownloadUrl", {
      key: imageKey,
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
  const key = normalizeR2Key(imageKey);
  if (!key) {
    console.error("無効なR2キーです。");
    return false;
  }

  try {
    const result = await callR2Api<{ success: boolean }>("deleteObject", {
      key,
    });
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
    const result = await callR2Api<{ url: string | null }>("getAvatarUrl", {
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
  void expiresIn;
  return getImageUrl(imageUrl);
}
