import assert from "node:assert/strict";
import test from "node:test";
import {
  getSafeImageExtension,
  isAllowedAvatarKey,
  isAllowedR2KeyForUser,
  isAllowedTodoImageKey,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import { getMonthDateBounds, isTodoDateInMonth } from "../utils/todoDates.ts";

test("R2 key validation confines operations to application image prefixes", () => {
  assert.equal(isAllowedTodoImageKey("todos/todo-1/123.jpg"), true);
  assert.equal(isAllowedTodoImageKey("todos/todo-1/123.webp"), true);
  assert.equal(isAllowedTodoImageKey("todos/todo-1/123.txt"), false);
  assert.equal(isAllowedTodoImageKey("backups/prod.sql"), false);

  assert.equal(isAllowedAvatarKey("users/user-1/avatar.png", "user-1"), true);
  assert.equal(isAllowedAvatarKey("users/user-2/avatar.png", "user-1"), false);
  assert.equal(isAllowedR2KeyForUser("users/user-2/avatar.png", "user-1"), false);
});

test("R2 key normalization strips URLs and bucket prefixes without widening access", () => {
  assert.equal(
    normalizeR2Key("https://example.com/my-bucket/todos/todo-1/123.jpg", "my-bucket"),
    "todos/todo-1/123.jpg"
  );
  assert.equal(normalizeR2Key("/todos/todo-1/123.jpg"), "todos/todo-1/123.jpg");
  assert.equal(getSafeImageExtension("photo.PNG"), "png");
  assert.equal(getSafeImageExtension("payload.exe"), "jpg");
});

test("month deletion uses date strings and excludes adjacent or special todos", () => {
  assert.deepEqual(getMonthDateBounds(2026, 2), {
    start: "2026-02-01",
    end: "2026-02-28",
  });
  assert.deepEqual(getMonthDateBounds(2024, 2), {
    start: "2024-02-01",
    end: "2024-02-29",
  });

  assert.equal(isTodoDateInMonth("2026-06-01", 2026, 6), true);
  assert.equal(isTodoDateInMonth("2026-06-30", 2026, 6), true);
  assert.equal(isTodoDateInMonth("2026-05-31", 2026, 6), false);
  assert.equal(isTodoDateInMonth("2026-07-01", 2026, 6), false);
  assert.equal(isTodoDateInMonth("monthly", 2026, 6), false);
  assert.equal(isTodoDateInMonth("important", 2026, 6), false);
});
