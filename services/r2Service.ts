import { supabase } from "./supabaseClient";

type R2JsonAction =
  | { action: "getUrl"; imageKey: string }
  | { action: "getAvatar"; userId: string }
  | { action: "delete"; imageKey: string };

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function callR2Json<T>(payload: R2JsonAction): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2 API requires an authenticated Supabase session.");
    return null;
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error("R2 API request failed:", response.status, await response.text());
    return null;
  }

  return (await response.json()) as T;
}

async function uploadToR2(
  file: File,
  kind: "avatar" | "todo",
  ownerId: string
): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2 API requires an authenticated Supabase session.");
    return null;
  }

  const formData = new FormData();
  formData.append("action", "upload");
  formData.append("kind", kind);
  formData.append("ownerId", ownerId);
  formData.append("file", file);

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    console.error("R2 upload failed:", response.status, await response.text());
    return null;
  }

  const result = (await response.json()) as { key?: string };
  return result.key ?? null;
}

/**
 * Uploads a user avatar through the authenticated server API.
 * Docs: Vite exposes VITE_* variables to the browser, so R2 credentials stay server-side.
 * https://vite.dev/guide/env-and-mode
 */
export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  return uploadToR2(file, "avatar", userId);
}

export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  return uploadToR2(file, "todo", todoId);
}

export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  const result = await callR2Json<{ url?: string }>({
    action: "getUrl",
    imageKey: imageKeyOrUrl,
  });

  return result?.url ?? null;
}

export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  const result = await callR2Json<{ ok?: boolean }>({
    action: "delete",
    imageKey,
  });

  return result?.ok === true;
}

export async function getAvatarFromR2(userId: string): Promise<string | null> {
  const result = await callR2Json<{ url?: string | null }>({
    action: "getAvatar",
    userId,
  });

  return result?.url ?? null;
}

export async function getPresignedUrl(
  imageUrl: string,
  _expiresIn: number = 3600
): Promise<string | null> {
  return getImageUrl(imageUrl);
}
