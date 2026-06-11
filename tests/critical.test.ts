import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAllowedR2KeyForUser,
  normalizeR2Key,
  sanitizeR2KeySegment,
} from "../utils/r2Keys.ts";
import { getMonthDateBounds, isTodoInMonth } from "../utils/todoDates.ts";
import { applyDateColorUpdate, applyDateLabelUpdate } from "../utils/dateColors.ts";
import type { DateColor, TodoItem } from "../types.ts";

test("R2キー正規化はURLからバケット名を取り除き、危険な相対パスを拒否する", () => {
  assert.equal(
    normalizeR2Key("https://example.r2.cloudflarestorage.com/my-bucket/todos/todo1/image.jpg", "my-bucket"),
    "todos/todo1/image.jpg"
  );
  assert.equal(normalizeR2Key("todos/todo1/image.jpg"), "todos/todo1/image.jpg");
  assert.equal(normalizeR2Key("todos/../secret.txt"), null);
});

test("R2キーはTodo画像またはログインユーザー自身のアバターだけを許可する", () => {
  assert.equal(isAllowedR2KeyForUser("todos/todo1/image.jpg", "user-a"), true);
  assert.equal(isAllowedR2KeyForUser("users/user-a/avatar.jpg", "user-a"), true);
  assert.equal(isAllowedR2KeyForUser("users/user-b/avatar.jpg", "user-a"), false);
  assert.equal(sanitizeR2KeySegment("todo_123-abc"), "todo_123-abc");
  assert.equal(sanitizeR2KeySegment("../todo"), null);
});

test("月削除の対象判定はYYYY-MM-DD文字列範囲で行う", () => {
  assert.deepEqual(getMonthDateBounds(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
  });

  const todo = (dateStr: string): TodoItem => ({
    id: dateStr,
    dateStr,
    text: "todo",
    completed: false,
    createdBy: "user-a",
  });

  assert.equal(isTodoInMonth(todo("2026-02-01"), 2026, 2), true);
  assert.equal(isTodoInMonth(todo("2026-02-28"), 2026, 2), true);
  assert.equal(isTodoInMonth(todo("2026-03-01"), 2026, 2), false);
  assert.equal(isTodoInMonth(todo("monthly"), 2026, 2), false);
});

test("日付カラー解除は既存ラベルを楽観更新で落とさない", () => {
  const colors: DateColor[] = [
    {
      id: "color-1",
      dateStr: "2026-06-11",
      color: "red",
      label: "記念日",
      createdBy: "user-a",
    },
  ];

  assert.deepEqual(applyDateColorUpdate(colors, "2026-06-11", null, "user-a", () => "new-id"), [
    {
      id: "color-1",
      dateStr: "2026-06-11",
      color: null,
      label: "記念日",
      createdBy: "user-a",
    },
  ]);
});

test("日付ラベル解除は既存カラーを楽観更新で落とさない", () => {
  const colors: DateColor[] = [
    {
      id: "color-1",
      dateStr: "2026-06-11",
      color: "blue",
      label: "予定",
      createdBy: "user-a",
    },
  ];

  assert.deepEqual(applyDateLabelUpdate(colors, "2026-06-11", null, "user-a", () => "new-id"), [
    {
      id: "color-1",
      dateStr: "2026-06-11",
      color: "blue",
      label: null,
      createdBy: "user-a",
    },
  ]);
});
