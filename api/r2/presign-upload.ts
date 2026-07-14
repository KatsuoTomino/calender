import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  PutObjectCommand,
  getSignedUrl,
  getR2Client,
  getBucketName,
} from "../_lib/r2";
import { getAuthUser } from "../_lib/auth";
import {
  authorizeObjectKey,
  isAllowedImageContentType,
} from "../_lib/r2Keys";
import { denyKeyAccess } from "../_lib/respond";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { key, contentType } = req.body ?? {};
  if (!key || !contentType) {
    return res.status(400).json({ error: "key and contentType are required" });
  }
  if (!isAllowedImageContentType(contentType)) {
    return res.status(400).json({ error: "Unsupported contentType" });
  }

  const access = authorizeObjectKey(key, user.id, "write");
  if (denyKeyAccess(res, access)) return;

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
