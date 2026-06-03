import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DateColor } from "../types.ts";
import {
  applyDateColorChange,
  applyDateLabelChange,
  getDateColorClearAction,
  getDateLabelClearAction,
} from "../utils/dateColors.ts";

const baseDateColor: DateColor = {
  id: "date-color-1",
  dateStr: "2026-06-15",
  color: "blue",
  label: "旅行",
  createdBy: "user-1",
};

describe("date color persistence decisions", () => {
  it("aborts color clearing when the lookup fails", () => {
    const action = getDateColorClearAction(null, { code: "NETWORK_ERROR" });

    assert.equal(action, "abort");
  });

  it("aborts label clearing when the lookup fails", () => {
    const action = getDateLabelClearAction(null, { code: "NETWORK_ERROR" });

    assert.equal(action, "abort");
  });

  it("keeps the row when clearing only color from a labeled date", () => {
    const action = getDateColorClearAction({ label: "旅行" }, null);

    assert.equal(action, "clear-color");
  });

  it("keeps the row when clearing only label from a colored date", () => {
    const action = getDateLabelClearAction({ color: "blue" }, null);

    assert.equal(action, "clear-label");
  });
});

describe("date color optimistic updates", () => {
  it("preserves a label when clearing the date color", () => {
    const next = applyDateColorChange(
      [baseDateColor],
      baseDateColor.dateStr,
      null,
      baseDateColor.createdBy
    );

    assert.deepEqual(next, [{ ...baseDateColor, color: null }]);
  });

  it("removes the row when clearing the only remaining date color data", () => {
    const unlabeledColor = { ...baseDateColor, label: null };

    const next = applyDateColorChange(
      [unlabeledColor],
      unlabeledColor.dateStr,
      null,
      unlabeledColor.createdBy
    );

    assert.deepEqual(next, []);
  });

  it("preserves a color when clearing the date label", () => {
    const next = applyDateLabelChange(
      [baseDateColor],
      baseDateColor.dateStr,
      null,
      baseDateColor.createdBy
    );

    assert.deepEqual(next, [{ ...baseDateColor, label: null }]);
  });
});
