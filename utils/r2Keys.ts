const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const TODO_IMAGE_KEY_PATTERN =
  /^todos\/[A-Za-z0-9_-]+\/[0-9]+\.(jpg|jpeg|png|webp|gif)$/i;

export const R2_AVATAR_EXTENSIONS = [...IMAGE_EXTENSIONS];

function assertSafeId(value: string, label: string): void {
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error(`${label}に使用できない文字が含まれています`);
  }
}

export function getSafeImageExtension(fileName: string): string {
  const rawExtension = fileName.split(".").pop()?.toLowerCase() || "jpg";
  return IMAGE_EXTENSIONS.includes(rawExtension as (typeof IMAGE_EXTENSIONS)[number])
    ? rawExtension
    : "jpg";
}

export function buildTodoImageKey(
  todoId: string,
  timestamp: number,
  fileName: string
): string {
  assertSafeId(todoId, "Todo ID");
  return `todos/${todoId}/${timestamp}.${getSafeImageExtension(fileName)}`;
}

export function buildAvatarKey(userId: string, fileName: string): string {
  assertSafeId(userId, "ユーザーID");
  return `users/${userId}/avatar.${getSafeImageExtension(fileName)}`;
}

export function extractR2Key(keyOrUrl: string, bucketName?: string): string {
  let key = keyOrUrl.trim();

  if (key.startsWith("http://") || key.startsWith("https://")) {
    const url = new URL(key);
    key = url.pathname.replace(/^\/+/, "");
  }

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return key;
}

export function isTodoImageKey(key: string): boolean {
  return TODO_IMAGE_KEY_PATTERN.test(key);
}

export function isAvatarKeyForUser(key: string, userId: string): boolean {
  if (!SAFE_ID_PATTERN.test(userId)) return false;
  return R2_AVATAR_EXTENSIONS.some((ext) => key === `users/${userId}/avatar.${ext}`);
}

export function isAllowedR2KeyForUser(key: string, userId: string): boolean {
  return isTodoImageKey(key) || isAvatarKeyForUser(key, userId);
}
