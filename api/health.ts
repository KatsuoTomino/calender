import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser } from "./_lib/auth";

/** Authenticated liveness check (avoids unauthenticated probing). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await getAuthUser(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return res.status(200).json({ ok: true });
}
