export const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const SAFE_SEGMENT_PATTERN = /[^a-zA-Z0-9._-]/g;
const DEFAULT_EXTENSION = "jpg";

function sanitizePathSegment(value: string): string {
  const sanitized = value.trim().replace(SAFE_SEGMENT_PATTERN, "_");
  return sanitized || "unknown";
}

export function getFileExtension(fileName: string): string {
  const rawExtension = fileName.split(".").pop()?.toLowerCase() || DEFAULT_EXTENSION;
  return /^[a-z0-9]+$/.test(rawExtension) ? rawExtension : DEFAULT_EXTENSION;
}

export function createTodoImageKey(
  todoId: string,
  fileName: string,
  timestamp: number = Date.now()
): string {
  return `todos/${sanitizePathSegment(todoId)}/${timestamp}.${getFileExtension(fileName)}`;
}

export function createAvatarKey(userId: string, fileName: string): string {
  return `users/${sanitizePathSegment(userId)}/avatar.${getFileExtension(fileName)}`;
}

export function createAvatarCandidateKeys(userId: string): string[] {
  const safeUserId = sanitizePathSegment(userId);
  return AVATAR_EXTENSIONS.map((ext) => `users/${safeUserId}/avatar.${ext}`);
}

export function normalizeR2Key(input: string, bucketName?: string): string | null {
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

  key = key.replace(/^\/+/, "");
  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  if (!key || key.includes("\\") || key.includes("\0")) return null;
  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  if (!key.startsWith("todos/") && !key.startsWith("users/")) return null;

  return key;
}
