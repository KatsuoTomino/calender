import test from "node:test";
import assert from "node:assert/strict";
import { applyDateColorChange, applyDateLabelChange } from "../utils/dateColors.ts";
import { filterTodosInMonth, getMonthDateRange } from "../utils/todoDates.ts";
import {
  buildAvatarKey,
  buildTodoImageKey,
  isSafeR2Key,
  normalizeR2Key,
} from "../utils/r2Keys.ts";

test("clearing a date color preserves an existing label", () => {
  const result = applyDateColorChange(
    [
      {
        id: "date-color-1",
        dateStr: "2026-06-20",
        color: "red",
        label: "記念日",
        createdBy: "user-1",
      },
    ],
    "2026-06-20",
    null,
    "user-1",
    () => "new-id"
  );

  assert.deepEqual(result, [
    {
      id: "date-color-1",
      dateStr: "2026-06-20",
      color: null,
      label: "記念日",
      createdBy: "user-1",
    },
  ]);
});

test("clearing the last date label removes an empty date color row", () => {
  const result = applyDateLabelChange(
    [
      {
        id: "date-color-1",
        dateStr: "2026-06-20",
        color: null,
        label: "記念日",
        createdBy: "user-1",
      },
    ],
    "2026-06-20",
    "",
    "user-1",
    () => "new-id"
  );

  assert.deepEqual(result, []);
});

test("month filtering uses date strings instead of timezone-sensitive Date parsing", () => {
  const todos = [
    { id: "may-last", dateStr: "2026-05-31" },
    { id: "june-first", dateStr: "2026-06-01" },
    { id: "june-last", dateStr: "2026-06-30" },
    { id: "july-first", dateStr: "2026-07-01" },
    { id: "monthly", dateStr: "monthly" },
  ];

  assert.deepEqual(
    filterTodosInMonth(todos, 2026, 6).map((todo) => todo.id),
    ["june-first", "june-last"]
  );
  assert.deepEqual(getMonthDateRange(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
  });
});

test("R2 keys are constrained to app-owned object prefixes", () => {
  assert.equal(
    normalizeR2Key("https://example.com/kizuna/todos/todo-1/123.png", "kizuna"),
    "todos/todo-1/123.png"
  );
  assert.equal(isSafeR2Key("todos/todo-1/123.png"), true);
  assert.equal(isSafeR2Key("users/user-1/avatar.webp"), true);
  assert.equal(isSafeR2Key("../secret"), false);
  assert.equal(isSafeR2Key("todos/todo-1/../../secret"), false);
  assert.equal(isSafeR2Key("other/todo-1/123.png"), false);
});

test("R2 key builders sanitize image extensions and reject unsafe ids", () => {
  assert.equal(buildTodoImageKey("todo-1", "photo.PNG", 123), "todos/todo-1/123.png");
  assert.equal(buildAvatarKey("user-1", "avatar.exe"), "users/user-1/avatar.jpg");
  assert.throws(() => buildTodoImageKey("../todo", "photo.png", 123));
});
