export const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const TODO_IMAGE_KEY_PATTERN = /^todos\/[^/]+\/[^/]+$/;
const AVATAR_KEY_PATTERN = /^users\/([^/]+)\/avatar\.(jpg|jpeg|png|webp|gif)$/i;

export function extractR2Key(input: string, bucketName?: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let key = trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      key = url.pathname;
    } catch {
      return null;
    }
  }

  key = key.replace(/^\/+/, "");

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  try {
    key = decodeURIComponent(key);
  } catch {
    return null;
  }

  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("\0") ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return null;
  }

  return key;
}

export function isAllowedR2Key(key: string, userId: string): boolean {
  if (TODO_IMAGE_KEY_PATTERN.test(key)) return true;

  const avatarMatch = key.match(AVATAR_KEY_PATTERN);
  if (!avatarMatch) return false;

  return avatarMatch[1] === userId;
}

export function buildAvatarKey(userId: string, extension: string): string {
  const safeExtension = AVATAR_EXTENSIONS.includes(extension.toLowerCase() as typeof AVATAR_EXTENSIONS[number])
    ? extension.toLowerCase()
    : "jpg";

  return `users/${userId}/avatar.${safeExtension}`;
}

export function buildTodoImageKey(todoId: string, extension: string, timestamp = Date.now()): string {
  const safeExtension = extension.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  return `todos/${todoId}/${timestamp}.${safeExtension}`;
}
