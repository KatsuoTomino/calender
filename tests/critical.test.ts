import assert from "node:assert/strict";
import test from "node:test";
import { applyDateColorUpdate, applyDateLabelUpdate } from "../utils/dateColors.ts";
import {
  createAvatarKey,
  createTodoImageKey,
  isAllowedR2Key,
  isUserAvatarKey,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import { getMonthDateBounds, isTodoInMonth } from "../utils/todoDates.ts";
import { DateColor } from "../types.ts";

test("clearing a date color preserves an existing label", () => {
  const previous: DateColor[] = [
    {
      id: "date-color-1",
      dateStr: "2026-06-14",
      color: "red",
      label: "旅行",
      createdBy: "user-1",
    },
  ];

  assert.deepEqual(applyDateColorUpdate(previous, "2026-06-14", null, "user-1", () => "new-id"), [
    {
      id: "date-color-1",
      dateStr: "2026-06-14",
      color: null,
      label: "旅行",
      createdBy: "user-1",
    },
  ]);
});

test("clearing a date label preserves an existing color", () => {
  const previous: DateColor[] = [
    {
      id: "date-color-1",
      dateStr: "2026-06-14",
      color: "blue",
      label: "旅行",
      createdBy: "user-1",
    },
  ];

  assert.deepEqual(applyDateLabelUpdate(previous, "2026-06-14", null, "user-1", () => "new-id"), [
    {
      id: "date-color-1",
      dateStr: "2026-06-14",
      color: "blue",
      label: null,
      createdBy: "user-1",
    },
  ]);
});

test("month bounds and membership use YYYY-MM-DD strings without timezone conversion", () => {
  assert.deepEqual(getMonthDateBounds(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
  });

  assert.equal(isTodoInMonth({ dateStr: "2026-02-01" }, 2026, 2), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-02-28" }, 2026, 2), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-03-01" }, 2026, 2), false);
  assert.equal(isTodoInMonth({ dateStr: "monthly" }, 2026, 2), false);
});

test("R2 keys are normalized and constrained to app-owned image paths", () => {
  assert.equal(normalizeR2Key("https://example.com/my-bucket/todos/todo-1/123.jpg", "my-bucket"), "todos/todo-1/123.jpg");
  assert.equal(isAllowedR2Key("todos/todo-1/123.jpg"), true);
  assert.equal(isAllowedR2Key("users/user-1/avatar.webp"), true);
  assert.equal(isUserAvatarKey("users/user-1/avatar.webp", "user-1"), true);

  assert.equal(normalizeR2Key("todos/todo-1/../secret.jpg"), null);
  assert.equal(isAllowedR2Key("private/secret.txt"), false);
  assert.equal(isUserAvatarKey("users/user-2/avatar.webp", "user-1"), false);
});

test("R2 key builders reject unsafe identifiers and unsupported extensions", () => {
  assert.match(createTodoImageKey("todo_1", "receipt.png", "12345") || "", /^todos\/todo_1\/12345\.png$/);
  assert.equal(createTodoImageKey("../todo", "receipt.png", "12345"), null);
  assert.equal(createAvatarKey("user-1", "avatar.exe"), "users/user-1/avatar.jpg");
});
