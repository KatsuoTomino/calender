import assert from "node:assert/strict";
import test from "node:test";
import { applyDateColorOptimisticUpdate } from "../utils/dateColors.ts";
import {
  buildAvatarKey,
  extractR2Key,
  isAllowedR2Key,
  isUserAvatarKey,
} from "../utils/r2Keys.ts";
import { isTodoInMonth, monthDateRange } from "../utils/todoDates.ts";

test("avatar keys normalize extensions to avoid cross-device lookup misses", () => {
  assert.equal(buildAvatarKey("user-1", "Photo.JPG"), "users/user-1/avatar.jpg");
});

test("R2 key validation rejects traversal and arbitrary prefixes", () => {
  assert.equal(isAllowedR2Key("todos/todo-1/123.jpg"), true);
  assert.equal(isAllowedR2Key("users/user-1/avatar.png"), true);
  assert.equal(isAllowedR2Key("../secrets.txt"), false);
  assert.equal(isAllowedR2Key("users/user-2/private.txt"), false);
});

test("avatar deletes are scoped to the authenticated user", () => {
  assert.equal(isUserAvatarKey("users/user-1/avatar.png", "user-1"), true);
  assert.equal(isUserAvatarKey("users/user-2/avatar.png", "user-1"), false);
});

test("R2 key extraction strips bucket path but rejects invalid URLs", () => {
  assert.equal(
    extractR2Key("https://example.com/my-bucket/todos/todo-1/123.webp", "my-bucket"),
    "todos/todo-1/123.webp"
  );
  assert.equal(extractR2Key("https://example.com/admin/secrets.json", "my-bucket"), null);
});

test("month deletion range uses local string bounds", () => {
  assert.deepEqual(monthDateRange(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
  });
  assert.equal(isTodoInMonth({ dateStr: "2026-02-28" }, 2026, 2), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-03-01" }, 2026, 2), false);
  assert.equal(isTodoInMonth({ dateStr: "monthly" }, 2026, 2), false);
});

test("clearing a date color keeps an existing label in optimistic state", () => {
  const updated = applyDateColorOptimisticUpdate(
    [
      {
        id: "date-color-1",
        dateStr: "2026-07-10",
        color: "red",
        label: "締切",
        createdBy: "user-1",
      },
    ],
    "2026-07-10",
    null,
    "user-1"
  );

  assert.deepEqual(updated, [
    {
      id: "date-color-1",
      dateStr: "2026-07-10",
      color: null,
      label: "締切",
      createdBy: "user-1",
    },
  ]);
});
