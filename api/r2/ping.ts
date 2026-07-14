import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Minimal ping for /api/r2 without any SDK imports.
 * Used to verify routing independently of AWS.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ ok: true, route: "r2/ping" });
}
