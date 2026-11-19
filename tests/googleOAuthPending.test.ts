import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_PENDING_ACTION_KEY,
  discardInPageGooglePendingAction,
  popupFailureShouldLeavePage,
} from "../services/googleOAuthPending.ts";

test("in-page token success drops the stashed export so it cannot replay", () => {
  const store = new Map<string, string>();
  const storage = {
    removeItem(key: string) {
      store.delete(key);
    },
  };
  store.set(
    GOOGLE_PENDING_ACTION_KEY,
    JSON.stringify({
      type: "export",
      todos: [{ id: "todo-1", text: "朝会", googleChecked: false }],
    })
  );

  discardInPageGooglePendingAction(storage);

  assert.equal(store.has(GOOGLE_PENDING_ACTION_KEY), false);
});

test("popup close after a token was issued does not redirect", () => {
  assert.equal(popupFailureShouldLeavePage("popup_closed", true), false);
  assert.equal(
    popupFailureShouldLeavePage("popup_failed_to_open", true),
    false
  );
});

test("popup close before a token still falls back to redirect", () => {
  assert.equal(popupFailureShouldLeavePage("popup_closed", false), true);
  assert.equal(
    popupFailureShouldLeavePage("popup_failed_to_open", false),
    true
  );
  assert.equal(popupFailureShouldLeavePage("unknown", false), false);
});
