import { S3Client } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;

export function getR2Client(): S3Client | null {
  if (_client) return _client;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  // R2 is incompatible with AWS SDK default integrity checksums (v3.729+).
  // Without WHEN_REQUIRED, presigned PUT URLs include x-amz-checksum-* and browser uploads fail.
  // Docs: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return _client;
}

export function getBucketName(): string {
  return process.env.R2_BUCKET_NAME || "";
}
