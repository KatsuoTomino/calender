import { supabase } from "./supabaseClient";

type R2ApiResponse<T> =
  | (T & { error?: never })
  | { error: string };

const getAccessToken = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Supabaseセッション取得エラー:", error);
    return null;
  }

  return data.session?.access_token ?? null;
};

const requestR2 = async <T>(
  body: Record<string, unknown>
): Promise<R2ApiResponse<T>> => {
  const token = await getAccessToken();
  if (!token) {
    return { error: "ログインが必要です" };
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as R2ApiResponse<T>;
  if (!response.ok) {
    return {
      error: "error" in payload ? payload.error : "R2 API request failed",
    };
  }

  return payload;
};

const getImageContentType = (file: File): string =>
  file.type || "application/octet-stream";

const putFileToSignedUrl = async (
  uploadUrl: string,
  file: File,
  contentType: string
): Promise<boolean> => {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  return response.ok;
};

/**
 * ユーザーアバター画像をR2にアップロード
 * @param file アップロードする画像ファイル
 * @param userId ユーザーID（サーバー側でログインユーザーと照合）
 * @returns アップロードされた画像のキー、失敗時はnull
 */
export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  try {
    console.log("📤 アバター画像アップロード開始:", file.name);

    const contentType = getImageContentType(file);
    const signedUrlResponse = await requestR2<{
      key: string;
      uploadUrl: string;
    }>({
      action: "createUploadUrl",
      uploadType: "avatar",
      fileName: file.name,
      contentType,
    });

    if ("error" in signedUrlResponse) {
      console.error("❌ アバター画像アップロードURL取得エラー:", signedUrlResponse.error);
      return null;
    }

    const uploaded = await putFileToSignedUrl(
      signedUrlResponse.uploadUrl,
      file,
      contentType
    );
    if (!uploaded) {
      console.error("❌ R2へのアバター画像アップロードに失敗しました");
      return null;
    }

    console.log("✅ R2へのアバター画像アップロード成功");
    return signedUrlResponse.key;
  } catch (error) {
    console.error("❌ R2へのアバター画像アップロードエラー:", error);
    return null;
  }
}

/**
 * 画像ファイルをR2にアップロード
 * @param file アップロードする画像ファイル
 * @param todoId TodoのID（ファイル名に使用）
 * @returns アップロードされた画像のキー、失敗時はnull
 */
export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  try {
    console.log("📤 画像アップロード開始:", file.name);

    const contentType = getImageContentType(file);
    const signedUrlResponse = await requestR2<{
      key: string;
      uploadUrl: string;
    }>({
      action: "createUploadUrl",
      uploadType: "todo",
      todoId,
      fileName: file.name,
      contentType,
    });

    if ("error" in signedUrlResponse) {
      console.error("❌ 画像アップロードURL取得エラー:", signedUrlResponse.error);
      return null;
    }

    const uploaded = await putFileToSignedUrl(
      signedUrlResponse.uploadUrl,
      file,
      contentType
    );
    if (!uploaded) {
      console.error("❌ R2への画像アップロードに失敗しました");
      return null;
    }

    console.log("✅ R2へのアップロード成功");
    return signedUrlResponse.key;
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
  try {
    const response = await requestR2<{ url: string }>({
      action: "getDownloadUrl",
      key: imageKeyOrUrl,
    });

    if ("error" in response) {
      console.error("❌ 画像URL取得エラー:", response.error);
      return null;
    }

    return response.url;
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
    const response = await requestR2<{ deleted: boolean }>({
      action: "deleteObject",
      key: imageKey,
    });

    if ("error" in response) {
      console.error("❌ R2からの画像削除エラー:", response.error);
      return false;
    }

    console.log("✅ R2からの画像削除成功:", imageKey);
    return response.deleted;
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
  try {
    const response = await requestR2<{ url: string | null }>({
      action: "getAvatar",
      userId,
    });

    if ("error" in response) {
      console.error("❌ アバター画像取得エラー:", response.error);
      return null;
    }

    return response.url;
  } catch (error) {
    console.error("❌ アバター画像取得エラー:", error);
    return null;
  }
}

/**
 * Presigned URLを生成（後方互換API）
 * @param imageUrl 画像のURLまたはR2キー
 * @returns Presigned URL、失敗時はnull
 */
export async function getPresignedUrl(
  imageUrl: string
): Promise<string | null> {
  return getImageUrl(imageUrl);
}
