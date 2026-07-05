const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

export function getSafeImageExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension && IMAGE_EXTENSIONS.includes(extension as (typeof IMAGE_EXTENSIONS)[number])
    ? extension
    : "jpg";
}

export function buildTodoImageKey(
  todoId: string,
  fileName: string,
  timestamp = Date.now()
): string {
  return `todos/${todoId}/${timestamp}.${getSafeImageExtension(fileName)}`;
}

export function buildAvatarKey(userId: string, fileName: string): string {
  return `users/${userId}/avatar.${getSafeImageExtension(fileName)}`;
}

export function isSafeR2PathSegment(segment: string): boolean {
  return Boolean(segment) && !segment.includes("/") && !segment.includes("\\") && !segment.includes("..") && !/[\u0000-\u001f\u007f]/.test(segment);
}

export function normalizeR2Key(imageKeyOrUrl: string, bucketName?: string): string | null {
  const trimmed = imageKeyOrUrl.trim();
  if (!trimmed) return null;

  let key = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return null;
    }
  }

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  if (
    !key ||
    key.startsWith("/") ||
    key.includes("..") ||
    key.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(key)
  ) {
    return null;
  }

  return key;
}

export function isAllowedR2KeyForUser(key: string, userId: string): boolean {
  return key.startsWith("todos/") || key.startsWith(`users/${userId}/avatar.`);
}

export function avatarKeysForUser(userId: string): string[] {
  return IMAGE_EXTENSIONS.map((extension) => `users/${userId}/avatar.${extension}`);
}
