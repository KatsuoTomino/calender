import assert from "node:assert/strict";
import test from "node:test";
import { canAccessR2Key, isUserAvatarKeyForUser, normalizeR2Key } from "../utils/r2Keys.ts";
import { isTodoInMonth } from "../utils/todoDates.ts";

test("month deletion only targets calendar date todos", () => {
  const calendarTodo = { dateStr: "2026-06-01" };
  const importantTodo = { dateStr: "important" };
  const shoppingTodo = { dateStr: "shopping" };
  const monthlyTodo = { dateStr: "monthly" };

  assert.equal(isTodoInMonth(calendarTodo, 2026, 6), true);
  assert.equal(isTodoInMonth(importantTodo, 2026, 6), false);
  assert.equal(isTodoInMonth(shoppingTodo, 2026, 6), false);
  assert.equal(isTodoInMonth(monthlyTodo, 2026, 6), false);
});

test("month checks are based on date strings, not UTC Date parsing", () => {
  assert.equal(isTodoInMonth({ dateStr: "2026-06-30" }, 2026, 6), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-07-01" }, 2026, 6), false);
  assert.equal(isTodoInMonth({ dateStr: "2026-05-31" }, 2026, 6), false);
});

test("R2 keys reject traversal and only allow own avatars", () => {
  const userId = "user-123";

  assert.equal(canAccessR2Key("todos/todo-1/12345-photo.jpg", userId), true);
  assert.equal(isUserAvatarKeyForUser("users/user-123/avatar.webp", userId), true);
  assert.equal(canAccessR2Key("users/user-456/avatar.webp", userId), false);
  assert.equal(normalizeR2Key("https://example.com/bucket/users/user-123/../avatar.jpg", "bucket"), null);
});
