type AwsBundle = {
  S3Client: new (config: Record<string, unknown>) => {
    send: (command: unknown) => Promise<unknown>;
  };
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
  HeadObjectCommand: new (input: Record<string, unknown>) => unknown;
  getSignedUrl: (
    client: unknown,
    command: unknown,
    options: { expiresIn: number }
  ) => Promise<string>;
};

let awsBundle: AwsBundle | null = null;
let _client: InstanceType<AwsBundle["S3Client"]> | null = null;

/**
 * Dynamic import avoids Vite+Vercel ESM static-import issues.
 * Do not use `import type` from @aws-sdk here — Vercel can emit a real require
 * and crash the function at module load.
 */
export async function loadAws(): Promise<AwsBundle> {
  if (awsBundle) return awsBundle;
  const s3 = await import("@aws-sdk/client-s3");
  const signer = await import("@aws-sdk/s3-request-presigner");
  awsBundle = {
    S3Client: s3.S3Client as unknown as AwsBundle["S3Client"],
    PutObjectCommand: s3.PutObjectCommand as unknown as AwsBundle["PutObjectCommand"],
    GetObjectCommand: s3.GetObjectCommand as unknown as AwsBundle["GetObjectCommand"],
    DeleteObjectCommand:
      s3.DeleteObjectCommand as unknown as AwsBundle["DeleteObjectCommand"],
    HeadObjectCommand: s3.HeadObjectCommand as unknown as AwsBundle["HeadObjectCommand"],
    getSignedUrl: signer.getSignedUrl as unknown as AwsBundle["getSignedUrl"],
  };
  return awsBundle;
}

export async function getR2Client(): Promise<InstanceType<
  AwsBundle["S3Client"]
> | null> {
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

export async function createPutObjectCommand(input: Record<string, unknown>) {
  const { PutObjectCommand } = await loadAws();
  return new PutObjectCommand(input);
}

export async function createGetObjectCommand(input: Record<string, unknown>) {
  const { GetObjectCommand } = await loadAws();
  return new GetObjectCommand(input);
}

export async function createDeleteObjectCommand(
  input: Record<string, unknown>
) {
  const { DeleteObjectCommand } = await loadAws();
  return new DeleteObjectCommand(input);
}

export async function createHeadObjectCommand(input: Record<string, unknown>) {
  const { HeadObjectCommand } = await loadAws();
  return new HeadObjectCommand(input);
}

export async function signUrl(
  client: unknown,
  command: unknown,
  options: { expiresIn: number }
) {
  const { getSignedUrl } = await loadAws();
  return getSignedUrl(client, command, options);
}
