export const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._!/'()*=-]*$/;

export function normalizeR2Key(keyOrUrl: string, bucketName?: string): string | null {
  const trimmed = keyOrUrl.trim();
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

  key = key.replace(/^\/+/, "");
  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  if (!isSafeR2Key(key)) return null;
  return key;
}

export function isSafeR2Key(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 1024 &&
    !key.includes("..") &&
    !key.includes("\\") &&
    !key.includes("//") &&
    SAFE_KEY_PATTERN.test(key)
  );
}

export function isTodoImageKey(key: string): boolean {
  return isSafeR2Key(key) && key.startsWith("todos/");
}

export function isAvatarKeyForUser(key: string, userId: string): boolean {
  return (
    isSafeR2Key(key) &&
    AVATAR_EXTENSIONS.some((ext) => key === `users/${userId}/avatar.${ext}`)
  );
}

export function isReadableR2Key(key: string, userId: string): boolean {
  return isTodoImageKey(key) || isAvatarKeyForUser(key, userId);
}

export function isWritableR2Key(key: string, userId: string): boolean {
  return isTodoImageKey(key) || isAvatarKeyForUser(key, userId);
}

export function getImageExtension(fileName: string, contentType?: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension && AVATAR_EXTENSIONS.includes(extension as (typeof AVATAR_EXTENSIONS)[number])) {
    return extension;
  }

  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/jpeg":
    case "image/jpg":
    default:
      return "jpg";
  }
}
