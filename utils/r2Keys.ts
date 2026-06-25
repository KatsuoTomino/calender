const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

export type AllowedImageExtension = (typeof ALLOWED_IMAGE_EXTENSIONS)[number];

const allowedExtensionSet = new Set<string>(ALLOWED_IMAGE_EXTENSIONS);

export function getSafeImageExtension(fileName: string): AllowedImageExtension {
  const extension = fileName.split(".").pop()?.toLowerCase() || "jpg";
  return allowedExtensionSet.has(extension)
    ? (extension as AllowedImageExtension)
    : "jpg";
}

export function buildTodoImageKey(
  todoId: string,
  timestamp: number,
  extension: string
): string {
  return `todos/${todoId}/${timestamp}.${extension}`;
}

export function buildAvatarKey(userId: string, extension: string): string {
  return `users/${userId}/avatar.${extension}`;
}

export function avatarKeysForUser(userId: string): string[] {
  return ALLOWED_IMAGE_EXTENSIONS.map((extension) => buildAvatarKey(userId, extension));
}

export function normalizeR2Key(input: string, bucketName?: string): string {
  let key = input.trim();

  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const url = new URL(key);
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      // Keep the original value and let validation reject malformed keys.
    }
  }

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return key.replace(/^\/+/, "");
}

export function isSafeR2Key(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 512 &&
    !key.includes("..") &&
    !key.includes("\\") &&
    !key.startsWith("/") &&
    !key.includes("//")
  );
}

export function isAllowedImageKeyForUser(key: string, userId: string): boolean {
  if (!isSafeR2Key(key)) return false;

  if (key.startsWith("todos/")) {
    return /^todos\/[A-Za-z0-9_-]+\/[0-9]+\.(jpg|jpeg|png|webp|gif)$/.test(key);
  }

  return avatarKeysForUser(userId).includes(key);
}
