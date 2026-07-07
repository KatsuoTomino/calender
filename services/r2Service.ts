import { supabase } from "./supabaseClient";

const R2_API_PATH = "/api/r2";

type R2JsonResponse<T> = T & {
  error?: string;
};

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

async function requestJson<T>(body: Record<string, unknown>): Promise<T | null> {
  const authHeader = await getAuthorizationHeader();
  if (!authHeader) {
    return null;
  }

  try {
    const response = await fetch(R2_API_PATH, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as R2JsonResponse<T>;

    if (!response.ok) {
      console.error("R2 APIエラー:", data.error || response.statusText);
      return null;
    }

    return data;
  } catch (error) {
    console.error("R2 APIリクエストエラー:", error);
    return null;
  }
}

async function requestUpload<T>(formData: FormData): Promise<T | null> {
  const authHeader = await getAuthorizationHeader();
  if (!authHeader) {
    return null;
  }

  try {
    const response = await fetch(R2_API_PATH, {
      method: "POST",
      headers: authHeader,
      body: formData,
    });
    const data = (await response.json()) as R2JsonResponse<T>;

    if (!response.ok) {
      console.error("R2 APIアップロードエラー:", data.error || response.statusText);
      return null;
    }

    return data;
  } catch (error) {
    console.error("R2 APIアップロードリクエストエラー:", error);
    return null;
  }
}

/**
 * ユーザーアバター画像をR2にアップロード
 * Vite docs: VITE_* values are bundled into client code, so signing happens in /api/r2.
 */
export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  const formData = new FormData();
  formData.append("action", "uploadAvatar");
  formData.append("userId", userId);
  formData.append("file", file);

  const data = await requestUpload<{ key: string }>(formData);
  return data?.key ?? null;
}

/**
 * 画像ファイルをR2にアップロード
 */
export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  const formData = new FormData();
  formData.append("action", "uploadImage");
  formData.append("todoId", todoId);
  formData.append("file", file);

  const data = await requestUpload<{ key: string }>(formData);
  return data?.key ?? null;
}

/**
 * R2キーから画像の表示用URLを取得
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  const data = await requestJson<{ url: string | null }>({
    action: "getUrl",
    key: imageKeyOrUrl,
  });

  return data?.url ?? null;
}

/**
 * R2から画像を削除
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  const data = await requestJson<{ ok: boolean }>({
    action: "delete",
    key: imageKey,
  });

  return data?.ok === true;
}

/**
 * ユーザーのアバター画像をR2から取得
 */
export async function getAvatarFromR2(userId: string): Promise<string | null> {
  const data = await requestJson<{ url: string | null }>({
    action: "getAvatar",
    userId,
  });

  return data?.url ?? null;
}

/**
 * 既存呼び出し互換用。R2キーから短命の表示URLを取得する。
 */
export async function getPresignedUrl(
  imageUrl: string,
  _expiresIn: number = 3600
): Promise<string | null> {
  return getImageUrl(imageUrl);
}

