import test from "node:test";
import assert from "node:assert/strict";
import { normalizeR2Key, isUserAvatarKeyForUser } from "../utils/r2Keys.ts";
import { getMonthDateRange, getTodoIdsForMonth, isTodoInMonth } from "../utils/todoDates.ts";
import type { TodoItem } from "../types.ts";

const todo = (id: string, dateStr: string): TodoItem => ({
  id,
  dateStr,
  text: id,
  completed: false,
  createdBy: "user-1",
});

test("normalizeR2Key accepts only app-owned R2 key prefixes", () => {
  assert.equal(normalizeR2Key("todos/todo-1/image.png"), "todos/todo-1/image.png");
  assert.equal(normalizeR2Key("/users/user-1/avatar.jpg"), "users/user-1/avatar.jpg");
  assert.equal(normalizeR2Key("https://example.com/todos/todo-1/image.png"), "todos/todo-1/image.png");
  assert.equal(normalizeR2Key("secrets/key.txt"), null);
  assert.equal(normalizeR2Key("todos/../users/user-2/avatar.jpg"), null);
});

test("avatar R2 keys are restricted to the authenticated user's prefix", () => {
  assert.equal(isUserAvatarKeyForUser("users/user-1/avatar.jpg", "user-1"), true);
  assert.equal(isUserAvatarKeyForUser("users/user-2/avatar.jpg", "user-1"), false);
});

test("month helpers use persisted date strings instead of Date timezone parsing", () => {
  assert.deepEqual(getMonthDateRange(2026, 2), {
    start: "2026-02-01",
    end: "2026-02-28",
  });

  const todos = [
    todo("jan", "2026-01-31"),
    todo("feb-start", "2026-02-01"),
    todo("feb-end", "2026-02-28"),
    todo("mar", "2026-03-01"),
    todo("important", "important"),
    todo("monthly", "monthly"),
  ];

  assert.deepEqual(getTodoIdsForMonth(todos, 2026, 2), ["feb-start", "feb-end"]);
  assert.equal(isTodoInMonth(todo("not-date", "monthly"), 2026, 2), false);
});
