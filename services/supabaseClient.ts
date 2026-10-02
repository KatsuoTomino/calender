import { createClient } from "@supabase/supabase-js";
import {
  GOOGLE_OAUTH_HASH_KEY,
  GOOGLE_OAUTH_STATE_KEY,
  isTrustedGoogleOAuthHash,
} from "../utils/googleOAuthHash";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase環境変数が設定されていません。.env.localファイルを確認してください。"
  );
}

// Google Calendar implicit OAuth also returns #access_token=.
// Capture it before createClient so it cannot be confused with a Supabase session.
// Only a hash that echoes this tab's one-time state is kept.
// https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
if (typeof window !== "undefined") {
  try {
    const hash = window.location.hash;
    const expectedState = sessionStorage.getItem(GOOGLE_OAUTH_STATE_KEY);
    if (isTrustedGoogleOAuthHash(hash, expectedState)) {
      sessionStorage.setItem(
        GOOGLE_OAUTH_HASH_KEY,
        hash.startsWith("#") ? hash.slice(1) : hash
      );
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  } catch {
    /* sessionStorage unavailable; leave the hash for a later check */
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
