import { supabase } from "./supabaseClient";
import {
  makeAvatarKey,
  makeTodoImageKey,
  normalizeR2ObjectKey,
} from "../utils/r2Keys";

type R2ApiResponse = {
  key?: string | null;
  url?: string | null;
  deleted?: boolean;
  error?: string;
};

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Supabaseセッション取得エラー:", error);
    return null;
  }

  return data.session?.access_token ?? null;
}

async function callR2Api(body: Record<string, unknown>): Promise<R2ApiResponse> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("ログインセッションが見つかりません");
  }

  // Vite docs: VITE_* values are bundled into client code, so R2 secrets stay
  // in the authenticated Vercel Function instead of this browser service.
  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as R2ApiResponse;

  if (!response.ok) {
    throw new Error(payload.error || "R2 API request failed");
  }

  return payload;
}

async function uploadFileWithPresignedUrl(
  file: File,
  key: string
): Promise<string | null> {
  try {
    const { url } = await callR2Api({
      action: "create-upload-url",
      key,
      contentType: file.type || "image/jpeg",
    });

    if (!url) {
      return null;
    }

    const uploadResponse = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "image/jpeg",
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`R2 upload failed: ${uploadResponse.status}`);
    }

    return key;
  } catch (error) {
    console.error("R2アップロードエラー:", error);
    return null;
  }
}

export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  const key = makeAvatarKey(userId, file.name);
  return uploadFileWithPresignedUrl(file, key);
}

export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  const key = makeTodoImageKey(todoId, file.name);
  return uploadFileWithPresignedUrl(file, key);
}

export async function getImageUrl(
  imageKeyOrUrl: string
): Promise<string | null> {
  try {
    const key = normalizeR2ObjectKey(imageKeyOrUrl);
    const { url } = await callR2Api({
      action: "create-read-url",
      key,
    });

    return url ?? null;
  } catch (error) {
    console.error("画像URL取得エラー:", error);
    return null;
  }
}

export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    const key = normalizeR2ObjectKey(imageKey);
    const { deleted } = await callR2Api({
      action: "delete-object",
      key,
    });

    return deleted === true;
  } catch (error) {
    console.error("R2画像削除エラー:", error);
    return false;
  }
}

export async function getAvatarFromR2(userId: string): Promise<string | null> {
  try {
    const { url } = await callR2Api({
      action: "get-avatar",
      userId,
    });

    return url ?? null;
  } catch (error) {
    console.error("アバター画像取得エラー:", error);
    return null;
  }
}

export async function getPresignedUrl(
  imageUrl: string,
  _expiresIn = 3600
): Promise<string | null> {
  return getImageUrl(imageUrl);
}
