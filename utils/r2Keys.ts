const R2_KEY_PATTERN = /^(todos\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+|users\/[A-Za-z0-9_-]+\/avatar\.[A-Za-z0-9]+)$/;

export function isValidR2Key(key: string): boolean {
  return R2_KEY_PATTERN.test(key) && !key.includes("..");
}

export function extractR2Key(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const url = new URL(value);
      const pathParts = url.pathname.split("/").filter(Boolean);
      const todosIndex = pathParts.indexOf("todos");
      if (todosIndex >= 0) {
        return pathParts.slice(todosIndex).join("/");
      }
      const usersIndex = pathParts.indexOf("users");
      if (usersIndex >= 0) {
        return pathParts.slice(usersIndex).join("/");
      }
      return url.pathname.replace(/^\/+/, "");
    } catch {
      return value;
    }
  }
  return value;
}

export function getAvatarKeys(userId: string): string[] {
  return ["jpg", "jpeg", "png", "webp", "gif"].map(
    (ext) => `users/${userId}/avatar.${ext}`
  );
}
