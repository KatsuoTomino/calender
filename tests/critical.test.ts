import assert from "node:assert/strict";
import test from "node:test";

import { applyDateColorChange } from "../utils/dateColors.ts";
import { getTodosForMonth, isDateStrInMonth } from "../utils/todoDates.ts";
import {
  isAllowedR2KeyForUser,
  normalizeR2Key,
} from "../utils/r2Keys.ts";

test("月削除対象はYYYY-MM-DD文字列で判定し、タイムゾーンで月境界を誤らない", () => {
  const todos = [
    { id: "feb-last", dateStr: "2026-02-28" },
    { id: "mar-first", dateStr: "2026-03-01" },
    { id: "mar-last", dateStr: "2026-03-31" },
    { id: "apr-first", dateStr: "2026-04-01" },
    { id: "important", dateStr: "important" },
  ];

  assert.equal(isDateStrInMonth("2026-03-01", 2026, 3), true);
  assert.equal(isDateStrInMonth("2026-04-01", 2026, 3), false);
  assert.deepEqual(
    getTodosForMonth(todos, 2026, 3).map((todo) => todo.id),
    ["mar-first", "mar-last"]
  );
});

test("背景色だけを解除しても既存ラベルは保持する", () => {
  const current = [
    {
      id: "date-color-1",
      dateStr: "2026-03-12",
      color: "red" as const,
      label: "旅行",
      createdBy: "user-1",
    },
  ];

  assert.deepEqual(
    applyDateColorChange(current, "2026-03-12", null, "user-1", () => "new-id"),
    [
      {
        id: "date-color-1",
        dateStr: "2026-03-12",
        color: null,
        label: "旅行",
        createdBy: "user-1",
      },
    ]
  );
});

test("R2 APIはアプリが生成した安全なキーだけを許可する", () => {
  assert.equal(
    normalizeR2Key("https://example.com/bucket/todos/todo-1/12345.jpg", "bucket"),
    "todos/todo-1/12345.jpg"
  );
  assert.equal(isAllowedR2KeyForUser("todos/todo-1/12345.jpg", "user-1"), true);
  assert.equal(isAllowedR2KeyForUser("users/user-1/avatar.png", "user-1"), true);
  assert.equal(isAllowedR2KeyForUser("users/user-2/avatar.png", "user-1"), false);
  assert.equal(isAllowedR2KeyForUser("../secret.txt", "user-1"), false);
});
