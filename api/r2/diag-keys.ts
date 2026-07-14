import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isSafeObjectKey } from "../_lib/r2Keys";

/** Isolate r2Keys module. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    ok: true,
    step: "r2Keys",
    sample: isSafeObjectKey("todos/x/y.jpg"),
  });
}
