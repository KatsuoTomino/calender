import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getBucketName } from "../_lib/r2";
import { verifyAuth } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await verifyAuth(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { key, contentType, data } = req.body ?? {};
  if (!key || !contentType || !data) {
    return res
      .status(400)
      .json({ error: "key, contentType and data are required" });
  }

  if (
    typeof key !== "string" ||
    key.includes("..") ||
    key.startsWith("/") ||
    (!key.startsWith("todos/") && !key.startsWith("users/"))
  ) {
    return res.status(400).json({ error: "Invalid key" });
  }

  const client = getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    const body = Buffer.from(String(data), "base64");
    if (!body.length) {
      return res.status(400).json({ error: "Empty body" });
    }
    if (body.length > 4 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (max 4MB)" });
    }

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: String(contentType),
      })
    );

    return res.json({ key });
  } catch (error) {
    console.error("R2 upload error:", error);
    return res.status(500).json({ error: "Failed to upload" });
  }
}
