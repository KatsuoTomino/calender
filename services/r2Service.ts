import { supabase } from "./supabaseClient";

type R2ActionResponse = {
  success?: boolean;
  key?: string;
  url?: string | null;
  uploadUrl?: string;
  error?: string;
};

async function requestR2(payload: Record<string, unknown>): Promise<R2ActionResponse | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  try {
    const response = await fetch("/api/r2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json().catch(() => null)) as R2ActionResponse | null;
    if (!response.ok || !result || result.error) {
      console.error("R2 APIエラー:", result?.error || response.statusText);
      return null;
    }

    return result;
  } catch (error) {
    console.error("R2 APIリクエストエラー:", error);
    return null;
  }
}

async function uploadWithSignedUrl(file: File, payload: Record<string, unknown>): Promise<string | null> {
  const result = await requestR2(payload);
  if (!result?.uploadUrl || !result.key) return null;

  const uploadResponse = await fetch(result.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "image/jpeg",
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    console.error("R2へのアップロードに失敗しました:", uploadResponse.statusText);
    return null;
  }

  return result.key;
}

/**
 * ユーザーアバター画像をR2にアップロード
 * Vite公式ドキュメントではVITE_*はクライアントへ公開されるため、
 * 秘密鍵は/api/r2のサーバー側に置き、ブラウザには署名URLだけを返す。
 * https://vite.dev/guide/env-and-mode#env-variables
 */
export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  try {
    console.log("📤 アバター画像アップロード開始:", file.name);
    return await uploadWithSignedUrl(file, {
      action: "createAvatarUploadUrl",
      fileName: file.name,
      contentType: file.type || "image/jpeg",
      userId,
    });
  } catch (error) {
    console.error("❌ R2へのアバター画像アップロードエラー:", error);
    return null;
  }
}

/**
 * 画像ファイルをR2にアップロード
 * @param file アップロードする画像ファイル
 * @param todoId TodoのID（ファイル名に使用）
 * @returns アップロードされた画像のR2キーパス、失敗時はnull
 */
export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  try {
    console.log("📤 画像アップロード開始:", file.name);
    return await uploadWithSignedUrl(file, {
      action: "createTodoUploadUrl",
      todoId,
      fileName: file.name,
      contentType: file.type || "image/jpeg",
    });
  } catch (error) {
    console.error("❌ R2への画像アップロードエラー:", error);
    return null;
  }
}

/**
 * R2キーから画像の表示用URLを取得
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  const result = await requestR2({
    action: "getImageUrl",
    key: imageKeyOrUrl,
  });

  return result?.url || null;
}

/**
 * R2から画像を削除
 * @param imageKey 削除する画像のキー（R2キーまたはURL）
 * @returns 削除成功時true、失敗時false
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  const result = await requestR2({
    action: "deleteImage",
    key: imageKey,
  });

  return result?.success === true;
}

/**
 * ユーザーのアバター画像をR2から取得
 * @param userId ユーザーID
 * @returns アバター画像の表示用URL、存在しない場合はnull
 */
export async function getAvatarFromR2(userId: string): Promise<string | null> {
  const result = await requestR2({
    action: "getAvatar",
    userId,
  });

  return result?.url || null;
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
  const result = await requestR2({
    action: "getImageUrl",
    key: imageUrl,
    expiresIn,
  });

  return result?.url || null;
}
