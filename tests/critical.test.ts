import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyDateColorUpdate, applyDateLabelUpdate } from "../utils/dateColors.ts";
import { isTodoInMonth, monthPrefix, uniqueTodoIds } from "../utils/todoDates.ts";

test("client R2 service does not import AWS SDK or read R2 secrets", () => {
  const source = readFileSync(new URL("../services/r2Service.ts", import.meta.url), "utf8");

  assert.equal(source.includes("@aws-sdk/"), false);
  assert.equal(source.includes("VITE_R2_"), false);
  assert.equal(source.includes("SECRET_ACCESS_KEY"), false);
});

test("clearing a date color preserves an existing label", () => {
  const updated = applyDateColorUpdate(
    [
      {
        id: "existing",
        dateStr: "2026-07-08",
        color: "red",
        label: "記念日",
        createdBy: "user-1",
      },
    ],
    "2026-07-08",
    null,
    "user-1",
    () => "new-id"
  );

  assert.deepEqual(updated, [
    {
      id: "existing",
      dateStr: "2026-07-08",
      color: null,
      label: "記念日",
      createdBy: "user-1",
    },
  ]);
});

test("clearing a date label preserves an existing color", () => {
  const updated = applyDateLabelUpdate(
    [
      {
        id: "existing",
        dateStr: "2026-07-08",
        color: "blue",
        label: "予定",
        createdBy: "user-1",
      },
    ],
    "2026-07-08",
    null,
    "user-1",
    () => "new-id"
  );

  assert.deepEqual(updated, [
    {
      id: "existing",
      dateStr: "2026-07-08",
      color: "blue",
      label: null,
      createdBy: "user-1",
    },
  ]);
});

test("month todo matching is based on YYYY-MM string boundaries", () => {
  assert.equal(monthPrefix(2026, 7), "2026-07-");
  assert.equal(isTodoInMonth("2026-07-01", 2026, 7), true);
  assert.equal(isTodoInMonth("2026-07-31", 2026, 7), true);
  assert.equal(isTodoInMonth("2026-08-01", 2026, 7), false);
  assert.equal(isTodoInMonth("monthly", 2026, 7), false);
});

test("delete batching deduplicates todo IDs", () => {
  assert.deepEqual(uniqueTodoIds(["a", "b", "a", ""]), ["a", "b"]);
});
