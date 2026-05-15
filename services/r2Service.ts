import { supabase } from "./supabaseClient";

// ViteはVITE_*環境変数をクライアントバンドルへ埋め込むため、
// R2のSecret Access Keyをブラウザで扱わない。
// Docs: https://vite.dev/guide/env-and-mode#env-variables
// R2の書き込み/削除はサーバー側で生成した署名付きURL経由にする必要がある。
// Docs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
const publicBaseUrl =
  import.meta.env.VITE_R2_PUBLIC_BASE_URL || import.meta.env.VITE_R2_ENDPOINT || "";

type R2Operation = "get" | "put" | "delete" | "head";

interface PresignResponse {
  url: string;
  key: string;
  expiresIn: number;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function buildPublicUrl(imageKey: string): string | null {
  if (!publicBaseUrl) return null;

  const baseUrl = publicBaseUrl.replace(/\/+$/, "");
  const normalizedKey = imageKey.replace(/^\/+/, "");
  const encodedKey = normalizedKey.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/${encodedKey}`;
}

function getFileExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  return extension.replace(/[^a-z0-9]/g, "") || "jpg";
}

function extractObjectKey(imageKeyOrUrl: string): string {
  if (!isHttpUrl(imageKeyOrUrl)) return imageKeyOrUrl;

  try {
    const url = new URL(imageKeyOrUrl);
    return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    return imageKeyOrUrl;
  }
}

async function requestPresignedUrl(
  operation: R2Operation,
  key: string,
  contentType?: string
): Promise<PresignResponse | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      console.error("R2署名付きURLの取得にはログインが必要です。");
      return null;
    }

    const response = await fetch("/api/r2/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ operation, key, contentType }),
    });

    if (!response.ok) {
      const message = await response.text();
      console.error("R2署名付きURLの取得に失敗しました:", message);
      return null;
    }

    return (await response.json()) as PresignResponse;
  } catch (error) {
    console.error("R2署名付きURLの取得エラー:", error);
    return null;
  }
}

/**
 * ユーザーアバター画像をR2にアップロード
 * @param file アップロードする画像ファイル
 * @param userId ユーザーID（ファイル名に使用）
 * @returns アップロードされた画像のURL（R2キーパス）、失敗時はnull
 */
export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  try {
    const contentType = file.type || "image/jpeg";
    const fileName = `users/${userId}/avatar.${getFileExtension(file)}`;
    const presigned = await requestPresignedUrl("put", fileName, contentType);
    if (!presigned) return null;

    const response = await fetch(presigned.url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });

    if (!response.ok) {
      console.error("❌ R2へのアバター画像アップロードエラー:", response.statusText);
      return null;
    }

    return fileName;
  } catch (error) {
    console.error("❌ R2へのアバター画像アップロードエラー:", error);
    return null;
  }
}

/**
 * 画像ファイルをR2にアップロード
 * @param file アップロードする画像ファイル
 * @param todoId TodoのID（ファイル名に使用）
 * @returns アップロードされた画像のURL（R2キーパス）、失敗時はnull
 */
export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  try {
    const contentType = file.type || "image/jpeg";
    const timestamp = Date.now();
    const fileName = `todos/${todoId}/${timestamp}.${getFileExtension(file)}`;
    const presigned = await requestPresignedUrl("put", fileName, contentType);
    if (!presigned) return null;

    const response = await fetch(presigned.url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });

    if (!response.ok) {
      console.error("❌ R2への画像アップロードエラー:", response.statusText);
      return null;
    }

    return fileName;
  } catch (error) {
    console.error("❌ R2への画像アップロードエラー:", error);
    return null;
  }
}

/**
 * R2キーから画像の表示用URLを取得
 * 公開URLが無い場合は認証済みサーバーAPIでPresigned URLを生成
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  if (isHttpUrl(imageKeyOrUrl)) return imageKeyOrUrl;

  const publicUrl = buildPublicUrl(imageKeyOrUrl);
  if (publicUrl) return publicUrl;

  const presigned = await requestPresignedUrl("get", imageKeyOrUrl);
  return presigned?.url ?? null;
}

/**
 * R2から画像を削除
 * @param imageKey 削除する画像のキー（R2キーまたはURL）
 * @returns 削除成功時true、失敗時false
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    const key = extractObjectKey(imageKey);
    const presigned = await requestPresignedUrl("delete", key);
    if (!presigned) return false;

    const response = await fetch(presigned.url, { method: "DELETE" });
    if (!response.ok) {
      console.error("❌ R2からの画像削除エラー:", response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error("❌ R2からの画像削除エラー:", error);
    return false;
  }
}

/**
 * ユーザーのアバター画像をR2から取得
 * @param userId ユーザーID
 * @returns アバター画像の表示用URL、存在しない場合はnull
 */
export async function getAvatarFromR2(userId: string): Promise<string | null> {
  if (!userId) {
    console.error("❌ userIdが指定されていません");
    return null;
  }

  const extensions = ["jpg", "jpeg", "png", "webp", "gif"];
  for (const ext of extensions) {
    const avatarKey = `users/${userId}/avatar.${ext}`;
    const presigned = await requestPresignedUrl("head", avatarKey);
    if (!presigned) continue;

    const response = await fetch(presigned.url, { method: "HEAD" });
    if (response.ok) {
      return getImageUrl(avatarKey);
    }
  }

  return null;
}

/**
 * Presigned URLを生成（プライベートバケットの場合）
 * @param imageUrl 画像のURL
 * @param expiresIn 有効期限（秒、デフォルト: 1時間）
 * @returns Presigned URL、失敗時はnull
 */
export async function getPresignedUrl(
  imageUrl: string,
  expiresIn: number = 3600
): Promise<string | null> {
  void expiresIn;
  const key = extractObjectKey(imageUrl);
  const presigned = await requestPresignedUrl("get", key);
  return presigned?.url ?? null;
}
