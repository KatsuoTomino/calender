import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getR2Client, getBucketName } from "../_lib/r2";
import { getAuthUser } from "../_lib/auth";

/** Authenticated diag: confirm R2 env is loaded (no secrets returned). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await getAuthUser(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const client = getR2Client();
  const bucket = getBucketName();
  return res.status(200).json({
    r2Configured: Boolean(client && bucket),
    bucketSet: Boolean(bucket),
  });
}
