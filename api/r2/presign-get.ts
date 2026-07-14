import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  GetObjectCommand,
  getSignedUrl,
  getR2Client,
  getBucketName,
} from "../_lib/r2";
import { getAuthUser } from "../_lib/auth";
import { authorizeObjectKey, MAX_PRESIGN_KEYS } from "../_lib/r2Keys";
import { denyKeyAccess } from "../_lib/respond";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { key, keys } = req.body ?? {};

  const client = getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    if (keys && Array.isArray(keys)) {
      if (keys.length === 0 || keys.length > MAX_PRESIGN_KEYS) {
        return res.status(400).json({
          error: `keys must contain 1-${MAX_PRESIGN_KEYS} items`,
        });
      }

      const urls: Record<string, string> = {};
      for (const k of keys) {
        const access = authorizeObjectKey(k, user.id, "read");
        if (denyKeyAccess(res, access)) return;
        const command = new GetObjectCommand({ Bucket: bucket, Key: k });
        urls[k] = await getSignedUrl(client, command, { expiresIn: 3600 });
      }
      return res.json({ urls });
    }

    if (!key) {
      return res.status(400).json({ error: "key or keys is required" });
    }

    const access = authorizeObjectKey(key, user.id, "read");
    if (denyKeyAccess(res, access)) return;

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(client, command, { expiresIn: 3600 });

    return res.json({ url });
  } catch (error) {
    console.error("Presign get error:", error);
    return res.status(500).json({ error: "Failed to generate download URL" });
  }
}
