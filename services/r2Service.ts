import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// 環境変数から設定を取得
const accountId = import.meta.env.VITE_R2_ACCOUNT_ID;
const accessKeyId = import.meta.env.VITE_R2_ACCESS_KEY_ID;
const secretAccessKey = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;
const bucketName = import.meta.env.VITE_R2_BUCKET_NAME;
const endpoint = import.meta.env.VITE_R2_ENDPOINT;

// 環境変数のバリデーション
if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
  console.warn(
    "R2環境変数が設定されていません。画像アップロード機能は使用できません。"
  );
}

// S3クライアントの初期化
const s3Client = accountId && accessKeyId && secretAccessKey && bucketName && endpoint
  ? new S3Client({
      region: "auto",
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    })
  : null;

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
  if (!s3Client || !bucketName) {
    console.error("R2設定が不完全です。環境変数を確認してください。");
    return null;
  }

  try {
    console.log("📤 アバター画像アップロード開始:", file.name);

    // ファイル名を生成（users/{userId}/avatar.{拡張子}）
    const fileExtension = file.name.split(".").pop() || "jpg";
    const fileName = `users/${userId}/avatar.${fileExtension}`;

    console.log("📁 ファイル名:", fileName);

    // ファイルをArrayBufferに変換（ブラウザ環境対応）
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    console.log("📦 ファイルサイズ:", uint8Array.length, "bytes");

    // R2にアップロード
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: uint8Array,
      ContentType: file.type || "image/jpeg",
    });

    await s3Client.send(command);
    console.log("✅ R2へのアバター画像アップロード成功");

    return fileName;
  } catch (error: any) {
    console.error("❌ R2へのアバター画像アップロードエラー:", error);
    console.error("エラー詳細:", error.message);
    if (error.$metadata) {
      console.error("リクエストID:", error.$metadata.requestId);
    }
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
  if (!s3Client || !bucketName) {
    console.error("R2設定が不完全です。環境変数を確認してください。");
    return null;
  }

  try {
    console.log("📤 画像アップロード開始:", file.name);

    // ファイル名を生成（todoId + タイムスタンプ + 拡張子）
    const timestamp = Date.now();
    const fileExtension = file.name.split(".").pop() || "jpg";
    const fileName = `todos/${todoId}/${timestamp}.${fileExtension}`;

    console.log("📁 ファイル名:", fileName);

    // ファイルをArrayBufferに変換（ブラウザ環境対応）
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    console.log("📦 ファイルサイズ:", uint8Array.length, "bytes");

    // R2にアップロード
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: uint8Array,
      ContentType: file.type || "image/jpeg",
    });

    await s3Client.send(command);
    console.log("✅ R2へのアップロード成功");

    // R2キーパスを返す（表示時にPresigned URLを生成）
    // 形式: r2://bucket-name/path/to/file または単にパス
    const imageKey = fileName;
    
    return imageKey;
  } catch (error: any) {
    console.error("❌ R2への画像アップロードエラー:", error);
    console.error("エラー詳細:", error.message);
    if (error.$metadata) {
      console.error("リクエストID:", error.$metadata.requestId);
    }
    return null;
  }
}

/**
 * R2キーから画像の表示用URLを取得
 * パブリックアクセスが無効な場合はPresigned URLを生成
 * @param imageKeyOrUrl R2のキー（例: todos/123/1234567890.jpg）またはURL
 * @returns 画像の表示用URL、失敗時はnull
 */
export async function getImageUrl(imageKeyOrUrl: string): Promise<string | null> {
  if (!s3Client || !bucketName) {
    console.error("R2設定が不完全です。");
    return null;
  }

  try {
    // URLの場合はキーを抽出、そうでなければそのまま使用
    let imageKey: string;
    if (imageKeyOrUrl.startsWith("http://") || imageKeyOrUrl.startsWith("https://")) {
      try {
        const url = new URL(imageKeyOrUrl);
        imageKey = url.pathname.substring(1); // 先頭の/を削除
        // バケット名が含まれている場合は除去
        if (imageKey.startsWith(`${bucketName}/`)) {
          imageKey = imageKey.substring(bucketName.length + 1);
        }
      } catch {
        // URLのパースに失敗した場合はそのまま使用
        imageKey = imageKeyOrUrl;
      }
    } else {
      imageKey = imageKeyOrUrl;
    }

    // パブリックURLを試す
    const publicUrl = `${endpoint}/${imageKey}`;
    
    // パブリックアクセスが無効な場合に備えて、Presigned URLを生成
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: imageKey,
    });

    try {
      const presignedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600 * 24 * 7, // 7日間有効
      });
      console.log("✅ Presigned URL生成成功:", imageKey);
      return presignedUrl;
    } catch (error) {
      console.warn("⚠️ Presigned URL生成に失敗、パブリックURLを使用:", publicUrl);
      return publicUrl;
    }
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
  if (!s3Client || !bucketName) {
    console.error("R2設定が不完全です。");
    return false;
  }

  try {
    // URLの場合はキーを抽出、そうでなければそのまま使用
    let key: string;
    if (imageKey.startsWith("http://") || imageKey.startsWith("https://")) {
      const url = new URL(imageKey);
      key = url.pathname.substring(1); // 先頭の/を削除
    } else {
      key = imageKey;
    }

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await s3Client.send(command);
    console.log("✅ R2からの画像削除成功:", key);
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
  if (!s3Client || !bucketName) {
    console.error("❌ R2設定が不完全です。s3Client:", !!s3Client, "bucketName:", bucketName);
    return null;
  }

  if (!userId) {
    console.error("❌ userIdが指定されていません");
    return null;
  }

  console.log(`🔍 R2からアバター画像を検索中... userId: ${userId}`);

  try {
    // 一般的な画像拡張子を試す
    const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    
    for (const ext of extensions) {
      const avatarKey = `users/${userId}/avatar.${ext}`;
      console.log(`  📁 確認中: ${avatarKey}`);
      
      try {
        // オブジェクトの存在確認
        const headCommand = new HeadObjectCommand({
          Bucket: bucketName,
          Key: avatarKey,
        });
        
        await s3Client.send(headCommand);
        console.log(`  ✅ ファイルが見つかりました: ${avatarKey}`);
        
        // 存在する場合はPresigned URLを生成
        const getCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: avatarKey,
        });
        
        const presignedUrl = await getSignedUrl(s3Client, getCommand, {
          expiresIn: 3600 * 24 * 7, // 7日間有効
        });
        
        console.log(`✅ アバター画像をR2から取得成功: ${avatarKey}`);
        return presignedUrl;
      } catch (error: any) {
        // 404エラー（オブジェクトが存在しない）の場合は次の拡張子を試す
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
          console.log(`  ℹ️ ファイルが存在しません: ${avatarKey}`);
          continue;
        }
        // その他のエラーはログに記録
        console.warn(`⚠️ アバター画像の確認中にエラー (${avatarKey}):`, error.message, error);
      }
    }
    
    console.log(`ℹ️ アバター画像が見つかりませんでした (userId: ${userId})`);
    return null;
  } catch (error: any) {
    console.error("❌ アバター画像取得エラー:", error);
    console.error("エラー詳細:", error.message, error);
    return null;
  }
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
  if (!s3Client || !bucketName) {
    console.error("R2設定が不完全です。");
    return null;
  }

  try {
    const url = new URL(imageUrl);
    const key = url.pathname.substring(1);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn,
    });

    return presignedUrl;
  } catch (error) {
    console.error("Presigned URL生成エラー:", error);
    return null;
  }
}
