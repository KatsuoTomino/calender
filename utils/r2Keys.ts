const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const SAFE_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const TODO_IMAGE_KEY_RE = /^todos\/[A-Za-z0-9_-]+\/\d+\.(jpg|jpeg|png|webp|gif)$/;
const AVATAR_KEY_RE = /^users\/([A-Za-z0-9_-]+)\/avatar\.(jpg|jpeg|png|webp|gif)$/;

export function getImageExtension(fileName: string, contentType?: string): string | null {
  const contentTypeExtension = contentType?.startsWith("image/")
    ? contentType.split("/")[1]?.toLowerCase()
    : null;
  const nameExtension = fileName.split(".").pop()?.toLowerCase() || null;
  const extension = contentTypeExtension || nameExtension;

  if (!extension) return null;
  const normalized = extension === "pjpeg" ? "jpeg" : extension;
  return IMAGE_EXTENSIONS.has(normalized) ? normalized : null;
}

export function buildTodoImageKey(
  todoId: string,
  fileName: string,
  contentType?: string,
  timestamp = Date.now()
): string | null {
  const extension = getImageExtension(fileName, contentType);
  if (!extension || !SAFE_SEGMENT_RE.test(todoId)) return null;
  return `todos/${todoId}/${timestamp}.${extension}`;
}

export function buildAvatarKey(
  userId: string,
  fileName: string,
  contentType?: string
): string | null {
  const extension = getImageExtension(fileName, contentType);
  if (!extension || !SAFE_SEGMENT_RE.test(userId)) return null;
  return `users/${userId}/avatar.${extension}`;
}

export function normalizeR2Key(keyOrUrl: string, bucketName?: string): string | null {
  const trimmed = keyOrUrl.trim();
  if (!trimmed) return null;

  let key = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (bucketName && key.startsWith(`${bucketName}/`)) {
        key = key.slice(bucketName.length + 1);
      }
    } catch {
      return null;
    }
  }

  if (key.includes("..") || key.includes("\\") || key.startsWith("/") || key.endsWith("/")) {
    return null;
  }

  return isTodoImageKey(key) || isAvatarKey(key) ? key : null;
}

export function isTodoImageKey(key: string): boolean {
  return TODO_IMAGE_KEY_RE.test(key);
}

export function isAvatarKey(key: string): boolean {
  return AVATAR_KEY_RE.test(key);
}

export function isAvatarKeyForUser(key: string, userId: string): boolean {
  const match = key.match(AVATAR_KEY_RE);
  return match?.[1] === userId;
}
