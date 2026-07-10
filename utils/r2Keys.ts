const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const IMAGE_EXTENSION_SET = new Set<string>(IMAGE_EXTENSIONS);
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const TODO_IMAGE_KEY_PATTERN =
  /^todos\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i;
const AVATAR_KEY_PATTERN =
  /^users\/[A-Za-z0-9_-]+\/avatar\.(jpg|jpeg|png|webp|gif)$/i;

export function normalizeImageExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || "jpg";
  return IMAGE_EXTENSION_SET.has(extension) ? extension : "jpg";
}

export function isSafeR2Segment(segment: string): boolean {
  return SAFE_SEGMENT_PATTERN.test(segment);
}

export function buildAvatarKey(userId: string, fileName: string): string {
  return `users/${userId}/avatar.${normalizeImageExtension(fileName)}`;
}

export function buildTodoImageKey(
  todoId: string,
  fileName: string,
  uniquePart: string
): string {
  return `todos/${todoId}/${uniquePart}.${normalizeImageExtension(fileName)}`;
}

export function isAllowedR2Key(key: string): boolean {
  if (
    key.includes("..") ||
    key.includes("\\") ||
    key.startsWith("/") ||
    key.endsWith("/")
  ) {
    return false;
  }

  return TODO_IMAGE_KEY_PATTERN.test(key) || AVATAR_KEY_PATTERN.test(key);
}

export function isUserAvatarKey(key: string, userId: string): boolean {
  return new RegExp(`^users/${escapeRegExp(userId)}/avatar\\.(jpg|jpeg|png|webp|gif)$`, "i").test(key);
}

export function extractR2Key(input: string, bucketName?: string): string | null {
  const trimmed = input.trim();
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

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return isAllowedR2Key(key) ? key : null;
}

export function avatarCandidateKeys(userId: string): string[] {
  const keys = IMAGE_EXTENSIONS.map((ext) => `users/${userId}/avatar.${ext}`);
  return [
    ...keys,
    ...IMAGE_EXTENSIONS.map((ext) => `users/${userId}/avatar.${ext.toUpperCase()}`),
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
