import test from "node:test";
import assert from "node:assert/strict";
import { applyDateColorChange, applyDateLabelChange } from "../utils/dateColors.ts";
import { buildAvatarKey, buildTodoImageKey, isAvatarKeyForUser, isTodoImageKey, normalizeR2Key } from "../utils/r2Keys.ts";
import { isDateStrInMonth } from "../utils/todoDates.ts";

test("clearing a date color preserves an existing label", () => {
  const result = applyDateColorChange(
    [{ id: "1", dateStr: "2026-07-03", color: "red", label: "予定", createdBy: "user-1" }],
    "2026-07-03",
    null,
    "user-1"
  );

  assert.deepEqual(result, [
    { id: "1", dateStr: "2026-07-03", color: null, label: "予定", createdBy: "user-1" },
  ]);
});

test("clearing a date label preserves an existing color", () => {
  const result = applyDateLabelChange(
    [{ id: "1", dateStr: "2026-07-03", color: "blue", label: "予定", createdBy: "user-1" }],
    "2026-07-03",
    "",
    "user-1"
  );

  assert.deepEqual(result, [
    { id: "1", dateStr: "2026-07-03", color: "blue", label: null, createdBy: "user-1" },
  ]);
});

test("month membership uses YYYY-MM-DD strings without timezone conversion", () => {
  assert.equal(isDateStrInMonth("2026-07-01", 2026, 7), true);
  assert.equal(isDateStrInMonth("2026-07-31", 2026, 7), true);
  assert.equal(isDateStrInMonth("2026-08-01", 2026, 7), false);
  assert.equal(isDateStrInMonth("monthly", 2026, 7), false);
});

test("R2 keys are generated and validated within allowed prefixes", () => {
  const todoKey = buildTodoImageKey("abc123", "receipt.PNG", "image/png", 12345);
  const avatarKey = buildAvatarKey("user_1", "face.webp", "image/webp");

  assert.equal(todoKey, "todos/abc123/12345.png");
  assert.equal(avatarKey, "users/user_1/avatar.webp");
  assert.equal(isTodoImageKey(todoKey!), true);
  assert.equal(isAvatarKeyForUser(avatarKey!, "user_1"), true);
  assert.equal(isAvatarKeyForUser(avatarKey!, "other"), false);
  assert.equal(normalizeR2Key("https://example.com/my-bucket/todos/abc123/12345.png", "my-bucket"), todoKey);
  assert.equal(normalizeR2Key("../secret"), null);
});
