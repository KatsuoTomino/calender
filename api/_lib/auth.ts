import type { VercelRequest } from "@vercel/node";
import type { User } from "@supabase/supabase-js";

/**
 * Validate JWT and return the Supabase user.
 * Dynamic import avoids Vite+Vercel static-import issues.
 * Docs: https://supabase.com/docs/reference/javascript/auth-getuser
 */
export async function getAuthUser(req: VercelRequest): Promise<User | null> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) return null;
    return user;
  } catch (error) {
    console.error("Auth load/verify failed:", error);
    return null;
  }
}

export async function verifyAuth(req: VercelRequest): Promise<boolean> {
  return (await getAuthUser(req)) !== null;
}
