import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDateColorChange, applyDateLabelChange } from "../utils/dateColors.ts";
import { assertAllowedR2Key, getSafeImageExtension, normalizeR2Key } from "../utils/r2Keys.ts";
import { getMonthDateRange, isDateStrInMonth } from "../utils/todoDates.ts";

describe("date color optimistic updates", () => {
  it("keeps an existing label when a date color is cleared", () => {
    const result = applyDateColorChange(
      [{ id: "1", dateStr: "2026-07-07", color: "red", label: "記念日", createdBy: "u1" }],
      "2026-07-07",
      null,
      "u1",
      () => "new"
    );

    assert.deepEqual(result, [
      { id: "1", dateStr: "2026-07-07", color: null, label: "記念日", createdBy: "u1" },
    ]);
  });

  it("keeps an existing color when a label is cleared", () => {
    const result = applyDateLabelChange(
      [{ id: "1", dateStr: "2026-07-07", color: "blue", label: "予定", createdBy: "u1" }],
      "2026-07-07",
      "",
      "u1",
      () => "new"
    );

    assert.deepEqual(result, [
      { id: "1", dateStr: "2026-07-07", color: "blue", label: null, createdBy: "u1" },
    ]);
  });
});

describe("todo month ranges", () => {
  it("uses stable YYYY-MM-DD string bounds", () => {
    assert.deepEqual(getMonthDateRange(2026, 2), {
      start: "2026-02-01",
      end: "2026-02-28",
    });
    assert.equal(isDateStrInMonth("2026-02-28", 2026, 2), true);
    assert.equal(isDateStrInMonth("2026-03-01", 2026, 2), false);
    assert.equal(isDateStrInMonth("monthly", 2026, 2), false);
  });
});

describe("R2 key validation", () => {
  it("accepts only expected image prefixes", () => {
    assert.equal(
      assertAllowedR2Key("https://example.com/my-bucket/todos/todo_1/123.jpg", "my-bucket"),
      "todos/todo_1/123.jpg"
    );
    assert.equal(assertAllowedR2Key("users/user-1/avatar.webp"), "users/user-1/avatar.webp");
  });

  it("rejects keys outside todo and avatar image prefixes", () => {
    assert.throws(() => assertAllowedR2Key("secrets/config.json"));
    assert.throws(() => assertAllowedR2Key("todos/../secret.jpg"));
    assert.throws(() => assertAllowedR2Key("users/user-1/private.txt"));
  });

  it("normalizes bucket-prefixed URLs and safe image extensions", () => {
    assert.equal(
      normalizeR2Key("https://example.com/my-bucket/todos/todo1/file.png", "my-bucket"),
      "todos/todo1/file.png"
    );
    assert.equal(getSafeImageExtension("photo.PNG", "image/png"), "png");
    assert.equal(getSafeImageExtension("photo.bin", "image/webp"), "webp");
    assert.equal(getSafeImageExtension("photo.bin", "application/octet-stream"), "jpg");
  });
});

