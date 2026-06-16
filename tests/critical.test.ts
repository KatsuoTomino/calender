import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOptimisticDateColor, applyOptimisticDateLabel } from "../utils/dateColors.ts";
import { extractR2Key, isAllowedR2Key, buildAvatarKey } from "../utils/r2Keys.ts";
import { getMonthDateRange, isTodoInMonth } from "../utils/todoDates.ts";
import { DateColor } from "../types.ts";

test("clearing a date color preserves an existing label in optimistic state", () => {
  const existing: DateColor[] = [
    {
      id: "date-color-1",
      dateStr: "2026-06-16",
      color: "red",
      label: "記念日",
      createdBy: "user-1",
    },
  ];

  assert.deepEqual(
    applyOptimisticDateColor(existing, "2026-06-16", null, "user-1", () => "new-id"),
    [
      {
        id: "date-color-1",
        dateStr: "2026-06-16",
        color: null,
        label: "記念日",
        createdBy: "user-1",
      },
    ]
  );
});

test("clearing a date label preserves an existing color in optimistic state", () => {
  const existing: DateColor[] = [
    {
      id: "date-color-1",
      dateStr: "2026-06-16",
      color: "blue",
      label: "買い物",
      createdBy: "user-1",
    },
  ];

  assert.deepEqual(
    applyOptimisticDateLabel(existing, "2026-06-16", "", "user-1", () => "new-id"),
    [
      {
        id: "date-color-1",
        dateStr: "2026-06-16",
        color: "blue",
        label: null,
        createdBy: "user-1",
      },
    ]
  );
});

test("R2 URL extraction strips bucket prefixes and rejects unsafe keys", () => {
  assert.equal(
    extractR2Key("https://example.com/kizuna/todos/todo-1/image.jpg?X-Amz-Signature=abc", "kizuna"),
    "todos/todo-1/image.jpg"
  );
  assert.equal(extractR2Key(buildAvatarKey("user-1", "png")), "users/user-1/avatar.png");
  assert.equal(isAllowedR2Key("todos/todo-1/image.jpg"), true);
  assert.equal(isAllowedR2Key("todos/todo-1/../../secret.txt"), false);
});

test("month ranges use string-safe local calendar boundaries", () => {
  assert.deepEqual(getMonthDateRange(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
  });
  assert.equal(isTodoInMonth("2026-02-28", 2026, 2), true);
  assert.equal(isTodoInMonth("2026-03-01", 2026, 2), false);
  assert.equal(isTodoInMonth("monthly", 2026, 2), false);
});
