import assert from "node:assert/strict";
import test from "node:test";
import {
  createAvatarCandidateKeys,
  createAvatarKey,
  createTodoImageKey,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import {
  getMonthDateBounds,
  isTodoInMonth,
} from "../utils/todoDates.ts";

test("R2 keys are generated under fixed safe prefixes", () => {
  assert.equal(
    createTodoImageKey("todo/../123", "receipt.PNG", 1710000000000),
    "todos/todo_.._123/1710000000000.png"
  );
  assert.equal(
    createAvatarKey("user@example.com", "avatar.webp"),
    "users/user_example.com/avatar.webp"
  );
  assert.deepEqual(createAvatarCandidateKeys("user/1").slice(0, 2), [
    "users/user_1/avatar.jpg",
    "users/user_1/avatar.jpeg",
  ]);
});

test("R2 key normalization rejects traversal and non-image namespaces", () => {
  assert.equal(normalizeR2Key("todos/a/1.jpg"), "todos/a/1.jpg");
  assert.equal(
    normalizeR2Key("https://example.com/my-bucket/todos/a/1.jpg", "my-bucket"),
    "todos/a/1.jpg"
  );

  assert.equal(normalizeR2Key("../secrets.txt"), null);
  assert.equal(normalizeR2Key("todos/../secrets.txt"), null);
  assert.equal(normalizeR2Key("private/a.jpg"), null);
  assert.equal(normalizeR2Key("users//avatar.jpg"), null);
});

test("month deletion bounds use string-safe local date ranges", () => {
  assert.deepEqual(getMonthDateBounds(2024, 2), {
    startDateStr: "2024-02-01",
    endDateStr: "2024-02-29",
  });

  assert.equal(isTodoInMonth({ dateStr: "2024-02-01" }, 2024, 2), true);
  assert.equal(isTodoInMonth({ dateStr: "2024-02-29" }, 2024, 2), true);
  assert.equal(isTodoInMonth({ dateStr: "2024-03-01" }, 2024, 2), false);
  assert.equal(isTodoInMonth({ dateStr: "monthly" }, 2024, 2), false);
});
