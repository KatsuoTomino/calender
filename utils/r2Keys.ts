const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export function getSafeImageExtension(fileName: string, fallback = "jpg"): string {
  const rawExtension = fileName.split(".").pop()?.toLowerCase() || fallback;
  const sanitized = rawExtension.replace(/[^a-z0-9]/g, "");
  return ALLOWED_IMAGE_EXTENSIONS.has(sanitized) ? sanitized : fallback;
}

export function buildTodoImageKey(
  todoId: string,
  fileName: string,
  timestamp = Date.now()
): string {
  return `todos/${todoId}/${timestamp}.${getSafeImageExtension(fileName)}`;
}

export function buildAvatarImageKey(userId: string, fileName: string): string {
  return `users/${userId}/avatar.${getSafeImageExtension(fileName)}`;
}

export function normalizeR2Key(imageKeyOrUrl: string, bucketName?: string): string | null {
  const trimmed = imageKeyOrUrl.trim();
  if (!trimmed) return null;

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

  key = key.replace(/^\/+/, "");
  if (!isAllowedR2Key(key)) return null;
  return key;
}

export function isAllowedR2Key(key: string): boolean {
  if (!key || key.includes("..") || key.includes("\\") || key.startsWith("/")) {
    return false;
  }
  return key.startsWith("todos/") || key.startsWith("users/");
}
