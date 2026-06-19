import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOptimisticDateColor,
  applyOptimisticDateLabel,
} from "../utils/dateColors.ts";
import {
  buildAvatarKey,
  buildTodoImageKey,
  isAllowedR2Key,
  isOwnAvatarKey,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import { isDateStrInMonth } from "../utils/todoDates.ts";

test("clearing a date color preserves an existing label", () => {
  const result = applyOptimisticDateColor(
    [
      {
        id: "date-color-1",
        dateStr: "2026-06-19",
        color: "red",
        label: "記念日",
        createdBy: "user-1",
      },
    ],
    "2026-06-19",
    null,
    "user-1",
    () => "unused"
  );

  assert.deepEqual(result, [
    {
      id: "date-color-1",
      dateStr: "2026-06-19",
      color: null,
      label: "記念日",
      createdBy: "user-1",
    },
  ]);
});

test("clearing a date label preserves an existing color", () => {
  const result = applyOptimisticDateLabel(
    [
      {
        id: "date-color-1",
        dateStr: "2026-06-19",
        color: "blue",
        label: "旅行",
        createdBy: "user-1",
      },
    ],
    "2026-06-19",
    "",
    "user-1",
    () => "unused"
  );

  assert.deepEqual(result, [
    {
      id: "date-color-1",
      dateStr: "2026-06-19",
      color: "blue",
      label: null,
      createdBy: "user-1",
    },
  ]);
});

test("month matching uses date strings without timezone conversion", () => {
  assert.equal(isDateStrInMonth("2026-06-01", 2026, 6), true);
  assert.equal(isDateStrInMonth("2026-06-30", 2026, 6), true);
  assert.equal(isDateStrInMonth("2026-07-01", 2026, 6), false);
  assert.equal(isDateStrInMonth("monthly", 2026, 6), false);
});

test("R2 keys are normalized and restricted to app-owned prefixes", () => {
  assert.equal(
    normalizeR2Key("https://example.com/kizuna/todos/todo-1/image.jpg", "kizuna"),
    "todos/todo-1/image.jpg"
  );
  assert.equal(isAllowedR2Key("todos/todo-1/image.jpg"), true);
  assert.equal(isAllowedR2Key("users/user-1/avatar.png"), true);
  assert.equal(isAllowedR2Key("../secrets.txt"), false);
  assert.equal(isAllowedR2Key("other-bucket/file.jpg"), false);
});

test("R2 key builders reject path traversal and constrain avatar ownership", () => {
  assert.equal(buildTodoImageKey("todo_1", "photo.PNG", 123), "todos/todo_1/123.png");
  assert.equal(buildAvatarKey("user-1", "avatar.webp"), "users/user-1/avatar.webp");
  assert.equal(isOwnAvatarKey("users/user-1/avatar.webp", "user-1"), true);
  assert.equal(isOwnAvatarKey("users/user-2/avatar.webp", "user-1"), false);
  assert.throws(() => buildTodoImageKey("../todo", "photo.png", 123), /Invalid todo id/);
});
