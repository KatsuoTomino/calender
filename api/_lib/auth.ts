import { createRequire } from "node:module";
import { join } from "node:path";
import type { VercelRequest } from "@vercel/node";
import type { User } from "@supabase/supabase-js";

const nodeRequire = createRequire(join(process.cwd(), "package.json"));
const { createClient } = nodeRequire(
  "@supabase/supabase-js"
) as typeof import("@supabase/supabase-js");

/**
 * Validate JWT and return the Supabase user.
 * Docs: https://supabase.com/docs/reference/javascript/auth-getuser
 */
export async function getAuthUser(req: VercelRequest): Promise<User | null> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user;
}

export async function verifyAuth(req: VercelRequest): Promise<boolean> {
  return (await getAuthUser(req)) !== null;
}
