const IMAGE_EXTENSION_RE = /^(jpg|jpeg|png|webp|gif)$/;
const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

export const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

export function sanitizeImageExtension(fileName: string, fallback = "jpg"): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || fallback;
  return IMAGE_EXTENSION_RE.test(extension) ? extension : fallback;
}

export function normalizeR2Key(input: string, bucketName?: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes("..") || /%2e/i.test(trimmed)) return null;

  let key = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      key = url.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return isSafeR2Key(key) ? key : null;
}

export function isSafeR2Key(key: string): boolean {
  if (!key || key.startsWith("/") || key.includes("\\") || key.includes("..")) {
    return false;
  }

  return key.split("/").every((segment) => segment.length > 0 && SAFE_SEGMENT_RE.test(segment));
}

export function buildTodoImageKey(todoId: string, fileName: string, uniqueId: string): string | null {
  if (!SAFE_SEGMENT_RE.test(todoId) || !SAFE_SEGMENT_RE.test(uniqueId)) {
    return null;
  }

  return `todos/${todoId}/${Date.now()}-${uniqueId}.${sanitizeImageExtension(fileName)}`;
}

export function buildAvatarKey(userId: string, fileName: string): string | null {
  if (!SAFE_SEGMENT_RE.test(userId)) {
    return null;
  }

  return `users/${userId}/avatar.${sanitizeImageExtension(fileName)}`;
}

export function isTodoImageKey(key: string): boolean {
  const parts = key.split("/");
  if (parts.length !== 3 || parts[0] !== "todos") {
    return false;
  }

  const [todoId, fileName] = [parts[1], parts[2]];
  const extension = fileName.split(".").pop()?.toLowerCase();
  return SAFE_SEGMENT_RE.test(todoId) && SAFE_SEGMENT_RE.test(fileName) && !!extension && IMAGE_EXTENSION_RE.test(extension);
}

export function isUserAvatarKeyForUser(key: string, userId: string): boolean {
  const parts = key.split("/");
  if (parts.length !== 3 || parts[0] !== "users" || parts[1] !== userId) {
    return false;
  }

  const match = /^avatar\.([A-Za-z0-9]+)$/.exec(parts[2]);
  return !!match && IMAGE_EXTENSION_RE.test(match[1].toLowerCase());
}

export function canAccessR2Key(key: string, userId: string): boolean {
  return isTodoImageKey(key) || isUserAvatarKeyForUser(key, userId);
}
