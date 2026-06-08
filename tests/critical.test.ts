import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAvatarKey,
  buildTodoImageKey,
  isAllowedR2KeyForUser,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import { getMonthDateRange, isDateStrInRange } from "../utils/todoDates.ts";

test("R2 keys are constrained to image paths owned by authenticated users", () => {
  assert.equal(buildTodoImageKey("abc_123", "receipt.PNG", 1700000000000), "todos/abc_123/1700000000000.png");
  assert.equal(buildAvatarKey("user-123", "me.webp"), "users/user-123/avatar.webp");

  assert.equal(isAllowedR2KeyForUser("todos/abc_123/1700000000000.png", "user-123"), true);
  assert.equal(isAllowedR2KeyForUser("users/user-123/avatar.jpg", "user-123"), true);

  assert.equal(isAllowedR2KeyForUser("users/other/avatar.jpg", "user-123"), false);
  assert.equal(isAllowedR2KeyForUser("todos/abc_123/../../secret.jpg", "user-123"), false);
  assert.equal(isAllowedR2KeyForUser("private/secret.jpg", "user-123"), false);
});

test("R2 URL normalization strips bucket prefixes without allowing traversal", () => {
  assert.equal(
    normalizeR2Key("https://example.r2.cloudflarestorage.com/kizuna/todos/abc/1.jpg", "kizuna"),
    "todos/abc/1.jpg"
  );
  assert.equal(normalizeR2Key("https://example.com/kizuna/todos/abc/..%2Fsecret.jpg", "kizuna"), null);
  assert.equal(normalizeR2Key(""), null);
});

test("month date ranges use string boundaries that match Supabase filters", () => {
  assert.deepEqual(getMonthDateRange(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
  });
  assert.deepEqual(getMonthDateRange(2024, 2), {
    startDateStr: "2024-02-01",
    endDateStr: "2024-02-29",
  });

  const june = getMonthDateRange(2026, 6);
  assert.equal(isDateStrInRange("2026-06-01", june.startDateStr, june.endDateStr), true);
  assert.equal(isDateStrInRange("2026-06-30", june.startDateStr, june.endDateStr), true);
  assert.equal(isDateStrInRange("2026-07-01", june.startDateStr, june.endDateStr), false);
  assert.equal(isDateStrInRange("monthly", june.startDateStr, june.endDateStr), false);
});
