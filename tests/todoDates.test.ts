import test from "node:test";
import assert from "node:assert/strict";
import { getMonthDateRange, isTodoInMonth } from "../utils/todoDates.ts";

test("getMonthDateRange returns padded inclusive bounds", () => {
  assert.deepEqual(getMonthDateRange(2026, 5), {
    startDateStr: "2026-05-01",
    endDateStr: "2026-05-31",
  });
});

test("getMonthDateRange handles leap years", () => {
  assert.deepEqual(getMonthDateRange(2024, 2), {
    startDateStr: "2024-02-01",
    endDateStr: "2024-02-29",
  });
});

test("isTodoInMonth matches persisted YYYY-MM-DD strings without timezone parsing", () => {
  assert.equal(isTodoInMonth("2026-05-01", 2026, 5), true);
  assert.equal(isTodoInMonth("2026-05-31", 2026, 5), true);
  assert.equal(isTodoInMonth("2026-06-01", 2026, 5), false);
  assert.equal(isTodoInMonth("important", 2026, 5), false);
});
