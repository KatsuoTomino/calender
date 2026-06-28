import { supabase } from "./supabaseClient";
import { getFileExtension, normalizeR2Key } from "../utils/r2Keys";

type R2Action = "getUploadUrl" | "getDownloadUrl" | "deleteObject" | "getAvatar";

interface R2ApiResponse {
  url?: string | null;
  key?: string;
  deleted?: boolean;
  error?: string;
}

async function callR2Api(action: R2Action, payload: Record<string, unknown> = {}): Promise<R2ApiResponse | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.error("R2 APIの利用にはログインが必要です。");
    return null;
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const body = (await response.json().catch(() => null)) as R2ApiResponse | null;
  if (!response.ok) {
    console.error("R2 APIエラー:", body?.error || response.statusText);
    return null;
  }

  return body;
}

async function uploadFileWithPresignedUrl(
  key: string,
  file: File,
  contentType: string
): Promise<string | null> {
  const response = await callR2Api("getUploadUrl", { key, contentType });
  if (!response?.url) return null;

  const uploadResponse = await fetch(response.url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: file,
  });

  if (!uploadResponse.ok) {
    console.error("R2へのアップロードに失敗しました:", uploadResponse.statusText);
    return null;
  }

  return response.key || key;
}

/**
 * Vite exposes VITE_* variables to browser bundles:
 * https://vite.dev/guide/env-and-mode#env-variables
 * R2 secrets therefore stay in api/r2.ts and this client only requests signed URLs.
 */
export async function uploadAvatarToR2(file: File, userId: string): Promise<string | null> {
  try {
    const fileExtension = getFileExtension(file.name);
    const fileName = `users/${userId}/avatar.${fileExtension}`;
    return await uploadFileWithPresignedUrl(fileName, file, file.type || "image/jpeg");
  } catch (error) {
    console.error("R2へのアバター画像アップロードエラー:", error);
    return null;
  }
}

export async function uploadImageToR2(file: File, todoId: string): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const fileExtension = getFileExtension(file.name);
    const fileName = `todos/${todoId}/${timestamp}.${fileExtension}`;
    return await uploadFileWithPresignedUrl(fileName, file, file.type || "image/jpeg");
  } catch (error) {
    console.error("R2への画像アップロードエラー:", error);
    return null;
  }
}

export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  try {
    const key = normalizeR2Key(imageKeyOrUrl);
    if (!key) return null;

    const response = await callR2Api("getDownloadUrl", { key });
    return response?.url || null;
  } catch (error) {
    console.error("画像URL取得エラー:", error);
    return null;
  }
}

export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    const key = normalizeR2Key(imageKey);
    if (!key) return false;

    const response = await callR2Api("deleteObject", { key });
    return response?.deleted === true;
  } catch (error) {
    console.error("R2からの画像削除エラー:", error);
    return false;
  }
}

export async function getAvatarFromR2(userId: string): Promise<string | null> {
  if (!userId) return null;

  try {
    const response = await callR2Api("getAvatar");
    return response?.url || null;
  } catch (error) {
    console.error("アバター画像取得エラー:", error);
    return null;
  }
}

export async function getPresignedUrl(imageUrl: string): Promise<string | null> {
  return getImageUrl(imageUrl);
}
