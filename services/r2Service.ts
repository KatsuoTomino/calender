import { supabase } from "./supabaseClient";

const R2_API_PATH = "/api/r2";
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

type UploadUrlResponse = {
  key: string;
  uploadUrl: string;
};

type ImageUrlResponse = {
  url: string;
  key?: string;
};

type DeleteResponse = {
  success: boolean;
};

type R2ApiPayload =
  | {
      operation: "upload-url";
      target: "avatar";
      userId: string;
      fileName: string;
      contentType: string;
    }
  | {
      operation: "upload-url";
      target: "todo";
      todoId: string;
      fileName: string;
      contentType: string;
    }
  | { operation: "get-url"; imageKey: string }
  | { operation: "delete"; imageKey: string }
  | { operation: "get-avatar"; userId: string };

const getAccessToken = async (): Promise<string | null> => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("認証セッションの取得エラー:", error);
    return null;
  }

  return session?.access_token ?? null;
};

const callR2Api = async <T>(payload: R2ApiPayload): Promise<T | null> => {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  try {
    const response = await fetch(R2_API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("R2 APIエラー:", data?.error || response.statusText);
      return null;
    }

    return data as T;
  } catch (error) {
    console.error("R2 API呼び出しエラー:", error);
    return null;
  }
};

const normalizeImageKey = (imageKeyOrUrl: string): string => {
  if (imageKeyOrUrl.startsWith("http://") || imageKeyOrUrl.startsWith("https://")) {
    try {
      const url = new URL(imageKeyOrUrl);
      return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return imageKeyOrUrl;
    }
  }

  return imageKeyOrUrl;
};

const uploadFileWithSignedUrl = async (
  file: File,
  signedUrl: string
): Promise<boolean> => {
  const contentType = file.type || DEFAULT_CONTENT_TYPE;
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!response.ok) {
    console.error("R2署名付きURLへのアップロードエラー:", response.statusText);
    return false;
  }

  return true;
};

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
  const contentType = file.type || DEFAULT_CONTENT_TYPE;
  const upload = await callR2Api<UploadUrlResponse>({
    operation: "upload-url",
    target: "avatar",
    userId,
    fileName: file.name,
    contentType,
  });

  if (!upload) {
    return null;
  }

  const success = await uploadFileWithSignedUrl(file, upload.uploadUrl);
  if (!success) {
    return null;
  }

  return upload.key;
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
  const contentType = file.type || DEFAULT_CONTENT_TYPE;
  const upload = await callR2Api<UploadUrlResponse>({
    operation: "upload-url",
    target: "todo",
    todoId,
    fileName: file.name,
    contentType,
  });

  if (!upload) {
    return null;
  }

  const success = await uploadFileWithSignedUrl(file, upload.uploadUrl);
  if (!success) {
    return null;
  }

  return upload.key;
}

/**
 * R2キーから画像の表示用URLを取得
 * パブリックアクセスが無効な場合はPresigned URLを生成
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  const imageKey = normalizeImageKey(imageKeyOrUrl);
  const result = await callR2Api<ImageUrlResponse>({
    operation: "get-url",
    imageKey,
  });

  return result?.url ?? null;
}

/**
 * R2から画像を削除
 * @param imageKey 削除する画像のキー（R2キーまたはURL）
 * @returns 削除成功時true、失敗時false
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  const result = await callR2Api<DeleteResponse>({
    operation: "delete",
    imageKey: normalizeImageKey(imageKey),
  });

  return result?.success ?? false;
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

  const result = await callR2Api<ImageUrlResponse>({
    operation: "get-avatar",
    userId,
  });

  return result?.url ?? null;
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
