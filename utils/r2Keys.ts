const ALLOWED_KEY_PREFIXES = ["todos/", "users/"];

export function normalizeR2Key(keyOrUrl: string): string | null {
  const trimmed = keyOrUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      const key = url.pathname.replace(/^\/+/, "");
      return key || null;
    }
  } catch {
    return null;
  }

  return trimmed.replace(/^\/+/, "") || null;
}

export function isAllowedR2Key(key: string): boolean {
  return ALLOWED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function assertAllowedR2Key(keyOrUrl: string): string {
  const key = normalizeR2Key(keyOrUrl);
  if (!key || !isAllowedR2Key(key) || key.includes("..")) {
    throw new Error("許可されていないR2キーです");
  }
  return key;
}
