import assert from "node:assert/strict";
import test from "node:test";
import { applyDateColorChange, applyDateLabelChange } from "../utils/dateColors.ts";
import { extractR2Key, isAllowedR2Key } from "../utils/r2Keys.ts";
import { isTodoInMonth } from "../utils/todoDates.ts";
import type { DateColor } from "../types.ts";

test("R2 key validation rejects traversal and other users' avatars", () => {
  assert.equal(extractR2Key("https://example.com/my-bucket/todos/todo-1/1.jpg", "my-bucket"), "todos/todo-1/1.jpg");
  assert.equal(extractR2Key("todos/todo-1/1.jpg"), "todos/todo-1/1.jpg");
  assert.equal(extractR2Key("todos/todo-1/%2e%2e/secret.jpg"), null);
  assert.equal(extractR2Key("../users/victim/avatar.jpg"), null);

  assert.equal(isAllowedR2Key("todos/todo-1/1.jpg", "user-a"), true);
  assert.equal(isAllowedR2Key("users/user-a/avatar.png", "user-a"), true);
  assert.equal(isAllowedR2Key("users/user-b/avatar.png", "user-a"), false);
  assert.equal(isAllowedR2Key("admin/secrets.json", "user-a"), false);
});

test("month deletion selection only includes real dates in the requested month", () => {
  assert.equal(isTodoInMonth({ dateStr: "2026-06-01" }, 2026, 6), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-06-30" }, 2026, 6), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-07-01" }, 2026, 6), false);
  assert.equal(isTodoInMonth({ dateStr: "important" }, 2026, 6), false);
  assert.equal(isTodoInMonth({ dateStr: "monthly" }, 2026, 6), false);
});

test("clearing a date color preserves an existing label", () => {
  const current: DateColor[] = [
    {
      id: "date-color-1",
      dateStr: "2026-06-30",
      color: "red",
      label: "締切",
      createdBy: "user-a",
    },
  ];

  assert.deepEqual(applyDateColorChange(current, "2026-06-30", null, "user-a"), [
    {
      id: "date-color-1",
      dateStr: "2026-06-30",
      color: null,
      label: "締切",
      createdBy: "user-a",
    },
  ]);
});

test("clearing a date label preserves an existing color", () => {
  const current: DateColor[] = [
    {
      id: "date-color-1",
      dateStr: "2026-06-30",
      color: "blue",
      label: "締切",
      createdBy: "user-a",
    },
  ];

  assert.deepEqual(applyDateLabelChange(current, "2026-06-30", "", "user-a"), [
    {
      id: "date-color-1",
      dateStr: "2026-06-30",
      color: "blue",
      label: null,
      createdBy: "user-a",
    },
  ]);
});
