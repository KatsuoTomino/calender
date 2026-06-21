export const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function getSafeFileExtension(
  fileName: string,
  contentType?: string
): string {
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (extension && AVATAR_EXTENSIONS.includes(extension as typeof AVATAR_EXTENSIONS[number])) {
    return extension;
  }

  const contentTypeExtension = contentType
    ? CONTENT_TYPE_EXTENSION[contentType.toLowerCase()]
    : undefined;

  return contentTypeExtension || "jpg";
}

export function assertSafePathSegment(segment: string, name: string): void {
  if (!segment || segment.includes("/") || segment.includes("\\") || segment.includes("..")) {
    throw new Error(`${name} is invalid`);
  }
}

export function buildAvatarKey(userId: string, extension: string): string {
  assertSafePathSegment(userId, "userId");
  const safeExtension = getSafeFileExtension(`avatar.${extension}`);
  return `users/${userId}/avatar.${safeExtension}`;
}

export function buildTodoImageKey(
  todoId: string,
  extension: string,
  uniquePart: string = `${Date.now()}-${crypto.randomUUID()}`
): string {
  assertSafePathSegment(todoId, "todoId");
  assertSafePathSegment(uniquePart, "uniquePart");
  const safeExtension = getSafeFileExtension(`image.${extension}`);
  return `todos/${todoId}/${uniquePart}.${safeExtension}`;
}

export function normalizeR2Key(value: string, bucketName?: string): string | null {
  if (!value) return null;

  let key = value.trim();

  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const url = new URL(key);
      key = url.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return null;
  }

  return key;
}

export function isAllowedR2Key(key: string): boolean {
  const extensions = AVATAR_EXTENSIONS.join("|");
  return (
    new RegExp(`^users/[^/]+/avatar\\.(${extensions})$`).test(key) ||
    new RegExp(`^todos/[^/]+/[^/]+\\.(${extensions})$`).test(key)
  );
}

export function isOwnAvatarKey(key: string, userId: string): boolean {
  return new RegExp(`^users/${escapeRegExp(userId)}/avatar\\.(${AVATAR_EXTENSIONS.join("|")})$`).test(key);
}

export function getTodoIdFromR2Key(key: string): string | null {
  const match = key.match(/^todos\/([^/]+)\/[^/]+\.[a-z0-9]+$/);
  return match?.[1] ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
