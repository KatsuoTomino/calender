import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getBucketName } from "../_lib/r2";
import { verifyAuth } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await verifyAuth(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { key, contentType } = req.body;
  if (!key || !contentType) {
    return res.status(400).json({ error: "key and contentType are required" });
  }

  const client = getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(client, command, { expiresIn: 600 });

    return res.json({ url, key });
  } catch (error) {
    console.error("Presign upload error:", error);
    return res.status(500).json({ error: "Failed to generate upload URL" });
  }
}
