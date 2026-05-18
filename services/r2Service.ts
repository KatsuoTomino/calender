import { supabase } from "./supabaseClient";

type UploadUrlResponse = {
  key: string;
  uploadUrl: string;
};

type ImageUrlResponse = {
  url: string | null;
};

type DeleteResponse = {
  success: boolean;
};

const R2_API_PATH = "/api/r2";

async function getAuthorizationHeader(): Promise<Record<string, string> | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    console.error("R2 API認証トークンの取得に失敗しました:", error);
    return null;
  }

  return {
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

async function callR2Api<T>(
  path: string,
  init: RequestInit = {}
): Promise<T | null> {
  const authHeader = await getAuthorizationHeader();
  if (!authHeader) return null;

  const response = await fetch(path, {
    ...init,
    headers: {
      ...authHeader,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // レスポンスがJSONでない場合はHTTPステータスを使用
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function getKeyFromUrlOrKey(imageKeyOrUrl: string): string {
  if (
    imageKeyOrUrl.startsWith("http://") ||
    imageKeyOrUrl.startsWith("https://")
  ) {
    return imageKeyOrUrl;
  }

  return imageKeyOrUrl;
}

async function requestUploadUrl(
  body:
    | {
        operation: "upload-url";
        kind: "avatar";
        fileName: string;
        contentType?: string;
      }
    | {
        operation: "upload-url";
        kind: "todo";
        todoId: string;
        fileName: string;
        contentType?: string;
      }
): Promise<UploadUrlResponse | null> {
  return callR2Api<UploadUrlResponse>(R2_API_PATH, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function uploadFileWithSignedUrl(
  uploadUrl: string,
  file: File
): Promise<boolean> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  return response.ok;
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

    // ViteのVITE_*変数はクライアントバンドルへ露出するため、R2認証情報は
    // Vercel Function側に保持し、ブラウザには署名付きURLだけを渡す。
    // https://vite.dev/guide/env-and-mode#env-variables
    const uploadTarget = await requestUploadUrl({
      operation: "upload-url",
      kind: "avatar",
      fileName: file.name,
      contentType: file.type || "image/jpeg",
    });

    if (!uploadTarget) {
      console.error("❌ アバター画像アップロードURLの取得に失敗しました");
      return null;
    }

    console.log("📁 ファイル名:", uploadTarget.key, "userId:", userId);

    const uploaded = await uploadFileWithSignedUrl(uploadTarget.uploadUrl, file);
    if (!uploaded) {
      console.error("❌ R2へのアバター画像アップロードに失敗しました");
      return null;
    }

    console.log("✅ R2へのアバター画像アップロード成功");

    return uploadTarget.key;
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

    const uploadTarget = await requestUploadUrl({
      operation: "upload-url",
      kind: "todo",
      todoId,
      fileName: file.name,
      contentType: file.type || "image/jpeg",
    });

    if (!uploadTarget) {
      console.error("❌ 画像アップロードURLの取得に失敗しました");
      return null;
    }

    console.log("📁 ファイル名:", uploadTarget.key);

    const uploaded = await uploadFileWithSignedUrl(uploadTarget.uploadUrl, file);
    if (!uploaded) {
      console.error("❌ R2への画像アップロードに失敗しました");
      return null;
    }

    console.log("✅ R2へのアップロード成功");

    return uploadTarget.key;
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
    const key = getKeyFromUrlOrKey(imageKeyOrUrl);
    const result = await callR2Api<ImageUrlResponse>(
      `${R2_API_PATH}?operation=image-url&key=${encodeURIComponent(key)}`
    );

    if (result?.url) {
      console.log("✅ Presigned URL取得成功:", imageKeyOrUrl);
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
    const result = await callR2Api<DeleteResponse>(R2_API_PATH, {
      method: "POST",
      body: JSON.stringify({
        operation: "delete",
        key: getKeyFromUrlOrKey(imageKey),
      }),
    });

    console.log("✅ R2からの画像削除成功:", imageKey);
    return !!result?.success;
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
    const result = await callR2Api<ImageUrlResponse>(
      `${R2_API_PATH}?operation=avatar-url&userId=${encodeURIComponent(userId)}`
    );

    if (result?.url) {
      console.log(`✅ アバター画像をR2から取得成功: userId=${userId}`);
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
