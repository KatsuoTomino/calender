import assert from "node:assert/strict";
import test from "node:test";
import {
  isAvatarKeyForUser,
  isReadableR2Key,
  isTodoImageKey,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import { getTodosInMonth } from "../utils/todoDates.ts";
import type { TodoItem } from "../types.ts";

test("R2キー正規化はURLとバケット接頭辞を安全なキーへ変換する", () => {
  assert.equal(
    normalizeR2Key(
      "https://example.r2.cloudflarestorage.com/kizuna/todos/todo-1/123.jpg",
      "kizuna"
    ),
    "todos/todo-1/123.jpg"
  );
  assert.equal(normalizeR2Key("/todos/todo-1/123.jpg"), "todos/todo-1/123.jpg");
});

test("R2キー検証はパストラバーサルと他ユーザーのアバターを拒否する", () => {
  assert.equal(normalizeR2Key("todos/todo-1/../secret.jpg"), null);
  assert.equal(isTodoImageKey("todos/todo-1/123.jpg"), true);
  assert.equal(isAvatarKeyForUser("users/user-a/avatar.jpg", "user-a"), true);
  assert.equal(isReadableR2Key("users/user-b/avatar.jpg", "user-a"), false);
});

test("月次削除対象はYYYY-MM-DD文字列の対象月Todoだけに限定する", () => {
  const todos: TodoItem[] = [
    { id: "jan", dateStr: "2026-01-31", text: "a", completed: false, createdBy: "u" },
    { id: "feb", dateStr: "2026-02-01", text: "b", completed: false, createdBy: "u" },
    { id: "monthly", dateStr: "monthly", text: "c", completed: false, createdBy: "u" },
    { id: "important", dateStr: "important", text: "d", completed: false, createdBy: "u" },
  ];

  assert.deepEqual(
    getTodosInMonth(todos, 2026, 1).map((todo) => todo.id),
    ["jan"]
  );
});
