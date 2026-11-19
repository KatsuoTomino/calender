/**
 * Pending Google Calendar action kept in sessionStorage across a full-page
 * OAuth redirect. The same key is read in supabaseClient before createClient.
 *
 * Once an access token is issued without leaving the page, the stash must be
 * dropped. Otherwise a later popup failure (401 re-auth after await fetch, or
 * the user closing the popup) full-page redirects and
 * resumePendingGoogleExport replays the stale snapshot. Those todos still
 * have googleChecked: false, so Calendar inserts them again and the new event
 * id overwrites the stored one.
 */
export const GOOGLE_PENDING_ACTION_KEY = "kizuna_google_pending_action";

export function discardInPageGooglePendingAction(
  storage: Pick<Storage, "removeItem">
): void {
  storage.removeItem(GOOGLE_PENDING_ACTION_KEY);
}

/**
 * GIS error_callback: popup_closed means the popup closed before a token
 * response. If a token was already issued, ignore the error.
 * Docs: https://developers.google.com/identity/oauth2/web/guides/error
 */
export function popupFailureShouldLeavePage(
  errorType: string | undefined,
  tokenAlreadyIssued: boolean
): boolean {
  if (tokenAlreadyIssued) return false;
  return (
    errorType === "popup_failed_to_open" || errorType === "popup_closed"
  );
}
