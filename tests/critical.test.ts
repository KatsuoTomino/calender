import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDateColorUpdate,
  applyDateLabelUpdate,
} from "../utils/dateColors.ts";
import {
  buildAvatarKey,
  buildTodoImageKey,
  isAllowedR2Key,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import { formatMonthPrefix, isTodoInMonth } from "../utils/todoDates.ts";

test("R2 keys are limited to expected image namespaces", () => {
  assert.equal(isAllowedR2Key(buildTodoImageKey("abc-123", "photo.PNG", 123)), true);
  assert.equal(isAllowedR2Key(buildAvatarKey("user-123", "avatar.webp")), true);
  assert.equal(isAllowedR2Key("todos/abc-123/123.exe"), false);
  assert.equal(isAllowedR2Key("../todos/abc-123/123.png"), false);
  assert.equal(isAllowedR2Key("users/other/avatar.png/../../secret"), false);
});

test("R2 URL normalization removes only URL and bucket wrappers", () => {
  assert.equal(
    normalizeR2Key("https://example.com/my-bucket/todos/abc/123.jpg", "my-bucket"),
    "todos/abc/123.jpg"
  );
  assert.equal(normalizeR2Key("/todos/abc/123.jpg"), "todos/abc/123.jpg");
});

test("month deletion matches persisted YYYY-MM-DD strings without Date parsing", () => {
  assert.equal(formatMonthPrefix(2026, 7), "2026-07-");
  assert.equal(isTodoInMonth({ dateStr: "2026-07-01" }, 2026, 7), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-08-01" }, 2026, 7), false);
  assert.equal(isTodoInMonth({ dateStr: "monthly" }, 2026, 7), false);
});

test("clearing date color preserves an existing label", () => {
  const result = applyDateColorUpdate(
    [{ id: "1", dateStr: "2026-07-02", color: "red", label: "記念日", createdBy: "user" }],
    "2026-07-02",
    null,
    "user"
  );

  assert.deepEqual(result, [
    { id: "1", dateStr: "2026-07-02", color: null, label: "記念日", createdBy: "user" },
  ]);
});

test("clearing date label preserves an existing color", () => {
  const result = applyDateLabelUpdate(
    [{ id: "1", dateStr: "2026-07-02", color: "blue", label: "メモ", createdBy: "user" }],
    "2026-07-02",
    null,
    "user"
  );

  assert.deepEqual(result, [
    { id: "1", dateStr: "2026-07-02", color: "blue", label: null, createdBy: "user" },
  ]);
});
