import { createClient } from "@supabase/supabase-js";
import { GOOGLE_PENDING_ACTION_KEY } from "./googleOAuthPending";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase環境変数が設定されていません。.env.localファイルを確認してください。"
  );
}

// Google Calendar implicit OAuth also returns #access_token=.
// Capture it before createClient so detectSessionInUrl cannot treat it as a login.
if (typeof window !== "undefined") {
  const hash = window.location.hash;
  const looksLikeGoogleCalendarOAuth =
    (hash.includes("access_token=") || hash.includes("error=")) &&
    (hash.includes("state=gcal") ||
      hash.includes("googleapis.com") ||
      hash.includes("calendar") ||
      sessionStorage.getItem(GOOGLE_PENDING_ACTION_KEY));
  if (looksLikeGoogleCalendarOAuth) {
    sessionStorage.setItem(
      "kizuna_google_oauth_hash",
      hash.startsWith("#") ? hash.slice(1) : hash
    );
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search
    );
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Password login only. Google Calendar tokens must not be parsed as a session.
    detectSessionInUrl: false,
  },
});
