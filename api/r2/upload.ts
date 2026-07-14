import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createPutObjectCommand,
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

  const { key, contentType, data } = req.body ?? {};
  if (!key || !contentType || !data) {
    return res
      .status(400)
      .json({ error: "key, contentType and data are required" });
  }
  if (!isAllowedImageContentType(contentType)) {
    return res.status(400).json({ error: "Unsupported contentType" });
  }

  const access = authorizeObjectKey(key, user.id, "write");
  if (denyKeyAccess(res, access)) return;

  const client = await getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    const body = Buffer.from(String(data), "base64");
    if (!body.length) {
      return res.status(400).json({ error: "Empty body" });
    }
    // Vercel request body limit ~4.5MB; base64 expands ~33%
    if (body.length > 3 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (max 3MB)" });
    }

    const command = await createPutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: String(contentType).toLowerCase(),
    });
    await client.send(command);

    return res.json({ key });
  } catch (error) {
    console.error("R2 upload error:", error);
    return res.status(500).json({ error: "Failed to upload" });
  }
}
