/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Google Cloud OAuth 2.0 Web Client ID (Calendar export) */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Optional Google account to prefer for Calendar OAuth (login_hint) */
  readonly VITE_GOOGLE_LOGIN_HINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

