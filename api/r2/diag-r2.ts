import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBucketName } from "../_lib/r2";

/** Isolate r2 module load without calling AWS. */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    return res.status(200).json({
      ok: true,
      step: "r2-module",
      bucketSet: Boolean(getBucketName()),
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || "r2 module crashed",
      step: "r2-module",
    });
  }
}
