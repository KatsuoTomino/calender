import { supabase } from "./supabaseClient";

type R2JsonResponse = {
  key?: string;
  url?: string | null;
  ok?: boolean;
};

async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function requestR2Json(body: Record<string, unknown>): Promise<R2JsonResponse | null> {
  const token = await getAuthToken();
  if (!token) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error("R2 APIエラー:", response.status);
    return null;
  }

  return (await response.json()) as R2JsonResponse;
}

async function uploadViaR2Api(
  action: "upload-avatar" | "upload-todo",
  file: File,
  extraFields: Record<string, string>
): Promise<string | null> {
  const token = await getAuthToken();
  if (!token) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  const formData = new FormData();
  formData.append("action", action);
  formData.append("file", file);
  for (const [key, value] of Object.entries(extraFields)) {
    formData.append(key, value);
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    console.error("R2 APIアップロードエラー:", response.status);
    return null;
  }

  const data = (await response.json()) as R2JsonResponse;
  return data.key ?? null;
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
    console.log("📤 アバター画像アップロード開始:", file.name);
    const key = await uploadViaR2Api("upload-avatar", file, { userId });
    if (key) {
      console.log("✅ R2へのアバター画像アップロード成功");
    }
    return key;
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
    console.log("📤 画像アップロード開始:", file.name);
    const key = await uploadViaR2Api("upload-todo", file, { todoId });
    if (key) {
      console.log("✅ R2へのアップロード成功");
    }
    return key;
  } catch (error) {
    console.error("❌ R2への画像アップロードエラー:", error);
    return null;
  }
}

/**
 * R2キーから画像の表示用URLを取得
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  try {
    const data = await requestR2Json({ action: "get-url", key: imageKeyOrUrl });
    if (data?.url) {
      console.log("✅ Presigned URL生成成功");
      return data.url;
    }
    return null;
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
    const data = await requestR2Json({ action: "delete", key: imageKey });
    const success = data?.ok === true;
    if (success) {
      console.log("✅ R2からの画像削除成功:", imageKey);
    }
    return success;
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

  console.log(`🔍 R2からアバター画像を検索中... userId: ${userId}`);

  try {
    const data = await requestR2Json({ action: "get-avatar", userId });
    if (data?.url) {
      console.log("✅ アバター画像をR2から取得成功");
      return data.url;
    }
    return null;
  } catch (error) {
    console.error("❌ アバター画像取得エラー:", error);
    return null;
  }
}

/**
 * Presigned URLを生成（プライベートバケットの場合）
 * Vite公式ドキュメントではVITE_*はクライアントへ露出するため、
 * R2シークレットは /api/r2 のサーバー関数だけで扱います。
 * https://vite.dev/guide/env-and-mode
 */
export async function getPresignedUrl(
  imageUrl: string,
  expiresIn: number = 3600
): Promise<string | null> {
  void expiresIn;
  return getImageUrl(imageUrl);
}
