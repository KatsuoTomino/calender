import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAvatarKey,
  buildTodoImageKey,
  isAllowedR2KeyForUser,
  isAvatarKeyForUser,
  isTodoImageKey,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import { getMonthDateBounds, isDateInMonthString } from "../utils/todoDates.ts";
import { applyDateColorChange, applyDateLabelChange } from "../utils/dateColors.ts";

test("R2 keys are constrained to todo images or the authenticated user's avatar", () => {
  const userId = "user-123";
  const todoKey = buildTodoImageKey("todo_123", "receipt.png", 12345);
  const avatarKey = buildAvatarKey(userId, "me.webp");

  assert.equal(todoKey, "todos/todo_123/12345.png");
  assert.equal(avatarKey, "users/user-123/avatar.webp");
  assert.equal(isTodoImageKey(todoKey), true);
  assert.equal(isAvatarKeyForUser(avatarKey, userId), true);
  assert.equal(isAllowedR2KeyForUser(todoKey, userId), true);
  assert.equal(isAllowedR2KeyForUser(avatarKey, userId), true);
  assert.equal(isAllowedR2KeyForUser("users/other-user/avatar.webp", userId), false);
});

test("R2 key normalization rejects traversal and strips URL/bucket prefixes", () => {
  assert.equal(
    normalizeR2Key("https://example.com/my-bucket/todos/todo_123/12345.png", "my-bucket"),
    "todos/todo_123/12345.png"
  );
  assert.equal(normalizeR2Key("todos/todo_123/12345.png"), "todos/todo_123/12345.png");
  assert.equal(normalizeR2Key("todos/todo_123/../secret.png"), null);
  assert.equal(normalizeR2Key("todos\\todo_123\\secret.png"), null);
});

test("month filtering uses stable YYYY-MM-DD string bounds", () => {
  assert.deepEqual(getMonthDateBounds(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
    monthPrefix: "2026-02",
  });

  assert.equal(isDateInMonthString("2026-02-01", 2026, 2), true);
  assert.equal(isDateInMonthString("2026-02-28", 2026, 2), true);
  assert.equal(isDateInMonthString("2026-03-01", 2026, 2), false);
  assert.equal(isDateInMonthString("important", 2026, 2), false);
});

test("date color optimistic clearing preserves an existing label", () => {
  const previous = [
    {
      id: "date-color-1",
      dateStr: "2026-07-04",
      color: "red" as const,
      label: "記念日",
      createdBy: "user-123",
    },
  ];

  assert.deepEqual(applyDateColorChange(previous, "2026-07-04", null, "user-123"), [
    {
      id: "date-color-1",
      dateStr: "2026-07-04",
      color: null,
      label: "記念日",
      createdBy: "user-123",
    },
  ]);
});

test("date label optimistic clearing preserves an existing color", () => {
  const previous = [
    {
      id: "date-color-1",
      dateStr: "2026-07-04",
      color: "blue" as const,
      label: "予定",
      createdBy: "user-123",
    },
  ];

  assert.deepEqual(applyDateLabelChange(previous, "2026-07-04", null, "user-123"), [
    {
      id: "date-color-1",
      dateStr: "2026-07-04",
      color: "blue",
      label: null,
      createdBy: "user-123",
    },
  ]);
});
