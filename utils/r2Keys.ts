const ALLOWED_R2_KEY_PREFIXES = ["todos/", "users/"] as const;

export function getFileExtension(fileName: string, fallback = "jpg"): string {
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension || fallback;
}

export function normalizeR2Key(input: string, bucketName?: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let key = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      key = url.pathname.replace(/^\/+/, "");
      if (bucketName && key.startsWith(`${bucketName}/`)) {
        key = key.slice(bucketName.length + 1);
      }
    } catch {
      return null;
    }
  }

  if (
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("..") ||
    key.includes("?") ||
    key.includes("#")
  ) {
    return null;
  }

  if (!ALLOWED_R2_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return null;
  }

  return key;
}
