import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLatestWriteQueue,
  type LatestWriteResult,
} from "../utils/latestWriteQueue.ts";

test("same-turn toggles persist only the latest value", async () => {
  const writes: boolean[] = [];
  const queue = createLatestWriteQueue<boolean>(async (_key, value) => {
    writes.push(value);
    return true;
  });

  const first = queue("habit-1|2026-09-24", true);
  const second = queue("habit-1|2026-09-24", false);
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult, "superseded");
  assert.equal(secondResult, "applied");
  assert.deepEqual(writes, [false]);
});

test("an in-flight check cannot outrun a later uncheck", async () => {
  const writes: boolean[] = [];
  let releaseFirst: () => void = () => {};
  const firstStarted = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let releaseWrite: () => void = () => {};
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });

  const queue = createLatestWriteQueue<boolean>(async (_key, value) => {
    writes.push(value);
    if (writes.length === 1) {
      releaseFirst();
      await writeGate;
    }
    return true;
  });

  const checking = queue("habit-1|2026-09-24", true);
  await firstStarted;
  const unchecking = queue("habit-1|2026-09-24", false);
  releaseWrite();

  const [checkResult, uncheckResult] = await Promise.all([
    checking,
    unchecking,
  ]);

  assert.equal(checkResult, "superseded");
  assert.equal(uncheckResult, "applied");
  assert.deepEqual(writes, [true, false]);
});

test("different keys run independently", async () => {
  const order: string[] = [];
  let releaseA: () => void = () => {};
  const gateA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });

  const queue = createLatestWriteQueue<boolean>(async (key) => {
    if (key === "a") await gateA;
    order.push(key);
    return true;
  });

  const pendingA = queue("a", true);
  const pendingB = queue("b", true);
  const resultB = await pendingB;
  assert.equal(resultB, "applied");
  assert.deepEqual(order, ["b"]);

  releaseA();
  const resultA = await pendingA;
  assert.equal(resultA, "applied");
  assert.deepEqual(order, ["b", "a"]);
});

test("a failed write does not stall later writes for the same key", async () => {
  const writes: boolean[] = [];
  let failNext = true;
  const queue = createLatestWriteQueue<boolean>(async (_key, value) => {
    writes.push(value);
    if (failNext) {
      failNext = false;
      return false;
    }
    return true;
  });

  const failed = await queue("habit-1", true);
  const applied = await queue("habit-1", false);

  assert.equal(failed, "failed");
  assert.equal(applied, "applied");
  assert.deepEqual(writes, [true, false]);
});

test("a thrown write is a failure and the queue stays usable", async () => {
  let throwNext = true;
  const queue = createLatestWriteQueue<boolean>(async () => {
    if (throwNext) {
      throwNext = false;
      throw new Error("network");
    }
    return true;
  });

  const results: LatestWriteResult[] = [];
  results.push(await queue("habit-1", true));
  results.push(await queue("habit-1", false));
  assert.deepEqual(results, ["failed", "applied"]);
});
