import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDateColorOptimistic,
  applyDateLabelOptimistic,
} from "../utils/dateColors.ts";
import {
  buildAvatarKey,
  buildTodoImageKey,
  isAllowedR2KeyForUser,
  isSafeR2PathSegment,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import { getMonthDateRange, isDateStrInMonth } from "../utils/todoDates.ts";

test("clearing a date color preserves an existing label", () => {
  const result = applyDateColorOptimistic(
    [
      {
        id: "date-color-1",
        dateStr: "2026-07-05",
        color: "red",
        label: "記念日",
        createdBy: "user-1",
      },
    ],
    "2026-07-05",
    null,
    "user-1",
    () => "new-id"
  );

  assert.deepEqual(result, [
    {
      id: "date-color-1",
      dateStr: "2026-07-05",
      color: null,
      label: "記念日",
      createdBy: "user-1",
    },
  ]);
});

test("clearing the last date color field removes the optimistic row", () => {
  const result = applyDateColorOptimistic(
    [
      {
        id: "date-color-1",
        dateStr: "2026-07-05",
        color: "red",
        label: null,
        createdBy: "user-1",
      },
    ],
    "2026-07-05",
    null,
    "user-1",
    () => "new-id"
  );

  assert.deepEqual(result, []);
});

test("clearing a label preserves an existing color", () => {
  const result = applyDateLabelOptimistic(
    [
      {
        id: "date-color-1",
        dateStr: "2026-07-05",
        color: "blue",
        label: "予定",
        createdBy: "user-1",
      },
    ],
    "2026-07-05",
    null,
    "user-1",
    () => "new-id"
  );

  assert.deepEqual(result, [
    {
      id: "date-color-1",
      dateStr: "2026-07-05",
      color: "blue",
      label: null,
      createdBy: "user-1",
    },
  ]);
});

test("month helpers use string ranges without timezone parsing", () => {
  assert.deepEqual(getMonthDateRange(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
  });
  assert.equal(isDateStrInMonth("2026-02-01", 2026, 2), true);
  assert.equal(isDateStrInMonth("2026-02-28", 2026, 2), true);
  assert.equal(isDateStrInMonth("2026-03-01", 2026, 2), false);
  assert.equal(isDateStrInMonth("monthly", 2026, 2), false);
});

test("R2 keys are normalized and constrained to app-owned prefixes", () => {
  assert.equal(buildTodoImageKey("todo-1", "photo.PNG", 123), "todos/todo-1/123.png");
  assert.equal(buildAvatarKey("user-1", "avatar.webp"), "users/user-1/avatar.webp");
  assert.equal(
    normalizeR2Key("https://example.com/my-bucket/todos/todo-1/123.png", "my-bucket"),
    "todos/todo-1/123.png"
  );
  assert.equal(normalizeR2Key("../secret.txt"), null);
  assert.equal(isAllowedR2KeyForUser("todos/todo-1/123.png", "user-1"), true);
  assert.equal(isAllowedR2KeyForUser("users/user-1/avatar.jpg", "user-1"), true);
  assert.equal(isAllowedR2KeyForUser("users/user-2/avatar.jpg", "user-1"), false);
  assert.equal(isSafeR2PathSegment("todo-1"), true);
  assert.equal(isSafeR2PathSegment("../todo-1"), false);
});
