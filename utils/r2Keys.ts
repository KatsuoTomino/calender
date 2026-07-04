export const R2_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const R2_KEY_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const R2_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i;

export function getSafeImageExtension(fileName: string, fallback = "jpg"): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || fallback;
  return R2_IMAGE_EXTENSIONS.includes(extension as (typeof R2_IMAGE_EXTENSIONS)[number])
    ? extension
    : fallback;
}

export function buildTodoImageKey(
  todoId: string,
  fileName: string,
  timestamp = Date.now()
): string {
  const extension = getSafeImageExtension(fileName);
  return `todos/${todoId}/${timestamp}.${extension}`;
}

export function buildAvatarKey(userId: string, fileName: string): string {
  const extension = getSafeImageExtension(fileName);
  return `users/${userId}/avatar.${extension}`;
}

export function normalizeR2Key(input: string, bucketName?: string): string | null {
  if (!input || typeof input !== "string") return null;

  let key = input.trim();
  if (!key) return null;

  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const url = new URL(key);
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return null;
    }
  }

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  if (
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("..") ||
    key.split("/").some((segment) => segment.length === 0)
  ) {
    return null;
  }

  return key;
}

export function isTodoImageKey(key: string): boolean {
  const parts = key.split("/");
  return (
    parts.length === 3 &&
    parts[0] === "todos" &&
    R2_KEY_SEGMENT_PATTERN.test(parts[1]) &&
    R2_FILE_NAME_PATTERN.test(parts[2])
  );
}

export function isAvatarKeyForUser(key: string, userId: string): boolean {
  const parts = key.split("/");
  return (
    parts.length === 3 &&
    parts[0] === "users" &&
    parts[1] === userId &&
    /^avatar\.(jpg|jpeg|png|webp|gif)$/i.test(parts[2])
  );
}

export function isAllowedR2KeyForUser(key: string, userId: string): boolean {
  return isTodoImageKey(key) || isAvatarKeyForUser(key, userId);
}
