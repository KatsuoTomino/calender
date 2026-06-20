import { supabase } from "./supabaseClient";
import { normalizeR2Key } from "../utils/r2Keys";

interface R2ObjectResponse {
  key: string | null;
  url: string | null;
}

async function getAuthHeaders(): Promise<Headers | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

async function requestR2Json<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const authHeaders = await getAuthHeaders();
  if (!authHeaders) return null;

  const headers = new Headers(init.headers);
  authHeaders.forEach((value, key) => headers.set(key, value));

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    console.error("R2 APIエラー:", response.status, await response.text());
    return null;
  }

  return response.json() as Promise<T>;
}

export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      type: "avatar",
      fileName: file.name,
      userId,
    });
    const headers = new Headers();
    headers.set("Content-Type", file.type || "image/jpeg");

    const result = await requestR2Json<R2ObjectResponse>(`/api/r2?${params}`, {
      method: "POST",
      headers,
      body: file,
    });

    return result?.key ?? null;
  } catch (error) {
    console.error("アバター画像アップロードエラー:", error);
    return null;
  }
}

export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      type: "todo",
      todoId,
      fileName: file.name,
    });
    const headers = new Headers();
    headers.set("Content-Type", file.type || "image/jpeg");

    const result = await requestR2Json<R2ObjectResponse>(`/api/r2?${params}`, {
      method: "POST",
      headers,
      body: file,
    });

    return result?.key ?? null;
  } catch (error) {
    console.error("画像アップロードエラー:", error);
    return null;
  }
}

export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  try {
    const key = normalizeR2Key(imageKeyOrUrl);
    const params = new URLSearchParams({
      action: "url",
      key,
    });
    const result = await requestR2Json<R2ObjectResponse>(`/api/r2?${params}`);
    return result?.url ?? null;
  } catch (error) {
    console.error("画像URL取得エラー:", error);
    return null;
  }
}

export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    const key = normalizeR2Key(imageKey);
    const params = new URLSearchParams({ key });
    const result = await requestR2Json<{ ok: boolean }>(`/api/r2?${params}`, {
      method: "DELETE",
    });
    return result?.ok === true;
  } catch (error) {
    console.error("画像削除エラー:", error);
    return false;
  }
}

export async function getAvatarFromR2(userId: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: "avatar",
      userId,
    });
    const result = await requestR2Json<R2ObjectResponse>(`/api/r2?${params}`);
    return result?.url ?? null;
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
