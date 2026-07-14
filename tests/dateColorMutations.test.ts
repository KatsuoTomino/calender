import assert from "node:assert/strict";
import test from "node:test";
import { clearDateColorField } from "../services/dateColorMutations.ts";

test("更新に失敗した場合はレコード削除を実行しない", async () => {
  const updateError = new Error("update failed");
  let cleanupCalls = 0;

  const result = await clearDateColorField(
    async () => ({ error: updateError }),
    async () => {
      cleanupCalls += 1;
      return { error: null };
    }
  );

  assert.deepEqual(result, {
    success: false,
    failedStep: "update",
    error: updateError,
  });
  assert.equal(cleanupCalls, 0);
});

test("更新成功後に空レコードの削除を実行する", async () => {
  let cleanupCalls = 0;

  const result = await clearDateColorField(
    async () => ({ error: null }),
    async () => {
      cleanupCalls += 1;
      return { error: null };
    }
  );

  assert.deepEqual(result, { success: true });
  assert.equal(cleanupCalls, 1);
});

test("空レコードの削除失敗を呼び出し元へ返す", async () => {
  const cleanupError = new Error("cleanup failed");

  const result = await clearDateColorField(
    async () => ({ error: null }),
    async () => ({ error: cleanupError })
  );

  assert.deepEqual(result, {
    success: false,
    failedStep: "cleanup",
    error: cleanupError,
  });
});
