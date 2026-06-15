export const R2_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

type R2ImageExtension = (typeof R2_IMAGE_EXTENSIONS)[number];

const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function getImageExtension(filename: string, fallback: R2ImageExtension = "jpg"): R2ImageExtension {
  const extension = filename.split(".").pop()?.toLowerCase();
  return R2_IMAGE_EXTENSIONS.includes(extension as R2ImageExtension)
    ? (extension as R2ImageExtension)
    : fallback;
}

export function buildTodoImageKey(todoId: string, filename: string, timestamp = Date.now()): string {
  if (!SAFE_ID_PATTERN.test(todoId)) {
    throw new Error("Invalid todo id");
  }

  return `todos/${todoId}/${timestamp}.${getImageExtension(filename)}`;
}

export function buildAvatarKey(userId: string, filename: string): string {
  if (!SAFE_ID_PATTERN.test(userId)) {
    throw new Error("Invalid user id");
  }

  return `users/${userId}/avatar.${getImageExtension(filename)}`;
}

export function normalizeR2Key(keyOrUrl: string, bucketName?: string): string {
  let key = keyOrUrl;

  if (keyOrUrl.startsWith("http://") || keyOrUrl.startsWith("https://")) {
    const url = new URL(keyOrUrl);
    key = url.pathname.replace(/^\/+/, "");
  }

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return key;
}

export function isSafeR2Key(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 512 &&
    !key.includes("..") &&
    !key.includes("\\") &&
    !key.startsWith("/") &&
    SAFE_KEY_PATTERN.test(key)
  );
}

export function isTodoImageKey(key: string): boolean {
  return (
    isSafeR2Key(key) &&
    /^todos\/[A-Za-z0-9_-]+\/\d+\.(jpg|jpeg|png|webp|gif)$/.test(key)
  );
}

export function isAvatarKeyForUser(key: string, userId: string): boolean {
  if (!SAFE_ID_PATTERN.test(userId)) return false;

  return (
    isSafeR2Key(key) &&
    new RegExp(`^users/${userId}/avatar\\.(jpg|jpeg|png|webp|gif)$`).test(key)
  );
}

export function canAccessR2Key(key: string, userId: string): boolean {
  return isTodoImageKey(key) || isAvatarKeyForUser(key, userId);
}
