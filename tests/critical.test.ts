import test from "node:test";
import assert from "node:assert/strict";
import { normalizeR2Key } from "../utils/r2Keys.ts";
import { filterTodosForMonth } from "../utils/todoDates.ts";
import { applyDateColorOptimistic } from "../utils/dateColors.ts";
import type { DateColor, TodoItem } from "../types.ts";

test("R2 key normalization rejects path traversal and non-image namespaces", () => {
  assert.equal(normalizeR2Key("todos/todo-1/image.jpg"), "todos/todo-1/image.jpg");
  assert.equal(
    normalizeR2Key("https://example.com/my-bucket/todos/todo-1/image.jpg", "my-bucket"),
    "todos/todo-1/image.jpg"
  );
  assert.equal(normalizeR2Key("../todos/todo-1/image.jpg"), null);
  assert.equal(normalizeR2Key("/todos/todo-1/image.jpg"), null);
  assert.equal(normalizeR2Key("private/secret.txt"), null);
});

test("month filtering uses YYYY-MM strings instead of Date parsing", () => {
  const todos = [
    { id: "may", dateStr: "2026-05-31" },
    { id: "june-start", dateStr: "2026-06-01" },
    { id: "june-end", dateStr: "2026-06-30" },
    { id: "july", dateStr: "2026-07-01" },
    { id: "monthly", dateStr: "monthly" },
  ] as Pick<TodoItem, "id" | "dateStr">[];

  assert.deepEqual(
    filterTodosForMonth(todos, 2026, 6).map((todo) => todo.id),
    ["june-start", "june-end"]
  );
});

test("clearing a date color preserves an existing label", () => {
  const colors: DateColor[] = [
    {
      id: "date-color-1",
      dateStr: "2026-06-27",
      color: "red",
      label: "旅行",
      createdBy: "user-1",
    },
  ];

  assert.deepEqual(
    applyDateColorOptimistic(colors, "2026-06-27", null, "user-1", () => "new-id"),
    [
      {
        id: "date-color-1",
        dateStr: "2026-06-27",
        color: null,
        label: "旅行",
        createdBy: "user-1",
      },
    ]
  );
});
