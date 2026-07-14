import { createRequire } from "node:module";
import { join } from "node:path";
import type { S3Client as S3ClientType } from "@aws-sdk/client-s3";

/**
 * Resolve node_modules via createRequire. Plain ESM `import` of AWS SDK can be
 * undefined at runtime on Vercel when the app is a Vite project.
 * See: https://github.com/vercel/community/discussions/893
 */
const nodeRequire = createRequire(join(process.cwd(), "package.json"));
const s3 = nodeRequire("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
const signer = nodeRequire(
  "@aws-sdk/s3-request-presigner"
) as typeof import("@aws-sdk/s3-request-presigner");

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = s3;
const { getSignedUrl } = signer;

export {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  getSignedUrl,
};

let _client: S3ClientType | null = null;

export function getR2Client(): S3ClientType | null {
  if (_client) return _client;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  try {
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
  return process.env.R2_BUCKET_NAME || "";
}
