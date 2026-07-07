const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

const TODO_KEY_PATTERN = /^todos\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;
const AVATAR_KEY_PATTERN = /^users\/[A-Za-z0-9_-]+\/avatar\.(jpg|jpeg|png|webp|gif)$/i;

export function getSafeImageExtension(fileName: string, contentType?: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension && IMAGE_EXTENSIONS.includes(extension as (typeof IMAGE_EXTENSIONS)[number])) {
    return extension;
  }

  const typeExtension = contentType?.split("/").pop()?.toLowerCase();
  if (typeExtension && IMAGE_EXTENSIONS.includes(typeExtension as (typeof IMAGE_EXTENSIONS)[number])) {
    return typeExtension;
  }

  return "jpg";
}

export function assertSafeKeySegment(segment: string, name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new Error(`${name} contains invalid characters`);
  }

  return segment;
}

export function normalizeR2Key(keyOrUrl: string, bucketName?: string): string {
  let key = keyOrUrl.trim();

  if (key.startsWith("http://") || key.startsWith("https://")) {
    const url = new URL(key);
    key = url.pathname.replace(/^\/+/, "");
  }

  if (bucketName && key.startsWith(`${bucketName}/`)) {
    key = key.slice(bucketName.length + 1);
  }

  return key;
}

export function assertAllowedR2Key(keyOrUrl: string, bucketName?: string): string {
  const key = normalizeR2Key(keyOrUrl, bucketName);

  if (key.includes("..") || key.startsWith("/") || key.endsWith("/")) {
    throw new Error("Invalid R2 object key");
  }

  if (!TODO_KEY_PATTERN.test(key) && !AVATAR_KEY_PATTERN.test(key)) {
    throw new Error("R2 object key is outside the allowed image prefixes");
  }

  return key;
}

