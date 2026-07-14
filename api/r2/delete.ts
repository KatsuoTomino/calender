import type { VercelRequest, VercelResponse } from "@vercel/node";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getBucketName } from "../_lib/r2";
import { verifyAuth } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await verifyAuth(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ error: "key is required" });
  }

  const client = getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return res.json({ success: true });
  } catch (error) {
    console.error("R2 delete error:", error);
    return res.status(500).json({ error: "Failed to delete object" });
  }
}
