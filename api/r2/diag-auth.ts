import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUser } from "../_lib/auth";

/** Isolate auth module loading. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized", step: "auth" });
    }
    return res.status(200).json({ ok: true, userId: user.id, step: "auth" });
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || "auth crashed",
      step: "auth",
    });
  }
}
