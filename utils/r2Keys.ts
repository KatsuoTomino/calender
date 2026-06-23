export const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const IMAGE_EXTENSIONS = new Set<string>(AVATAR_EXTENSIONS);

export function getSafeImageExtension(fileName: string): string {
  const rawExtension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const extension = rawExtension.replace(/[^a-z0-9]/g, "");
  return IMAGE_EXTENSIONS.has(extension) ? extension : "jpg";
}

export function normalizeR2Key(keyOrUrl: string, bucketName?: string): string {
  const trimmed = keyOrUrl.trim();
  if (!trimmed) return "";

  let key = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      key = url.pathname.replace(/^\/+/, "");
    } catch {
      key = trimmed;
    }
  }

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return key.replace(/^\/+/, "");
}

export function isAllowedTodoImageKey(key: string): boolean {
  return /^todos\/[^/]+\/[^/]+\.(?:jpg|jpeg|png|webp|gif)$/i.test(key);
}

export function isAllowedAvatarKey(key: string, userId: string): boolean {
  return AVATAR_EXTENSIONS.some((extension) => key === `users/${userId}/avatar.${extension}`);
}

export function isAllowedR2KeyForUser(key: string, userId: string): boolean {
  return isAllowedTodoImageKey(key) || isAllowedAvatarKey(key, userId);
}
