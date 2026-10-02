/**
 * Google Calendar implicit-flow hash handling.
 * Docs: https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
 *
 * The redirect must echo a one-time `state` stored before navigation.
 * A fixed value such as "gcal", or the mere presence of googleapis.com in
 * the scope, is not proof the token was issued for this tab.
 */

export const GOOGLE_OAUTH_STATE_KEY = "kizuna_google_oauth_state";
export const GOOGLE_OAUTH_HASH_KEY = "kizuna_google_oauth_hash";

function hashBody(hash: string): string {
  return hash.startsWith("#") ? hash.slice(1) : hash;
}

export function isTrustedGoogleOAuthHash(
  hash: string,
  expectedState: string | null
): boolean {
  if (!expectedState) return false;
  const raw = hashBody(hash);
  if (!raw.includes("access_token=") && !raw.includes("error=")) return false;
  const state = new URLSearchParams(raw).get("state");
  return state === expectedState;
}

/**
 * Prefer a trusted live URL hash, then a hash already captured into
 * sessionStorage. Anything else is untrusted and must not be stored as a token.
 */
export function selectTrustedOAuthHash(
  fromUrl: string,
  stored: string,
  expectedState: string | null
): string | null {
  if (isTrustedGoogleOAuthHash(fromUrl, expectedState)) {
    return hashBody(fromUrl);
  }
  if (isTrustedGoogleOAuthHash(stored, expectedState)) {
    return hashBody(stored);
  }
  return null;
}
