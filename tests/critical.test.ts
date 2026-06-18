import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDateColorChange, applyDateLabelChange } from "../utils/dateColors.ts";
import { assertAllowedR2Key, normalizeR2Key } from "../utils/r2Keys.ts";
import { isTodoInMonth, monthBounds } from "../utils/todoDates.ts";
import type { DateColor } from "../types.ts";

test("R2 keys are normalized and constrained to application-owned prefixes", () => {
  assert.equal(normalizeR2Key("https://example.com/todos/abc/1.png"), "todos/abc/1.png");
  assert.equal(assertAllowedR2Key("/users/user-1/avatar.jpg"), "users/user-1/avatar.jpg");
  assert.throws(() => assertAllowedR2Key("secrets/key.txt"), /許可されていないR2キー/);
  assert.throws(() => assertAllowedR2Key("todos/abc/../secret.txt"), /許可されていないR2キー/);
});

test("month bounds use date strings so local timezone parsing cannot shift days", () => {
  assert.deepEqual(monthBounds(2026, 2), { start: "2026-02-01", end: "2026-02-28" });
  assert.equal(isTodoInMonth({ dateStr: "2026-02-01" } as any, 2026, 2), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-02-28" } as any, 2026, 2), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-03-01" } as any, 2026, 2), false);
  assert.equal(isTodoInMonth({ dateStr: "monthly" } as any, 2026, 2), false);
});

test("clearing a date color preserves an existing label", () => {
  const previous: DateColor[] = [
    { id: "row-1", dateStr: "2026-06-18", color: "red", label: "記念日", createdBy: "user-1" },
  ];

  assert.deepEqual(applyDateColorChange(previous, "2026-06-18", null, "user-1"), [
    { id: "row-1", dateStr: "2026-06-18", color: null, label: "記念日", createdBy: "user-1" },
  ]);
});

test("clearing a date label preserves an existing color", () => {
  const previous: DateColor[] = [
    { id: "row-1", dateStr: "2026-06-18", color: "blue", label: "予定", createdBy: "user-1" },
  ];

  assert.deepEqual(applyDateLabelChange(previous, "2026-06-18", null, "user-1"), [
    { id: "row-1", dateStr: "2026-06-18", color: "blue", label: null, createdBy: "user-1" },
  ]);
});
