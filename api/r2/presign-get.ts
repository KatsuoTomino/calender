import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GetObjectCommand } from "@aws-sdk/client-s3";
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

  const { key, keys } = req.body;

  const client = getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    if (keys && Array.isArray(keys)) {
      const urls: Record<string, string> = {};
      for (const k of keys) {
        const command = new GetObjectCommand({ Bucket: bucket, Key: k });
        urls[k] = await getSignedUrl(client, command, { expiresIn: 3600 });
      }
      return res.json({ urls });
    }

    if (!key) {
      return res.status(400).json({ error: "key or keys is required" });
    }

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(client, command, { expiresIn: 3600 });

    return res.json({ url });
  } catch (error) {
    console.error("Presign get error:", error);
    return res.status(500).json({ error: "Failed to generate download URL" });
  }
}
