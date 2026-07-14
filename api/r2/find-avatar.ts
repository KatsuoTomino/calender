import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getBucketName } from "../_lib/r2";
import { verifyAuth } from "../_lib/auth";

const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await verifyAuth(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const client = getR2Client();
  const bucket = getBucketName();
  if (!client || !bucket) {
    return res.status(500).json({ error: "R2 is not configured" });
  }

  try {
    for (const ext of AVATAR_EXTENSIONS) {
      const avatarKey = `users/${userId}/avatar.${ext}`;

      try {
        await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: avatarKey })
        );

        const getCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: avatarKey,
        });
        const presignedUrl = await getSignedUrl(client, getCommand, {
          expiresIn: 3600,
        });

        return res.json({ url: presignedUrl, key: avatarKey });
      } catch (error: any) {
        if (
          error.name === "NotFound" ||
          error.$metadata?.httpStatusCode === 404
        ) {
          continue;
        }
        throw error;
      }
    }

    return res.json({ url: null, key: null });
  } catch (error) {
    console.error("Find avatar error:", error);
    return res.status(500).json({ error: "Failed to find avatar" });
  }
}
