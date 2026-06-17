import assert from "node:assert/strict";
import test from "node:test";

import { applyDateColorUpdate } from "../utils/dateColors.ts";
import { extractR2Key, isAllowedR2KeyForUser } from "../utils/r2Keys.ts";
import { isTodoDateInMonth } from "../utils/todoDates.ts";

test("clearing a date color preserves an existing label", () => {
  const updated = applyDateColorUpdate(
    [
      {
        id: "date-color-1",
        dateStr: "2026-06-17",
        color: "red",
        label: "記念日",
        createdBy: "user-1",
      },
    ],
    "2026-06-17",
    null,
    "user-1",
    () => "new-id"
  );

  assert.deepEqual(updated, [
    {
      id: "date-color-1",
      dateStr: "2026-06-17",
      color: null,
      label: "記念日",
      createdBy: "user-1",
    },
  ]);
});

test("month matching uses YYYY-MM-DD strings without timezone shifts", () => {
  assert.equal(isTodoDateInMonth("2026-06-01", 2026, 6), true);
  assert.equal(isTodoDateInMonth("2026-06-30", 2026, 6), true);
  assert.equal(isTodoDateInMonth("2026-05-31", 2026, 6), false);
  assert.equal(isTodoDateInMonth("monthly", 2026, 6), false);
});

test("R2 key validation allows only todo images and the current user's avatar", () => {
  assert.equal(
    extractR2Key("https://example.com/kizuna/todos/todo-1/1770000000000.jpg", "kizuna"),
    "todos/todo-1/1770000000000.jpg"
  );
  assert.equal(
    isAllowedR2KeyForUser("todos/todo-1/1770000000000.webp", "user-1"),
    true
  );
  assert.equal(
    isAllowedR2KeyForUser("users/user-1/avatar.png", "user-1"),
    true
  );
  assert.equal(
    isAllowedR2KeyForUser("users/user-2/avatar.png", "user-1"),
    false
  );
  assert.equal(
    isAllowedR2KeyForUser("../secrets.txt", "user-1"),
    false
  );
});
