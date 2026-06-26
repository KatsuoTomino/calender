import { supabase } from "./supabaseClient";
import { getImageExtension, normalizeR2Key } from "../utils/r2Keys";

type PresignPutResponse = { uploadUrl: string; key: string };
type PresignGetResponse = { url: string | null };
type DeleteResponse = { success: boolean };

async function callR2Api<T>(payload: Record<string, unknown>): Promise<T | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    console.error("R2 API認証トークンを取得できませんでした:", error);
    return null;
  }

  // Vite公式ドキュメントでは VITE_* はクライアントへ露出するため、
  // R2の署名・削除はサーバー側 /api/r2 に閉じ込める。
  // https://vite.dev/guide/env-and-mode#env-variables
  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("R2 APIエラー:", response.status, message);
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

    // ファイル名を生成（users/{userId}/avatar.{拡張子}）
    const fileExtension = getImageExtension(file.name, file.type);
    const fileName = `users/${userId}/avatar.${fileExtension}`;

    console.log("📁 ファイル名:", fileName);

    const presigned = await callR2Api<PresignPutResponse>({
      action: "presignPut",
      key: fileName,
      contentType: file.type || "image/jpeg",
    });

    if (!presigned?.uploadUrl) {
      return null;
    }

    const uploadResponse = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

    if (!uploadResponse.ok) {
      console.error("❌ R2へのアバター画像アップロードエラー:", uploadResponse.status);
      return null;
    }

    console.log("✅ R2へのアバター画像アップロード成功");

    return presigned.key;
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

    // ファイル名を生成（todoId + タイムスタンプ + 拡張子）
    const timestamp = Date.now();
    const fileExtension = getImageExtension(file.name, file.type);
    const fileName = `todos/${todoId}/${timestamp}.${fileExtension}`;

    console.log("📁 ファイル名:", fileName);

    const presigned = await callR2Api<PresignPutResponse>({
      action: "presignPut",
      key: fileName,
      contentType: file.type || "image/jpeg",
    });

    if (!presigned?.uploadUrl) {
      return null;
    }

    const uploadResponse = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

    if (!uploadResponse.ok) {
      console.error("❌ R2への画像アップロードエラー:", uploadResponse.status);
      return null;
    }

    console.log("✅ R2へのアップロード成功");

    return presigned.key;
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
      return null;
    }

    const presigned = await callR2Api<PresignGetResponse>({
      action: "presignGet",
      key: imageKey,
      expiresIn: 3600 * 24 * 7,
    });

    if (presigned?.url) {
      console.log("✅ Presigned URL生成成功:", imageKey);
      return presigned.url;
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
    const key = normalizeR2Key(imageKey);
    if (!key) {
      return false;
    }

    const result = await callR2Api<DeleteResponse>({
      action: "delete",
      key,
    });

    if (result?.success) {
      console.log("✅ R2からの画像削除成功:", key);
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
    const result = await callR2Api<PresignGetResponse>({
      action: "getAvatar",
      userId,
    });
    
    if (result?.url) {
      console.log(`✅ アバター画像をR2から取得成功`);
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
  expiresIn: number = 3600
): Promise<string | null> {
  try {
    const key = normalizeR2Key(imageUrl);
    if (!key) {
      return null;
    }

    const presigned = await callR2Api<PresignGetResponse>({
      action: "presignGet",
      key,
      expiresIn,
    });

    return presigned?.url ?? null;
  } catch (error) {
    console.error("Presigned URL生成エラー:", error);
    return null;
  }
}
