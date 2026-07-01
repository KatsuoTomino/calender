import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDateColorUpdate,
  applyDateLabelUpdate,
} from "../utils/dateColors.ts";
import type { DateColor } from "../types";

const existingDateColor: DateColor = {
  id: "existing-id",
  dateStr: "2026-07-01",
  color: "red",
  label: "記念日",
  createdBy: "user-1",
};

test("clearing a date color preserves the existing label", () => {
  const updated = applyDateColorUpdate(
    [existingDateColor],
    existingDateColor.dateStr,
    null,
    existingDateColor.createdBy,
    "new-id"
  );

  assert.deepEqual(updated, [
    {
      ...existingDateColor,
      color: null,
    },
  ]);
});

test("clearing a date label preserves the existing color", () => {
  const updated = applyDateLabelUpdate(
    [existingDateColor],
    existingDateColor.dateStr,
    "   ",
    existingDateColor.createdBy,
    "new-id"
  );

  assert.deepEqual(updated, [
    {
      ...existingDateColor,
      label: null,
    },
  ]);
});

test("clearing the final date color field removes the local row", () => {
  const updated = applyDateColorUpdate(
    [{ ...existingDateColor, label: null }],
    existingDateColor.dateStr,
    null,
    existingDateColor.createdBy,
    "new-id"
  );

  assert.deepEqual(updated, []);
});
