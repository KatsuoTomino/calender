import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getR2Client, getBucketName } from "../_lib/r2";

/** Dev/diag: confirm R2 env is loaded (no secrets returned). */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const client = getR2Client();
  const bucket = getBucketName();
  return res.status(200).json({
    r2Configured: Boolean(client && bucket),
    bucketSet: Boolean(bucket),
  });
}
