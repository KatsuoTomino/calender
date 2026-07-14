import { supabase } from "./supabaseClient";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("ログインセッションがありません。再ログインしてください。");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function apiPost<T = any>(path: string, body: object): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${res.status}`);
  }
  return res.json();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

async function uploadViaApi(
  file: File,
  key: string,
  contentType: string
): Promise<string> {
  const data = await fileToBase64(file);
  const { key: savedKey } = await apiPost<{ key: string }>("/api/r2/upload", {
    key,
    contentType,
    data,
  });
  return savedKey;
}

/**
 * ユーザーアバター画像をR2にアップロード
 */
export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  try {
    const fileExtension = file.name.split(".").pop() || "jpg";
    const key = `users/${userId}/avatar.${fileExtension}`;
    const contentType = file.type || "image/jpeg";
    return await uploadViaApi(file, key, contentType);
  } catch (error: any) {
    console.error("Avatar upload error:", error.message);
    return null;
  }
}

/**
 * 画像ファイルをR2にアップロード
 */
export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const fileExtension = file.name.split(".").pop() || "jpg";
    const key = `todos/${todoId}/${timestamp}.${fileExtension}`;
    const contentType = file.type || "image/jpeg";
    return await uploadViaApi(file, key, contentType);
  } catch (error: any) {
    console.error("Image upload error:", error.message);
    return null;
  }
}

/**
 * R2キーから画像の表示用URLを取得（サーバーサイドでPresigned URLを生成）
 */
export async function getImageUrl(
  imageKeyOrUrl: string
): Promise<string | null> {
  try {
    let imageKey = imageKeyOrUrl;
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://")
    ) {
      try {
        const url = new URL(imageKeyOrUrl);
        imageKey = url.pathname.substring(1);
      } catch {
        imageKey = imageKeyOrUrl;
      }
    }

    const { url } = await apiPost<{ url: string }>("/api/r2/presign-get", {
      key: imageKey,
    });
    return url ?? null;
  } catch (error: any) {
    console.error("Get image URL error:", error.message);
    return null;
  }
}

/**
 * R2から画像を削除
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    let key = imageKey;
    if (imageKey.startsWith("http://") || imageKey.startsWith("https://")) {
      const url = new URL(imageKey);
      key = url.pathname.substring(1);
    }

    await apiPost("/api/r2/delete", { key });
    return true;
  } catch (error: any) {
    console.error("Delete image error:", error.message);
    return false;
  }
}

/**
 * ユーザーのアバター画像をR2から取得
 */
export async function getAvatarFromR2(
  userId: string
): Promise<string | null> {
  if (!userId) return null;

  try {
    const { url } = await apiPost<{ url: string | null }>(
      "/api/r2/find-avatar",
      { userId }
    );
    return url;
  } catch (error: any) {
    console.error("Get avatar error:", error.message);
    return null;
  }
}

/**
 * Presigned URLを生成（互換性のために残す）
 */
export async function getPresignedUrl(
  imageUrl: string,
  _expiresIn: number = 3600
): Promise<string | null> {
  return getImageUrl(imageUrl);
}
