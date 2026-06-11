import { supabase } from "./supabaseClient";

// ViteはVITE_*環境変数をクライアントに埋め込むため、R2秘密鍵は/api/r2側に隔離する。
// https://vite.dev/guide/env-and-mode#env-variables
type R2Response = {
  key?: string;
  url?: string | null;
  deleted?: boolean;
  error?: string;
};

async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("ファイルの読み込みに失敗しました"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

  return dataUrl.split(",", 2)[1] || "";
}

async function requestR2(payload: Record<string, unknown>): Promise<R2Response | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    console.error("R2操作にはログインが必要です。", error);
    return null;
  }

  try {
    const response = await fetch("/api/r2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.json().catch(() => ({}))) as R2Response;
    if (!response.ok) {
      console.error("R2 APIエラー:", body.error || response.statusText);
      return null;
    }

    return body;
  } catch (err) {
    console.error("R2 API呼び出しエラー:", err);
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
  const body = await requestR2({
    action: "uploadAvatar",
    userId,
    fileName: file.name,
    contentType: file.type || "image/jpeg",
    dataBase64: await fileToBase64(file),
  });

  return body?.key || null;
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
  const body = await requestR2({
    action: "uploadImage",
    todoId,
    fileName: file.name,
    contentType: file.type || "image/jpeg",
    dataBase64: await fileToBase64(file),
  });

  return body?.key || null;
}

/**
 * R2キーから画像の表示用URLを取得
 * パブリックアクセスが無効な場合はPresigned URLを生成
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  const body = await requestR2({
    action: "getImageUrl",
    imageKey: imageKeyOrUrl,
  });

  return body?.url || null;
}

/**
 * R2から画像を削除
 * @param imageKey 削除する画像のキー（R2キーまたはURL）
 * @returns 削除成功時true、失敗時false
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  const body = await requestR2({
    action: "deleteImage",
    imageKey,
  });

  return body?.deleted === true;
}

/**
 * ユーザーのアバター画像をR2から取得
 * @param userId ユーザーID
 * @returns アバター画像の表示用URL、存在しない場合はnull
 */
export async function getAvatarFromR2(userId: string): Promise<string | null> {
  const body = await requestR2({
    action: "getAvatar",
    userId,
  });

  return body?.url || null;
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
  const body = await requestR2({
    action: "getImageUrl",
    imageKey: imageUrl,
    expiresIn,
  });

  return body?.url || null;
}
