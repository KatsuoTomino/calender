export const AVATAR_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const SAFE_KEY_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

export function sanitizeR2KeySegment(segment: string): string | null {
  const trimmed = segment.trim();
  return SAFE_KEY_SEGMENT_PATTERN.test(trimmed) ? trimmed : null;
}

export function getImageExtension(fileName: string, contentType?: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension && /^[a-z0-9]{1,8}$/.test(extension)) {
    return extension;
  }

  if (contentType?.startsWith("image/")) {
    const subtype = contentType.slice("image/".length).toLowerCase();
    if (subtype === "jpeg") return "jpg";
    if (/^[a-z0-9]{1,8}$/.test(subtype)) return subtype;
  }

  return "jpg";
}

export function normalizeR2Key(value: string, bucketName?: string): string | null {
  let key = value.trim();
  if (!key) return null;

  if (key.startsWith("http://") || key.startsWith("https://")) {
    try {
      const url = new URL(key);
      key = url.pathname;
    } catch {
      return null;
    }
  } else if (key.startsWith("r2://")) {
    try {
      const url = new URL(key);
      key = url.pathname;
    } catch {
      return null;
    }
  }

  key = key.replace(/^\/+/, "");

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  if (
    !key ||
    key.includes("\0") ||
    key.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return null;
  }

  return key;
}

export function isAllowedR2KeyForUser(key: string, userId: string): boolean {
  return key.startsWith("todos/") || key.startsWith(`users/${userId}/`);
}
