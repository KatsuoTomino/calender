import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTodoInMonth } from "../utils/todoDates.ts";
import {
  buildAvatarKey,
  buildTodoImageKey,
  canAccessR2Key,
  normalizeR2Key,
} from "../utils/r2Keys.ts";

test("month matching uses stored YYYY-MM-DD strings and ignores non-date task buckets", () => {
  assert.equal(isTodoInMonth({ dateStr: "2026-06-01" }, 2026, 6), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-06-30" }, 2026, 6), true);
  assert.equal(isTodoInMonth({ dateStr: "2026-07-01" }, 2026, 6), false);
  assert.equal(isTodoInMonth({ dateStr: "monthly" }, 2026, 6), false);
  assert.equal(isTodoInMonth({ dateStr: "important" }, 2026, 6), false);
});

test("R2 keys are generated in constrained namespaces", () => {
  assert.equal(buildTodoImageKey("abc123", "receipt.PNG", 12345), "todos/abc123/12345.png");
  assert.equal(buildAvatarKey("user-123", "me.webp"), "users/user-123/avatar.webp");
  assert.throws(() => buildTodoImageKey("../bad", "x.jpg", 1), /Invalid todo id/);
});

test("R2 access validation rejects traversal and cross-user avatars", () => {
  assert.equal(canAccessR2Key("todos/abc123/12345.jpg", "user-1"), true);
  assert.equal(canAccessR2Key("users/user-1/avatar.jpg", "user-1"), true);
  assert.equal(canAccessR2Key("users/user-2/avatar.jpg", "user-1"), false);
  assert.equal(canAccessR2Key("todos/abc123/../secret.jpg", "user-1"), false);
});

test("R2 URL normalization strips bucket prefix without accepting unsafe keys", () => {
  assert.equal(
    normalizeR2Key("https://example.com/my-bucket/todos/abc123/12345.jpg", "my-bucket"),
    "todos/abc123/12345.jpg"
  );
});

test("browser R2 service does not bundle server-only R2 credentials or AWS SDK", () => {
  const clientService = readFileSync(new URL("../services/r2Service.ts", import.meta.url), "utf8");

  assert.equal(clientService.includes("@aws-sdk"), false);
  assert.equal(clientService.includes("VITE_R2_"), false);
  assert.equal(clientService.includes("R2_SECRET_ACCESS_KEY"), false);
  assert.equal(clientService.includes("R2_ACCESS_KEY_ID"), false);
});
