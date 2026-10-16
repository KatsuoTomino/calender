import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarMonthDate,
  shiftCalendarMonth,
} from "../utils/calendarMonth.ts";

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

test("next month from the 31st stays in the following month", () => {
  assert.equal(ymd(shiftCalendarMonth(new Date(2026, 0, 31), 1)), "2026-02-01");
  assert.equal(ymd(shiftCalendarMonth(new Date(2026, 2, 31), 1)), "2026-04-01");
  assert.equal(ymd(shiftCalendarMonth(new Date(2026, 4, 31), 1)), "2026-06-01");
  assert.equal(ymd(shiftCalendarMonth(new Date(2026, 7, 31), 1)), "2026-09-01");
  assert.equal(ymd(shiftCalendarMonth(new Date(2026, 9, 31), 1)), "2026-11-01");
  assert.equal(ymd(shiftCalendarMonth(new Date(2026, 11, 31), 1)), "2027-01-01");
});

test("previous month from the 31st does not stay in the same month", () => {
  assert.equal(ymd(shiftCalendarMonth(new Date(2026, 2, 31), -1)), "2026-02-01");
  assert.equal(ymd(shiftCalendarMonth(new Date(2026, 0, 31), -1)), "2025-12-01");
});

test("January 29 and 30 do not skip February in a non-leap year", () => {
  assert.equal(ymd(shiftCalendarMonth(new Date(2026, 0, 29), 1)), "2026-02-01");
  assert.equal(ymd(shiftCalendarMonth(new Date(2026, 0, 30), 1)), "2026-02-01");
});

test("leap-year January 31 moves to February", () => {
  assert.equal(ymd(shiftCalendarMonth(new Date(2024, 0, 31), 1)), "2024-02-01");
});

test("year-month picker lands on the selected month even when today is the 31st", () => {
  assert.equal(ymd(calendarMonthDate(2026, 1)), "2026-02-01");
  assert.equal(ymd(calendarMonthDate(2026, 8)), "2026-09-01");
});
