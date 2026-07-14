const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const TODO_KEY = /^todos\/[^/]+\/[^/]+$/;
const USER_AVATAR_KEY = /^users\/[^/]+\/avatar\.[a-z0-9]+$/i;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafeObjectKey(key: unknown): key is string {
  if (typeof key !== "string" || !key) return false;
  if (key.includes("..") || key.includes("\\") || key.startsWith("/")) return false;
  if (key.length > 512) return false;
  return TODO_KEY.test(key) || USER_AVATAR_KEY.test(key);
}

export function isAllowedImageContentType(contentType: unknown): contentType is string {
  if (typeof contentType !== "string") return false;
  return IMAGE_CONTENT_TYPES.has(contentType.toLowerCase());
}

export function isValidUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID.test(userId);
}

/**
 * Authorize object-key access for an authenticated user.
 * - users/{uid}/avatar.* write/delete: only the owner
 * - users/{any}/avatar.* read: any authenticated user (family calendar)
 * - todos/{todoId}/... read/write/delete: any authenticated user (shared todos)
 */
export type KeyAccessResult =
  | { ok: true }
  | { ok: false; status: 400 | 403; error: string };

export function authorizeObjectKey(
  key: string,
  authUserId: string,
  mode: "read" | "write"
): KeyAccessResult {
  if (!isSafeObjectKey(key)) {
    return { ok: false, status: 400, error: "Invalid key" };
  }

  if (key.startsWith("users/")) {
    const ownerId = key.split("/")[1];
    if (!isValidUserId(ownerId)) {
      return { ok: false, status: 400, error: "Invalid key" };
    }
    if (mode === "write" && ownerId !== authUserId) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    return { ok: true };
  }

  // todos/... — shared family data; format already validated
  return { ok: true };
}

export const MAX_PRESIGN_KEYS = 50;
