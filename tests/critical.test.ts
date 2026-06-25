import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDateColorChange,
  applyDateLabelChange,
} from "../utils/dateColors.ts";
import {
  avatarKeysForUser,
  buildAvatarKey,
  buildTodoImageKey,
  getSafeImageExtension,
  isAllowedImageKeyForUser,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import { getMonthPrefix, isTodoInMonth } from "../utils/todoDates.ts";
import type { DateColor } from "../types.ts";

test("month matching uses YYYY-MM prefix without parsing pseudo task dates", () => {
  assert.equal(getMonthPrefix(2026, 6), "2026-06-");
  assert.equal(isTodoInMonth("2026-06-25", 2026, 6), true);
  assert.equal(isTodoInMonth("2026-07-01", 2026, 6), false);
  assert.equal(isTodoInMonth("monthly", 2026, 6), false);
  assert.equal(isTodoInMonth("shopping", 2026, 6), false);
});

test("R2 key validation only allows todo images and the authenticated user's avatar", () => {
  const userId = "user-123";
  const todoKey = buildTodoImageKey("abc_123", 1234567890, "webp");
  const avatarKey = buildAvatarKey(userId, "png");

  assert.equal(isAllowedImageKeyForUser(todoKey, userId), true);
  assert.equal(isAllowedImageKeyForUser(avatarKey, userId), true);
  assert.equal(isAllowedImageKeyForUser("users/other/avatar.png", userId), false);
  assert.equal(isAllowedImageKeyForUser("todos/abc_123/../../secret.png", userId), false);
  assert.equal(isAllowedImageKeyForUser("arbitrary/file.png", userId), false);
  assert.deepEqual(avatarKeysForUser(userId), [
    "users/user-123/avatar.jpg",
    "users/user-123/avatar.jpeg",
    "users/user-123/avatar.png",
    "users/user-123/avatar.webp",
    "users/user-123/avatar.gif",
  ]);
});

test("R2 helper normalizes old URL values and constrains file extensions", () => {
  assert.equal(
    normalizeR2Key("https://example.com/bucket/todos/abc/123.jpg", "bucket"),
    "todos/abc/123.jpg"
  );
  assert.equal(getSafeImageExtension("photo.JPEG"), "jpeg");
  assert.equal(getSafeImageExtension("payload.svg"), "jpg");
});

test("clearing a date color preserves an existing label", () => {
  const current: DateColor[] = [
    {
      id: "row-1",
      dateStr: "2026-06-25",
      color: "red",
      label: "記念日",
      createdBy: "user-123",
    },
  ];

  const updated = applyDateColorChange(
    current,
    "2026-06-25",
    null,
    "user-123",
    () => "new-id"
  );

  assert.deepEqual(updated, [
    {
      id: "row-1",
      dateStr: "2026-06-25",
      color: null,
      label: "記念日",
      createdBy: "user-123",
    },
  ]);
});

test("clearing a date label preserves an existing color", () => {
  const current: DateColor[] = [
    {
      id: "row-1",
      dateStr: "2026-06-25",
      color: "blue",
      label: "予定",
      createdBy: "user-123",
    },
  ];

  const updated = applyDateLabelChange(
    current,
    "2026-06-25",
    "",
    "user-123",
    () => "new-id"
  );

  assert.deepEqual(updated, [
    {
      id: "row-1",
      dateStr: "2026-06-25",
      color: "blue",
      label: null,
      createdBy: "user-123",
    },
  ]);
});
