import type { VercelRequest, VercelResponse } from "@vercel/node";
import { DeleteObjectCommand, getR2Client, getBucketName } from "../_lib/r2";
import { getAuthUser } from "../_lib/auth";
import { authorizeObjectKey } from "../_lib/r2Keys";
import { denyKeyAccess } from "../_lib/respond";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { key } = req.body ?? {};
  if (!key) {
    return res.status(400).json({ error: "key is required" });
  }

  const access = authorizeObjectKey(key, user.id, "write");
  if (denyKeyAccess(res, access)) return;

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
