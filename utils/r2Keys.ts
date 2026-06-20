const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SAFE_R2_KEY_PATTERN = /^(todos|users)\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;

export function normalizeR2Key(input: string, bucketName?: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  let key = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      key = trimmed;
    }
  }

  key = key.replace(/^\/+/, "");
  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }
  return key;
}

export function isSafeR2Key(key: string): boolean {
  return (
    SAFE_R2_KEY_PATTERN.test(key) &&
    !key.includes("..") &&
    !key.includes("//") &&
    !key.includes("\\")
  );
}

export function isSafeR2Id(id: string): boolean {
  return SAFE_ID_PATTERN.test(id);
}

export function getImageExtension(fileName: string, fallback = "jpg"): string {
  const rawExtension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return rawExtension && IMAGE_EXTENSIONS.has(rawExtension) ? rawExtension : fallback;
}

export function buildTodoImageKey(
  todoId: string,
  fileName: string,
  timestamp = Date.now()
): string {
  if (!isSafeR2Id(todoId)) {
    throw new Error("Invalid todo id for R2 key");
  }
  return `todos/${todoId}/${timestamp}.${getImageExtension(fileName)}`;
}

export function buildAvatarKey(userId: string, fileName: string): string {
  if (!isSafeR2Id(userId)) {
    throw new Error("Invalid user id for R2 key");
  }
  return `users/${userId}/avatar.${getImageExtension(fileName)}`;
}

export function getAvatarUserIdFromKey(key: string): string | null {
  const match = /^users\/([A-Za-z0-9_-]+)\/avatar\.[A-Za-z0-9]+$/.exec(key);
  return match?.[1] ?? null;
}
