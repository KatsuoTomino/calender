const ALLOWED_R2_PREFIXES = ["todos/", "users/"] as const;
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export function normalizeR2Key(input: string, bucketName?: string): string {
  let key = input.trim();

  if (key.startsWith("r2://")) {
    key = key.replace(/^r2:\/\/[^/]+\//, "");
  } else if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      key = new URL(key).pathname.replace(/^\/+/, "");
    } catch {
      return "";
    }
  }

  key = key.replace(/^\/+/, "");
  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return key;
}

export function isAllowedR2Key(key: string): boolean {
  if (!key || key.includes("..") || key.includes("\\") || key.startsWith("/")) {
    return false;
  }

  return ALLOWED_R2_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function sanitizeImageExtension(fileName: string, fallback = "jpg"): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || fallback;
  return ALLOWED_IMAGE_EXTENSIONS.has(extension) ? extension : fallback;
}

export function isSafePathSegment(segment: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(segment);
}

export function buildTodoImageKey(todoId: string, fileName: string, now = Date.now()): string {
  if (!isSafePathSegment(todoId)) {
    throw new Error("Invalid todo id");
  }

  return `todos/${todoId}/${now}.${sanitizeImageExtension(fileName)}`;
}

export function buildAvatarKey(userId: string, fileName: string): string {
  if (!isSafePathSegment(userId)) {
    throw new Error("Invalid user id");
  }

  return `users/${userId}/avatar.${sanitizeImageExtension(fileName)}`;
}

export function getAvatarKeys(userId: string): string[] {
  if (!isSafePathSegment(userId)) {
    return [];
  }

  return Array.from(ALLOWED_IMAGE_EXTENSIONS, (extension) => `users/${userId}/avatar.${extension}`);
}

export function isOwnAvatarKey(key: string, userId: string): boolean {
  return getAvatarKeys(userId).includes(key);
}
