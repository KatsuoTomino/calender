export const R2_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

export type R2ImageExtension = (typeof R2_IMAGE_EXTENSIONS)[number];

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const SAFE_FILE_PATTERN = /^[A-Za-z0-9_.-]+$/;

export function getSafeImageExtension(fileName: string, fallback: R2ImageExtension = "jpg"): R2ImageExtension {
  const rawExtension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (rawExtension && (R2_IMAGE_EXTENSIONS as readonly string[]).includes(rawExtension)) {
    return rawExtension as R2ImageExtension;
  }
  return fallback;
}

export function buildTodoImageKey(todoId: string, fileName: string, timestamp = Date.now()): string {
  if (!SAFE_SEGMENT_PATTERN.test(todoId)) {
    throw new Error("Invalid todo id for R2 key");
  }
  return `todos/${todoId}/${timestamp}.${getSafeImageExtension(fileName)}`;
}

export function buildAvatarKey(userId: string, fileName: string): string {
  if (!SAFE_SEGMENT_PATTERN.test(userId)) {
    throw new Error("Invalid user id for R2 key");
  }
  return `users/${userId}/avatar.${getSafeImageExtension(fileName)}`;
}

export function normalizeR2Key(imageKeyOrUrl: string, bucketName?: string): string | null {
  const trimmed = imageKeyOrUrl.trim();
  if (!trimmed) return null;

  let key = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (bucketName && key.startsWith(`${bucketName}/`)) {
        key = key.slice(bucketName.length + 1);
      }
    } catch {
      return null;
    }
  }

  key = key.replace(/^\/+/, "");
  if (!key || key.includes("..") || key.includes("\\")) return null;
  return key;
}

export function isTodoImageKey(key: string): boolean {
  const parts = key.split("/");
  if (parts.length !== 3) return false;
  const [scope, todoId, fileName] = parts;
  if (scope !== "todos" || !SAFE_SEGMENT_PATTERN.test(todoId) || !SAFE_FILE_PATTERN.test(fileName)) {
    return false;
  }
  const extension = fileName.split(".").pop()?.toLowerCase();
  return !!extension && (R2_IMAGE_EXTENSIONS as readonly string[]).includes(extension);
}

export function isUserAvatarKeyForUser(key: string, userId: string): boolean {
  const parts = key.split("/");
  if (parts.length !== 3) return false;
  const [scope, keyUserId, fileName] = parts;
  if (scope !== "users" || keyUserId !== userId || !SAFE_SEGMENT_PATTERN.test(keyUserId)) {
    return false;
  }
  if (!fileName.startsWith("avatar.") || !SAFE_FILE_PATTERN.test(fileName)) return false;
  const extension = fileName.split(".").pop()?.toLowerCase();
  return !!extension && (R2_IMAGE_EXTENSIONS as readonly string[]).includes(extension);
}

export function isAllowedR2KeyForUser(key: string, userId: string): boolean {
  return isTodoImageKey(key) || isUserAvatarKeyForUser(key, userId);
}
