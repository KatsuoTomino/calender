import { supabase } from "./supabaseClient";
import { buildAvatarKey, buildTodoImageKey } from "../utils/r2Keys";

type R2JsonResponse = {
  key?: string | null;
  url?: string | null;
  deleted?: boolean;
  error?: string;
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("Supabaseセッション取得エラー:", error);
    return null;
  }

  return session?.access_token || null;
}

async function callR2Api(body: Record<string, unknown> | FormData): Promise<R2JsonResponse | null> {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2 APIの呼び出しにはログインが必要です。");
    return null;
  }

  const isFormData = body instanceof FormData;
  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
    },
    body: isFormData ? body : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as R2JsonResponse | null;
  if (!response.ok) {
    console.error("R2 APIエラー:", payload?.error || response.statusText);
    return null;
  }

  return payload;
}

async function uploadFileToR2(file: File, key: string): Promise<string | null> {
  const formData = new FormData();
  formData.set("action", "upload");
  formData.set("key", key);
  formData.set("contentType", file.type || "application/octet-stream");
  formData.set("file", file);

  const result = await callR2Api(formData);
  return result?.key || null;
}

/**
 * R2 secrets stay behind the same-origin Vercel Function because Vite exposes
 * VITE_* variables to browser bundles: https://vite.dev/guide/env-and-mode
 */
export async function uploadAvatarToR2(file: File, userId: string): Promise<string | null> {
  try {
    const extension = file.name.split(".").pop() || "jpg";
    return await uploadFileToR2(file, buildAvatarKey(userId, extension));
  } catch (error) {
    console.error("R2へのアバター画像アップロードエラー:", error);
    return null;
  }
}

export async function uploadImageToR2(file: File, todoId: string): Promise<string | null> {
  try {
    const extension = file.name.split(".").pop() || "jpg";
    return await uploadFileToR2(file, buildTodoImageKey(todoId, extension));
  } catch (error) {
    console.error("R2への画像アップロードエラー:", error);
    return null;
  }
}

export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  try {
    const result = await callR2Api({
      action: "get-url",
      key: imageKeyOrUrl,
      expiresIn: 3600 * 24 * 7,
    });

    return result?.url || null;
  } catch (error) {
    console.error("画像URL取得エラー:", error);
    return null;
  }
}

export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    const result = await callR2Api({
      action: "delete",
      key: imageKey,
    });

    return result?.deleted === true;
  } catch (error) {
    console.error("R2からの画像削除エラー:", error);
    return false;
  }
}

export async function getAvatarFromR2(userId: string): Promise<string | null> {
  try {
    const result = await callR2Api({
      action: "get-avatar",
      userId,
    });

    return result?.url || null;
  } catch (error) {
    console.error("アバター画像取得エラー:", error);
    return null;
  }
}

export async function getPresignedUrl(imageUrl: string, expiresIn = 3600): Promise<string | null> {
  try {
    const result = await callR2Api({
      action: "get-url",
      key: imageUrl,
      expiresIn,
    });

    return result?.url || null;
  } catch (error) {
    console.error("Presigned URL生成エラー:", error);
    return null;
  }
}
