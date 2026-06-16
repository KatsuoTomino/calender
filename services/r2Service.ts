import { supabase } from "./supabaseClient";

type R2Response = {
  key?: string;
  url?: string | null;
  ok?: boolean;
};

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function requestR2Json(payload: Record<string, unknown>): Promise<R2Response | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error("R2 APIエラー:", await response.text());
    return null;
  }

  return response.json();
}

async function requestR2Form(formData: FormData): Promise<R2Response | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error("R2操作にはログインが必要です。");
    return null;
  }

  // Vite docs: VITE_* values are bundled into client code, so R2 secrets stay behind /api/r2.
  const response = await fetch("/api/r2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    console.error("R2 APIエラー:", await response.text());
    return null;
  }

  return response.json();
}

/**
 * ユーザーアバター画像をR2にアップロード
 */
export async function uploadAvatarToR2(file: File, userId: string): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.set("action", "uploadAvatar");
    formData.set("file", file);
    formData.set("userId", userId);

    const result = await requestR2Form(formData);
    return result?.key ?? null;
  } catch (error) {
    console.error("❌ R2へのアバター画像アップロードエラー:", error);
    return null;
  }
}

/**
 * 画像ファイルをR2にアップロード
 */
export async function uploadImageToR2(file: File, todoId: string): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.set("action", "uploadImage");
    formData.set("file", file);
    formData.set("todoId", todoId);

    const result = await requestR2Form(formData);
    return result?.key ?? null;
  } catch (error) {
    console.error("❌ R2への画像アップロードエラー:", error);
    return null;
  }
}

/**
 * R2キーから画像の表示用URLを取得
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  try {
    const result = await requestR2Json({
      action: "getImageUrl",
      imageKey: imageKeyOrUrl,
    });

    return result?.url ?? null;
  } catch (error) {
    console.error("❌ 画像URL取得エラー:", error);
    return null;
  }
}

/**
 * R2から画像を削除
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  try {
    const result = await requestR2Json({
      action: "deleteImage",
      imageKey,
    });

    return result?.ok === true;
  } catch (error) {
    console.error("❌ R2からの画像削除エラー:", error);
    return false;
  }
}

/**
 * ユーザーのアバター画像をR2から取得
 */
export async function getAvatarFromR2(userId: string): Promise<string | null> {
  try {
    const result = await requestR2Json({
      action: "getAvatar",
      userId,
    });

    return result?.url ?? null;
  } catch (error) {
    console.error("❌ アバター画像取得エラー:", error);
    return null;
  }
}

/**
 * Presigned URLを生成（後方互換用）
 */
export async function getPresignedUrl(imageUrl: string, expiresIn: number = 3600): Promise<string | null> {
  try {
    const result = await requestR2Json({
      action: "getImageUrl",
      imageKey: imageUrl,
      expiresIn,
    });

    return result?.url ?? null;
  } catch (error) {
    console.error("Presigned URL生成エラー:", error);
    return null;
  }
}
