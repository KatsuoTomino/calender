import { supabase } from "./supabaseClient";
import { extractR2Key } from "../utils/r2Keys";

type R2Action =
  | "createUploadUrl"
  | "getDownloadUrl"
  | "deleteObject"
  | "getAvatar";

type R2Response = {
  key?: string | null;
  url?: string | null;
  uploadUrl?: string;
  ok?: boolean;
  error?: string;
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function r2Request(
  action: R2Action,
  payload: Record<string, unknown> = {}
): Promise<R2Response> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("ログインが必要です");
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const body = (await response.json()) as R2Response;
  if (!response.ok) {
    throw new Error(body.error || "R2操作に失敗しました");
  }
  return body;
}

function getSafeExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || "jpg";
  return /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
}

async function uploadFileWithSignedUrl(
  key: string,
  file: File
): Promise<string | null> {
  const { uploadUrl } = await r2Request("createUploadUrl", {
    key,
    contentType: file.type || "image/jpeg",
  });

  if (!uploadUrl) {
    return null;
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "image/jpeg",
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("R2へのアップロードに失敗しました");
  }

  return key;
}

export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  try {
    const fileExtension = getSafeExtension(file.name);
    const key = `users/${userId}/avatar.${fileExtension}`;
    return await uploadFileWithSignedUrl(key, file);
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
    const timestamp = Date.now();
    const fileExtension = getSafeExtension(file.name);
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${timestamp}`;
    const key = `todos/${todoId}/${timestamp}-${id}.${fileExtension}`;
    return await uploadFileWithSignedUrl(key, file);
  } catch (error) {
    console.error("R2への画像アップロードエラー:", error);
    return null;
  }
}

export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  try {
    const key = extractR2Key(imageKeyOrUrl);
    const { url } = await r2Request("getDownloadUrl", { key });
    return url ?? null;
  } catch (error) {
    console.error("画像URL取得エラー:", error);
    return null;
  }
}

export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    const key = extractR2Key(imageKey);
    await r2Request("deleteObject", { key });
    return true;
  } catch (error) {
    console.error("R2からの画像削除エラー:", error);
    return false;
  }
}

export async function getAvatarFromR2(userId: string): Promise<string | null> {
  if (!userId) {
    return null;
  }

  try {
    const { url } = await r2Request("getAvatar");
    return url ?? null;
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
