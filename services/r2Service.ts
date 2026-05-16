import { supabase } from "./supabaseClient";

type R2ApiResponse<T> = T & {
  error?: string;
};

const getAccessToken = async (): Promise<string | null> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
};

const callR2Api = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<R2ApiResponse<T> | null> => {
  const token = await getAccessToken();
  if (!token) {
    console.error("R2 APIの呼び出しにはログインが必要です。");
    return null;
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  let body: R2ApiResponse<T> | null = null;
  try {
    body = (await response.json()) as R2ApiResponse<T>;
  } catch {
    body = null;
  }

  if (!response.ok) {
    console.error("R2 APIエラー:", body?.error || response.statusText);
    return null;
  }

  return body;
};

/**
 * ユーザーアバター画像をR2にアップロード
 * @param file アップロードする画像ファイル
 * @param userId 後方互換のため残している引数。実際の保存先はAPI側で認証ユーザーIDから決定します。
 * @returns アップロードされた画像のR2キーパス、失敗時はnull
 */
export async function uploadAvatarToR2(
  file: File,
  userId: string
): Promise<string | null> {
  try {
    console.log("📤 アバター画像アップロード開始:", file.name, "userId:", userId);

    const formData = new FormData();
    formData.append("action", "avatar");
    formData.append("file", file);

    const result = await callR2Api<{ key: string }>("/api/r2", {
      method: "POST",
      body: formData,
    });

    if (!result?.key) {
      return null;
    }

    console.log("✅ R2へのアバター画像アップロード成功");
    return result.key;
  } catch (error) {
    console.error("❌ R2へのアバター画像アップロードエラー:", error);
    return null;
  }
}

/**
 * 画像ファイルをR2にアップロード
 * @param file アップロードする画像ファイル
 * @param todoId TodoのID（ファイル名に使用）
 * @returns アップロードされた画像のR2キーパス、失敗時はnull
 */
export async function uploadImageToR2(
  file: File,
  todoId: string
): Promise<string | null> {
  try {
    console.log("📤 画像アップロード開始:", file.name);

    const formData = new FormData();
    formData.append("action", "todo-image");
    formData.append("todoId", todoId);
    formData.append("file", file);

    const result = await callR2Api<{ key: string }>("/api/r2", {
      method: "POST",
      body: formData,
    });

    if (!result?.key) {
      return null;
    }

    console.log("✅ R2へのアップロード成功");
    return result.key;
  } catch (error) {
    console.error("❌ R2への画像アップロードエラー:", error);
    return null;
  }
}

/**
 * R2キーから画像の表示用Presigned URLを取得
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  try {
    const result = await callR2Api<{ url: string; key: string }>(
      `/api/r2?key=${encodeURIComponent(imageKeyOrUrl)}`
    );

    if (!result?.url) {
      return null;
    }

    console.log("✅ Presigned URL取得成功:", result.key);
    return result.url;
  } catch (error) {
    console.error("❌ 画像URL取得エラー:", error);
    return null;
  }
}

/**
 * R2から画像を削除
 * @param imageKey 削除する画像のキー（R2キーまたはURL）
 * @returns 削除成功時true、失敗時false
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    const result = await callR2Api<{ ok: boolean }>(
      `/api/r2?key=${encodeURIComponent(imageKey)}`,
      { method: "DELETE" }
    );

    if (!result?.ok) {
      return false;
    }

    console.log("✅ R2からの画像削除成功:", imageKey);
    return true;
  } catch (error) {
    console.error("❌ R2からの画像削除エラー:", error);
    return false;
  }
}

/**
 * ユーザーのアバター画像をR2から取得
 * @param userId 後方互換のため残している引数。実際の検索先はAPI側で認証ユーザーIDから決定します。
 * @returns アバター画像の表示用URL、存在しない場合はnull
 */
export async function getAvatarFromR2(userId: string): Promise<string | null> {
  if (!userId) {
    console.error("❌ userIdが指定されていません");
    return null;
  }

  try {
    console.log(`🔍 R2からアバター画像を検索中... userId: ${userId}`);
    const result = await callR2Api<{ url: string | null; key: string | null }>(
      "/api/r2?avatar=1"
    );

    if (!result?.url) {
      console.log(`ℹ️ アバター画像が見つかりませんでした (userId: ${userId})`);
      return null;
    }

    console.log(`✅ アバター画像をR2から取得成功: ${result.key}`);
    return result.url;
  } catch (error) {
    console.error("❌ アバター画像取得エラー:", error);
    return null;
  }
}

/**
 * Presigned URLを生成（後方互換用）
 * @param imageUrl 画像のURLまたはR2キー
 * @param expiresIn API側の既定値を使用するため現在は無視します。
 * @returns Presigned URL、失敗時はnull
 */
export async function getPresignedUrl(
  imageUrl: string,
  expiresIn: number = 3600
): Promise<string | null> {
  console.log("Presigned URLを取得します:", { expiresIn });
  return getImageUrl(imageUrl);
}
