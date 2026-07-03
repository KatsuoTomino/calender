import { supabase } from "./supabaseClient";

type UploadUrlResponse = {
  key: string;
  uploadUrl: string;
};

type ImageUrlResponse = {
  key?: string;
  url: string | null;
};

async function r2ApiRequest<T>(body: Record<string, unknown>): Promise<T | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    console.error("R2 APIの利用にはログインが必要です。");
    return null;
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("R2 APIエラー:", response.status, message);
    return null;
  }

  return (await response.json()) as T;
}

async function uploadWithSignedUrl(
  file: File,
  requestBody: Record<string, unknown>
): Promise<string | null> {
  // Vite exposes VITE_* values to browser bundles, so R2 secrets stay behind /api/r2.
  // See https://vite.dev/guide/env-and-mode#env-variables
  const upload = await r2ApiRequest<UploadUrlResponse>({
    action: "createUploadUrl",
    fileName: file.name,
    contentType: file.type || "image/jpeg",
    ...requestBody,
  });

  if (!upload) return null;

  const uploadResponse = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "image/jpeg",
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    console.error("R2への署名URLアップロードに失敗しました:", uploadResponse.status);
    return null;
  }

  return upload.key;
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
    const uploadedKey = await uploadWithSignedUrl(file, {
      kind: "avatar",
      userId,
    });
    if (uploadedKey) {
      console.log("✅ R2へのアバター画像アップロード成功");
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
    const uploadedKey = await uploadWithSignedUrl(file, {
      kind: "todo",
      todoId,
    });
    if (uploadedKey) {
      console.log("✅ R2へのアップロード成功");
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
    const result = await r2ApiRequest<ImageUrlResponse>({
      action: "getUrl",
      key: imageKeyOrUrl,
    });
    if (result?.url) {
      console.log("✅ Presigned URL生成成功:", result.key || imageKeyOrUrl);
      return result.url;
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
    const result = await r2ApiRequest<{ deleted: boolean }>({
      action: "delete",
      key: imageKey,
    });
    if (result?.deleted) {
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
    const result = await r2ApiRequest<ImageUrlResponse>({
      action: "getAvatar",
      userId,
    });
    if (result?.url) {
      console.log(`✅ アバター画像をR2から取得成功: ${result.key || userId}`);
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
  void expiresIn;
  return getImageUrl(imageUrl);
}
