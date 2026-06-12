const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || "jpg";
  return ALLOWED_IMAGE_EXTENSIONS.has(extension) ? extension : "jpg";
}

export function normalizeR2Key(keyOrUrl: string, bucketName?: string): string | null {
  const trimmed = keyOrUrl.trim();
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

  return isSafeR2Key(key) ? key : null;
}

export function isSafeR2Key(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 1024 &&
    !key.startsWith("/") &&
    !key.includes("\\") &&
    !key.includes("//") &&
    key.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

export function generateTodoImageKey(
  todoId: string,
  fileName: string,
  timestamp: number = Date.now()
): string {
  return `todos/${todoId}/${timestamp}.${getFileExtension(fileName)}`;
}

export function generateAvatarKey(userId: string, fileName: string): string {
  return `users/${userId}/avatar.${getFileExtension(fileName)}`;
}

export function isTodoImageKey(key: string): boolean {
  const match = key.match(/^todos\/[^/]+\/\d+\.([a-zA-Z0-9]+)$/);
  return !!match && ALLOWED_IMAGE_EXTENSIONS.has(match[1].toLowerCase());
}

export function isAvatarKeyForUser(key: string, userId: string): boolean {
  const match = key.match(/^users\/([^/]+)\/avatar\.([a-zA-Z0-9]+)$/);
  return !!match && match[1] === userId && ALLOWED_IMAGE_EXTENSIONS.has(match[2].toLowerCase());
}

export function isAllowedR2KeyForUser(key: string, userId: string): boolean {
  return isSafeR2Key(key) && (isTodoImageKey(key) || isAvatarKeyForUser(key, userId));
}
