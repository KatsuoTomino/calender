import test from "node:test";
import assert from "node:assert/strict";
import {
  isCalendarDateInMonth,
  isMonthlyTaskDateStr,
} from "../services/todoDateUtils.ts";

test("monthly task detection includes current and legacy keys", () => {
  assert.equal(isMonthlyTaskDateStr("monthly"), true);
  assert.equal(isMonthlyTaskDateStr("2026-05"), true);
  assert.equal(isMonthlyTaskDateStr("2026-05-01"), false);
  assert.equal(isMonthlyTaskDateStr("important"), false);
});

test("calendar month matching is string based and excludes legacy monthly keys", () => {
  assert.equal(isCalendarDateInMonth("2026-05-01", 2026, 5), true);
  assert.equal(isCalendarDateInMonth("2026-05-31", 2026, 5), true);
  assert.equal(isCalendarDateInMonth("2026-06-01", 2026, 5), false);
  assert.equal(isCalendarDateInMonth("2026-05", 2026, 5), false);
});
