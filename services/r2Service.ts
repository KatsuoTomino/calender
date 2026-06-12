import { supabase } from "./supabaseClient";

async function getAuthorizationHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.error("R2操作にはログインが必要です");
    return null;
  }

  return { Authorization: `Bearer ${session.access_token}` };
}

async function requestR2<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const authHeader = await getAuthorizationHeader();
  if (!authHeader) return null;

  // Vite公式docsでは VITE_* はクライアントバンドルへ露出するため、R2署名は /api/r2 に集約する。
  const response = await fetch(path, {
    ...init,
    headers: {
      ...authHeader,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("R2 APIエラー:", response.status, message);
    return null;
  }

  return response.json() as Promise<T>;
}

export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("action", "uploadAvatar");
    formData.append("userId", userId);
    formData.append("file", file);

    const result = await requestR2<{ key: string }>("/api/r2", {
      method: "POST",
      body: formData,
    });

    return result?.key || null;
  } catch (error) {
    console.error("R2へのアバター画像アップロードエラー:", error);
    return null;
  }
}

export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("action", "uploadImage");
    formData.append("todoId", todoId);
    formData.append("file", file);

    const result = await requestR2<{ key: string }>("/api/r2", {
      method: "POST",
      body: formData,
    });

    return result?.key || null;
  } catch (error) {
    console.error("R2への画像アップロードエラー:", error);
    return null;
  }
}

export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  try {
    const result = await requestR2<{ url: string | null }>(
      `/api/r2?key=${encodeURIComponent(imageKeyOrUrl)}`
    );

    return result?.url || null;
  } catch (error) {
    console.error("画像URL取得エラー:", error);
    return null;
  }
}

export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    const result = await requestR2<{ success: boolean }>(
      `/api/r2?key=${encodeURIComponent(imageKey)}`,
      { method: "DELETE" }
    );

    return result?.success === true;
  } catch (error) {
    console.error("R2からの画像削除エラー:", error);
    return false;
  }
}

export async function getAvatarFromR2(userId: string): Promise<string | null> {
  try {
    const result = await requestR2<{ url: string | null }>(
      `/api/r2?action=avatar&userId=${encodeURIComponent(userId)}`
    );

    return result?.url || null;
  } catch (error) {
    console.error("アバター画像取得エラー:", error);
    return null;
  }
}

export async function getPresignedUrl(
  imageUrl: string,
  _expiresIn: number = 3600
): Promise<string | null> {
  return getImageUrl(imageUrl);
}
