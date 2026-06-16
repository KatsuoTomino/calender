export const R2_AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const SAFE_EXTENSION_PATTERN = /^[a-z0-9]+$/;
const SAFE_R2_KEY_PATTERN = /^(users|todos)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

export function sanitizeFileExtension(fileName: string, fallback = "jpg"): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || fallback;
  if (!SAFE_EXTENSION_PATTERN.test(extension)) {
    return fallback;
  }
  return extension;
}

export function extractR2Key(imageKeyOrUrl: string, bucketName?: string | null): string {
  let key = imageKeyOrUrl.trim();

  if (key.startsWith("r2://")) {
    key = key.slice("r2://".length);
  } else if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const url = new URL(key);
      key = url.pathname.replace(/^\/+/, "");
    } catch {
      return key;
    }
  }

  key = key.replace(/^\/+/, "");

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return key;
}

export function isAllowedR2Key(key: string): boolean {
  if (!key || key.includes("..") || key.includes("//")) {
    return false;
  }
  return SAFE_R2_KEY_PATTERN.test(key);
}

export function getTodoIdFromImageKey(key: string): string | null {
  const match = key.match(/^todos\/([^/]+)\//);
  return match?.[1] ?? null;
}

export function isAvatarKeyForUser(key: string, userId: string): boolean {
  return R2_AVATAR_EXTENSIONS.some((extension) => key === `users/${userId}/avatar.${extension}`);
}

export function buildAvatarKey(userId: string, extension: string): string {
  return `users/${userId}/avatar.${extension}`;
}

export function buildTodoImageKey(todoId: string, timestamp: number, extension: string): string {
  return `todos/${todoId}/${timestamp}.${extension}`;
}
