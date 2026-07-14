import type { VercelRequest } from "@vercel/node";

/**
 * Validate JWT and return the Supabase user.
 * Avoid `import type` from @supabase/supabase-js — Vercel may emit a real
 * require and crash at module load on Vite projects.
 * Docs: https://supabase.com/docs/reference/javascript/auth-getuser
 */
export async function getAuthUser(
  req: VercelRequest
): Promise<{ id: string } | null> {
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
    return { id: user.id };
  } catch (error) {
    console.error("Auth load/verify failed:", error);
    return null;
  }
}

export async function verifyAuth(req: VercelRequest): Promise<boolean> {
  return (await getAuthUser(req)) !== null;
}
