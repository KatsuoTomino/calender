import assert from "node:assert/strict";
import test from "node:test";
import {
  isTrustedGoogleOAuthHash,
  selectTrustedOAuthHash,
} from "../utils/googleOAuthHash.ts";

const STATE = "11111111-1111-4111-8111-111111111111";

test("accepts a hash that echoes the pending state", () => {
  const hash = `#access_token=legit&expires_in=3600&state=${STATE}&scope=https://www.googleapis.com/auth/calendar.events`;
  assert.equal(isTrustedGoogleOAuthHash(hash, STATE), true);
  assert.equal(selectTrustedOAuthHash(hash.slice(1), "", STATE)?.includes("access_token=legit"), true);
});

test("rejects an access token that was not started by this tab", () => {
  const attacker = "access_token=attacker-token&expires_in=3600&token_type=Bearer";
  assert.equal(isTrustedGoogleOAuthHash(attacker, null), false);
  assert.equal(isTrustedGoogleOAuthHash(attacker, STATE), false);
  assert.equal(selectTrustedOAuthHash(attacker, "", STATE), null);
  assert.equal(selectTrustedOAuthHash(attacker, "", null), null);
});

test("rejects a forged hash that only mentions googleapis.com or state=gcal", () => {
  const forged =
    "access_token=attacker-token&scope=https://www.googleapis.com/auth/calendar.events&state=gcal";
  assert.equal(isTrustedGoogleOAuthHash(forged, STATE), false);
  assert.equal(isTrustedGoogleOAuthHash(forged, null), false);
  assert.equal(selectTrustedOAuthHash(forged, "", STATE), null);
});

test("does not let an untrusted URL hash override a trusted stored hash", () => {
  const stored = `access_token=legit&state=${STATE}`;
  const attacker = "access_token=attacker-token&expires_in=3600";
  const selected = selectTrustedOAuthHash(attacker, stored, STATE);
  assert.equal(selected, stored);
});

test("rejects a stored hash when the pending state is missing", () => {
  const stored = `access_token=legit&state=${STATE}`;
  assert.equal(selectTrustedOAuthHash("", stored, null), null);
});
