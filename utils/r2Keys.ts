const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

const TODO_KEY_PATTERN = /^todos\/[A-Za-z0-9_-]+\/\d+\.(jpg|jpeg|png|webp|gif)$/i;
const AVATAR_KEY_PATTERN = /^users\/[A-Za-z0-9_-]+\/avatar\.(jpg|jpeg|png|webp|gif)$/i;

export function getSafeImageExtension(fileName: string, fallback = "jpg"): string {
  const rawExtension = fileName.split(".").pop()?.toLowerCase() || fallback;
  return ALLOWED_IMAGE_EXTENSIONS.has(rawExtension) ? rawExtension : fallback;
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

export function normalizeR2Key(input: string, bucketName?: string): string {
  let key = input.trim();

  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const url = new URL(key);
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      key = input.trim();
    }
  }

  key = key.replace(/^\/+/, "");

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return key;
}

export function isAllowedR2Key(key: string): boolean {
  if (!key || key.includes("..") || key.includes("\\") || key.includes("//")) {
    return false;
  }

  return TODO_KEY_PATTERN.test(key) || AVATAR_KEY_PATTERN.test(key);
}

export function isAvatarKeyForUser(key: string, userId: string): boolean {
  return new RegExp(
    `^users/${escapeRegExp(userId)}/avatar\\.(jpg|jpeg|png|webp|gif)$`,
    "i"
  ).test(key);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
