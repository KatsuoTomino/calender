import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAvatarKey,
  buildTodoImageKey,
  getSafeFileExtension,
  getTodoIdFromR2Key,
  isAllowedR2Key,
  isOwnAvatarKey,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import {
  getMonthDateBounds,
  getTodosForMonth,
  isDateStrInMonth,
} from "../utils/todoDates.ts";

test("R2 keys are normalized without accepting traversal paths", () => {
  assert.equal(
    normalizeR2Key("https://example.com/my-bucket/todos/todo-1/image.jpg", "my-bucket"),
    "todos/todo-1/image.jpg"
  );
  assert.equal(normalizeR2Key("todos/todo-1/../secret.jpg"), null);
  assert.equal(normalizeR2Key("todos/todo-1/image.jpg"), "todos/todo-1/image.jpg");
});

test("R2 key allowlist limits operations to app-owned image paths", () => {
  assert.equal(isAllowedR2Key("todos/todo-1/image.jpg"), true);
  assert.equal(isAllowedR2Key("users/user-1/avatar.webp"), true);
  assert.equal(isAllowedR2Key("backups/database.sql"), false);
  assert.equal(isAllowedR2Key("users/user-1/private/avatar.webp"), false);
});

test("avatar ownership checks do not match neighboring user ids", () => {
  assert.equal(isOwnAvatarKey("users/user-1/avatar.jpg", "user-1"), true);
  assert.equal(isOwnAvatarKey("users/user-10/avatar.jpg", "user-1"), false);
});

test("R2 upload key builders reject unsafe path segments", () => {
  assert.equal(buildAvatarKey("user-1", "png"), "users/user-1/avatar.png");
  assert.equal(
    buildTodoImageKey("todo-1", "jpeg", "unique"),
    "todos/todo-1/unique.jpeg"
  );
  assert.throws(() => buildTodoImageKey("../todo-1", "jpg", "unique"));
  assert.equal(getTodoIdFromR2Key("todos/todo-1/unique.jpeg"), "todo-1");
});

test("file extensions are restricted to supported image extensions", () => {
  assert.equal(getSafeFileExtension("photo.PNG", "image/png"), "png");
  assert.equal(getSafeFileExtension("photo.svg", "image/png"), "png");
  assert.equal(getSafeFileExtension("photo", "image/webp"), "webp");
  assert.equal(getSafeFileExtension("photo", "application/octet-stream"), "jpg");
});

test("month filtering uses YYYY-MM-DD strings and ignores special lists", () => {
  assert.deepEqual(getMonthDateBounds(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
  });
  assert.equal(isDateStrInMonth("2026-02-01", 2026, 2), true);
  assert.equal(isDateStrInMonth("2026-02-28", 2026, 2), true);
  assert.equal(isDateStrInMonth("2026-03-01", 2026, 2), false);
  assert.equal(isDateStrInMonth("monthly", 2026, 2), false);

  const todos = [
    { id: "1", dateStr: "2026-02-01", text: "a", completed: false, createdBy: "u" },
    { id: "2", dateStr: "2026-02-28", text: "b", completed: false, createdBy: "u" },
    { id: "3", dateStr: "2026-03-01", text: "c", completed: false, createdBy: "u" },
    { id: "4", dateStr: "monthly", text: "d", completed: false, createdBy: "u" },
  ];

  assert.deepEqual(
    getTodosForMonth(todos, 2026, 2).map((todo) => todo.id),
    ["1", "2"]
  );
});
