import assert from "node:assert/strict";
import test from "node:test";
import { mutateThenCleanup } from "../utils/mutationCleanup.ts";
import { isTodoInMonth, monthDateRange } from "../utils/todoDates.ts";

test("failed durable mutation never runs irreversible cleanup", async () => {
  const calls: string[] = [];

  const succeeded = await mutateThenCleanup(
    async () => {
      calls.push("mutation");
      return false;
    },
    async () => {
      calls.push("cleanup");
    }
  );

  assert.equal(succeeded, false);
  assert.deepEqual(calls, ["mutation"]);
});

test("successful durable mutation runs cleanup afterwards", async () => {
  const calls: string[] = [];

  const succeeded = await mutateThenCleanup(
    async () => {
      calls.push("mutation");
      return true;
    },
    async () => {
      calls.push("cleanup");
    }
  );

  assert.equal(succeeded, true);
  assert.deepEqual(calls, ["mutation", "cleanup"]);
});

test("month deletion selects only the confirmed calendar month", () => {
  assert.deepEqual(monthDateRange(2028, 2), {
    startDateStr: "2028-02-01",
    endDateStr: "2028-02-29",
  });
  assert.equal(isTodoInMonth({ dateStr: "2028-02-29" }, 2028, 2), true);
  assert.equal(isTodoInMonth({ dateStr: "2028-03-01" }, 2028, 2), false);
  assert.equal(isTodoInMonth({ dateStr: "monthly" }, 2028, 2), false);
});
