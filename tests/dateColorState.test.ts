import assert from "node:assert/strict";
import {
  applyDateColorUpdate,
  applyDateLabelUpdate,
} from "../services/dateColorState.ts";
import type { DateColor } from "../types";

const baseDateColor: DateColor = {
  id: "date-color-1",
  dateStr: "2026-05-28",
  color: "red",
  label: "通院",
  createdBy: "user-1",
};

{
  const updated = applyDateColorUpdate(
    [baseDateColor],
    "2026-05-28",
    null,
    "user-1"
  );

  assert.deepEqual(updated, [
    {
      ...baseDateColor,
      color: null,
    },
  ]);
}

{
  const updated = applyDateColorUpdate(
    [{ ...baseDateColor, label: null }],
    "2026-05-28",
    null,
    "user-1"
  );

  assert.deepEqual(updated, []);
}

{
  const updated = applyDateLabelUpdate(
    [baseDateColor],
    "2026-05-28",
    "  旅行  ",
    "user-1"
  );

  assert.deepEqual(updated, [
    {
      ...baseDateColor,
      label: "旅行",
    },
  ]);
}

{
  const updated = applyDateLabelUpdate(
    [baseDateColor],
    "2026-05-28",
    null,
    "user-1"
  );

  assert.deepEqual(updated, [
    {
      ...baseDateColor,
      label: null,
    },
  ]);
}

{
  const updated = applyDateLabelUpdate(
    [{ ...baseDateColor, color: null }],
    "2026-05-28",
    null,
    "user-1"
  );

  assert.deepEqual(updated, []);
}
