const ALLOWED_KEY_PREFIXES = ["todos/", "users/"];

export function normalizeR2Key(keyOrUrl: string): string | null {
  const rawValue = keyOrUrl.trim();
  if (!rawValue) {
    return null;
  }

  let key = rawValue;
  if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) {
    try {
      const url = new URL(rawValue);
      key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      return null;
    }
  }

  key = key.replace(/^\/+/, "");
  const normalizedParts: string[] = [];
  for (const part of key.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      return null;
    }
    normalizedParts.push(part);
  }

  const normalizedKey = normalizedParts.join("/");
  if (!ALLOWED_KEY_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix))) {
    return null;
  }

  return normalizedKey;
}

export function getFileExtension(fileName: string, fallback = "jpg"): string {
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension || fallback;
}

export function buildTodoImageKey(todoId: string, fileName: string): string {
  return `todos/${todoId}/${Date.now()}-${crypto.randomUUID()}.${getFileExtension(fileName)}`;
}

export function buildAvatarKey(userId: string, fileName: string): string {
  return `users/${userId}/avatar.${getFileExtension(fileName)}`;
}

export function isUserAvatarKeyForUser(key: string, userId: string): boolean {
  return key.startsWith(`users/${userId}/`);
}
