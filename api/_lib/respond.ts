import type { VercelResponse } from "@vercel/node";
import {
  authorizeObjectKey,
  type KeyAccessResult,
} from "./r2Keys";

export type { KeyAccessResult };

export function denyKeyAccess(
  res: VercelResponse,
  access: KeyAccessResult
): boolean {
  if (access.ok === true) return false;
  res.status(access.status).json({ error: access.error });
  return true;
}

export { authorizeObjectKey };
