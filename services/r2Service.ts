const publicBaseUrl =
  import.meta.env.VITE_R2_PUBLIC_BASE_URL || import.meta.env.VITE_R2_ENDPOINT;

const normalizedPublicBaseUrl = publicBaseUrl?.replace(/\/+$/, "");

// Vite の VITE_* はクライアントバンドルへ埋め込まれるため、R2 の Access Key/Secret は
// ブラウザで扱わない。署名付き URL やアップロードはサーバー/Edge Function 側で実装する。
// Docs: https://vite.dev/guide/env-and-mode.html#env-variables
const warnServerSideR2Required = (operation: string) => {
  console.error(
    `${operation}はブラウザから実行できません。R2の認証情報を保護するため、サーバー側APIで処理してください。`
  );
};

const buildPublicObjectUrl = (imageKeyOrUrl: string): string | null => {
  if (imageKeyOrUrl.startsWith("http://") || imageKeyOrUrl.startsWith("https://")) {
    return imageKeyOrUrl;
  }

  if (!normalizedPublicBaseUrl) {
    console.error("R2の公開ベースURLが設定されていません。");
    return null;
  }

  const encodedKey = imageKeyOrUrl
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${normalizedPublicBaseUrl}/${encodedKey}`;
};

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
  void file;
  void userId;
  warnServerSideR2Required("アバター画像アップロード");
  return null;
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
  void file;
  void todoId;
  warnServerSideR2Required("画像アップロード");
  return null;
}

/**
 * R2キーから画像の表示用URLを取得
 * クライアント側では公開URLのみ生成し、署名付きURLはサーバー側で生成する。
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  return buildPublicObjectUrl(imageKeyOrUrl);
}

/**
 * R2から画像を削除
 * @param imageKey 削除する画像のキー（R2キーまたはURL）
 * @returns 削除成功時true、失敗時false
 */
export async function deleteImageFromR2(imageKey: string): Promise<boolean> {
  void imageKey;
  warnServerSideR2Required("画像削除");
  return false;
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

  console.warn(
    "ブラウザからR2を一覧/HEAD確認できないため、保存済みのアバターキーから表示URLを取得してください。"
  );
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
  void imageUrl;
  void expiresIn;
  warnServerSideR2Required("Presigned URL生成");
  return null;
}
