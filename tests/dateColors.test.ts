import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDateColorUpdate,
  applyDateLabelUpdate,
} from "../utils/dateColors.ts";
import type { DateColor } from "../types.ts";

const baseDateColor: DateColor = {
  id: "date-color-1",
  dateStr: "2026-06-01",
  color: "red",
  label: "Birthday",
  createdBy: "user-1",
};

test("clearing a color preserves an existing label", () => {
  const result = applyDateColorUpdate(
    [baseDateColor],
    baseDateColor.dateStr,
    null,
    baseDateColor.createdBy
  );

  assert.deepEqual(result, [
    {
      ...baseDateColor,
      color: null,
    },
  ]);
});

test("clearing a label preserves an existing color", () => {
  const result = applyDateLabelUpdate(
    [baseDateColor],
    baseDateColor.dateStr,
    null,
    baseDateColor.createdBy
  );

  assert.deepEqual(result, [
    {
      ...baseDateColor,
      label: null,
    },
  ]);
});

test("clearing the final date color field removes the row", () => {
  const labelOnly: DateColor = {
    ...baseDateColor,
    color: null,
  };

  const result = applyDateLabelUpdate(
    [labelOnly],
    labelOnly.dateStr,
    null,
    labelOnly.createdBy
  );

  assert.deepEqual(result, []);
});
