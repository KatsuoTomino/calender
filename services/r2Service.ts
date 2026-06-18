import { supabase } from "./supabaseClient";

type R2Action =
  | "uploadImage"
  | "uploadAvatar"
  | "getImageUrl"
  | "getAvatar"
  | "deleteImage";

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Supabaseセッション取得エラー:", error);
    return null;
  }
  return data.session?.access_token ?? null;
}

async function requestR2Json<T>(action: R2Action, body: Record<string, unknown>): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2操作にはログインが必要です");
    return null;
  }

  // ViteはVITE_*をクライアントへ埋め込むため、R2資格情報は/api/r2内に限定する。
  // https://vite.dev/guide/env-and-mode#env-variables
  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...body }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`R2 APIエラー (${response.status}):`, text);
    return null;
  }

  return (await response.json()) as T;
}

async function uploadFile(action: Extract<R2Action, "uploadImage" | "uploadAvatar">, file: File, id: string): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2アップロードにはログインが必要です");
    return null;
  }

  const formData = new FormData();
  formData.append("action", action);
  formData.append("file", file);
  formData.append(action === "uploadImage" ? "todoId" : "userId", id);

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`R2アップロードエラー (${response.status}):`, text);
    return null;
  }

  const result = (await response.json()) as { key?: string };
  return result.key ?? null;
}

export async function uploadAvatarToR2(file: File, userId: string): Promise<string | null> {
  return uploadFile("uploadAvatar", file, userId);
}

export async function uploadImageToR2(file: File, todoId: string): Promise<string | null> {
  return uploadFile("uploadImage", file, todoId);
}

export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  const result = await requestR2Json<{ url?: string }>("getImageUrl", { key: imageKeyOrUrl });
  return result?.url ?? null;
}

export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  const result = await requestR2Json<{ deleted?: boolean }>("deleteImage", { key: imageKey });
  return result?.deleted === true;
}

export async function getAvatarFromR2(userId: string): Promise<string | null> {
  const result = await requestR2Json<{ url?: string }>("getAvatar", { userId });
  return result?.url ?? null;
}

export async function getPresignedUrl(imageUrl: string): Promise<string | null> {
  return getImageUrl(imageUrl);
}
