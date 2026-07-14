import type { VercelRequest, VercelResponse } from "@vercel/node";

/** Unauthenticated liveness probe (no third-party imports). */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ ok: true });
}
