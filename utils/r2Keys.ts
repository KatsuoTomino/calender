const SAFE_EXTENSION_PATTERN = /^[a-z0-9]{1,10}$/i;
const SAFE_TODO_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_FILE_PART_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export function getSafeImageExtension(fileName: string, fallback = "jpg"): string {
  const rawExtension = fileName.split(".").pop()?.toLowerCase() || fallback;
  if (!SAFE_EXTENSION_PATTERN.test(rawExtension)) {
    return fallback;
  }
  return ALLOWED_IMAGE_EXTENSIONS.has(rawExtension) ? rawExtension : fallback;
}

export function normalizeR2Key(input: string, bucketName?: string): string | null {
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

  key = key.replace(/^\/+/, "");
  if (
    !key ||
    key.includes("\0") ||
    key.includes("\\") ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    return null;
  }

  return key;
}

export function isAllowedR2Key(key: string): boolean {
  const todoMatch = key.match(/^todos\/([^/]+)\/([^/]+)$/);
  if (todoMatch) {
    const [, todoId, fileName] = todoMatch;
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    return (
      SAFE_TODO_ID_PATTERN.test(todoId) &&
      SAFE_FILE_PART_PATTERN.test(fileName) &&
      ALLOWED_IMAGE_EXTENSIONS.has(extension)
    );
  }

  const avatarMatch = key.match(/^users\/([^/]+)\/avatar\.([A-Za-z0-9]+)$/);
  if (avatarMatch) {
    const [, userId, extension] = avatarMatch;
    return SAFE_TODO_ID_PATTERN.test(userId) && ALLOWED_IMAGE_EXTENSIONS.has(extension.toLowerCase());
  }

  return false;
}

export function isUserAvatarKey(key: string, userId: string): boolean {
  return key.startsWith(`users/${userId}/avatar.`) && isAllowedR2Key(key);
}

export function createTodoImageKey(todoId: string, fileName: string, uniquePart: string): string | null {
  if (!SAFE_TODO_ID_PATTERN.test(todoId) || !SAFE_FILE_PART_PATTERN.test(uniquePart)) {
    return null;
  }

  const extension = getSafeImageExtension(fileName);
  return `todos/${todoId}/${uniquePart}.${extension}`;
}

export function createAvatarKey(userId: string, fileName: string): string | null {
  if (!SAFE_TODO_ID_PATTERN.test(userId)) {
    return null;
  }

  const extension = getSafeImageExtension(fileName);
  return `users/${userId}/avatar.${extension}`;
}
