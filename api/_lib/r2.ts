import type {
  S3Client as S3ClientType,
  PutObjectCommandInput,
  GetObjectCommandInput,
  DeleteObjectCommandInput,
  HeadObjectCommandInput,
} from "@aws-sdk/client-s3";

type AwsBundle = {
  S3Client: typeof import("@aws-sdk/client-s3").S3Client;
  PutObjectCommand: typeof import("@aws-sdk/client-s3").PutObjectCommand;
  GetObjectCommand: typeof import("@aws-sdk/client-s3").GetObjectCommand;
  DeleteObjectCommand: typeof import("@aws-sdk/client-s3").DeleteObjectCommand;
  HeadObjectCommand: typeof import("@aws-sdk/client-s3").HeadObjectCommand;
  getSignedUrl: typeof import("@aws-sdk/s3-request-presigner").getSignedUrl;
};

let awsBundle: AwsBundle | null = null;
let _client: S3ClientType | null = null;

/**
 * Dynamic import avoids Vite+Vercel ESM static-import issues where SDK
 * bindings can be undefined at runtime.
 */
export async function loadAws(): Promise<AwsBundle> {
  if (awsBundle) return awsBundle;
  const s3 = await import("@aws-sdk/client-s3");
  const signer = await import("@aws-sdk/s3-request-presigner");
  awsBundle = {
    S3Client: s3.S3Client,
    PutObjectCommand: s3.PutObjectCommand,
    GetObjectCommand: s3.GetObjectCommand,
    DeleteObjectCommand: s3.DeleteObjectCommand,
    HeadObjectCommand: s3.HeadObjectCommand,
    getSignedUrl: signer.getSignedUrl,
  };
  return awsBundle;
}

export async function getR2Client(): Promise<S3ClientType | null> {
  if (_client) return _client;

  const endpoint = process.env.R2_ENDPOINT?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  try {
    const { S3Client } = await loadAws();
    // R2 is incompatible with AWS SDK default integrity checksums (v3.729+).
    // Docs: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
    _client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  } catch (error) {
    console.error("Failed to init R2 client:", error);
    return null;
  }

  return _client;
}

export function getBucketName(): string {
  return process.env.R2_BUCKET_NAME?.trim() || "";
}

export async function createPutObjectCommand(input: PutObjectCommandInput) {
  const { PutObjectCommand } = await loadAws();
  return new PutObjectCommand(input);
}

export async function createGetObjectCommand(input: GetObjectCommandInput) {
  const { GetObjectCommand } = await loadAws();
  return new GetObjectCommand(input);
}

export async function createDeleteObjectCommand(
  input: DeleteObjectCommandInput
) {
  const { DeleteObjectCommand } = await loadAws();
  return new DeleteObjectCommand(input);
}

export async function createHeadObjectCommand(input: HeadObjectCommandInput) {
  const { HeadObjectCommand } = await loadAws();
  return new HeadObjectCommand(input);
}

export async function signUrl(
  client: S3ClientType,
  command: unknown,
  options: { expiresIn: number }
) {
  const { getSignedUrl } = await loadAws();
  return getSignedUrl(client as any, command as any, options);
}
