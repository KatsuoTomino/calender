export const SUPPORTED_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
] as const;

const SUPPORTED_EXTENSION_SET = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const TODO_KEY_PATTERN = /^todos\/[A-Za-z0-9_-]+\/[0-9]+\.(?:jpg|jpeg|png|webp|gif)$/;
const AVATAR_KEY_PATTERN = /^users\/[A-Za-z0-9_-]+\/avatar\.(?:jpg|jpeg|png|webp|gif)$/;

export function getSafeImageExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_EXTENSION_SET.has(extension) ? extension : "jpg";
}

function sanitizePathSegment(segment: string, fallback: string): string {
  return SAFE_SEGMENT_PATTERN.test(segment) ? segment : fallback;
}

export function makeTodoImageKey(
  todoId: string,
  fileName: string,
  timestamp = Date.now()
): string {
  const safeTodoId = sanitizePathSegment(todoId, "unknown");
  return `todos/${safeTodoId}/${timestamp}.${getSafeImageExtension(fileName)}`;
}

export function makeAvatarKey(userId: string, fileName: string): string {
  const safeUserId = sanitizePathSegment(userId, "unknown");
  return `users/${safeUserId}/avatar.${getSafeImageExtension(fileName)}`;
}

export function normalizeR2ObjectKey(
  imageKeyOrUrl: string,
  bucketName?: string
): string {
  let key = imageKeyOrUrl.trim();

  if (key.startsWith("http://") || key.startsWith("https://")) {
    const url = new URL(key);
    key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  }

  key = key.replace(/^\/+/, "");

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return key;
}

export function isAllowedR2ObjectKeyForUser(
  imageKeyOrUrl: string,
  userId: string,
  bucketName?: string
): boolean {
  const key = normalizeR2ObjectKey(imageKeyOrUrl, bucketName);

  if (
    key.includes("..") ||
    key.includes("\\") ||
    key.includes("//") ||
    key.startsWith("/")
  ) {
    return false;
  }

  if (TODO_KEY_PATTERN.test(key)) {
    return true;
  }

  if (!AVATAR_KEY_PATTERN.test(key)) {
    return false;
  }

  return key.startsWith(`users/${userId}/`);
}

export function assertAllowedR2ObjectKeyForUser(
  imageKeyOrUrl: string,
  userId: string,
  bucketName?: string
): string {
  const key = normalizeR2ObjectKey(imageKeyOrUrl, bucketName);

  if (!isAllowedR2ObjectKeyForUser(key, userId, bucketName)) {
    throw new Error("許可されていないR2オブジェクトキーです");
  }

  return key;
}
