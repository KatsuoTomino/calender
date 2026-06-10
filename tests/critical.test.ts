import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildAvatarImageKey,
  buildTodoImageKey,
  normalizeR2Key,
} from "../utils/r2Keys.ts";
import {
  getMonthDateBounds,
  isDateInMonth,
} from "../utils/todoDates.ts";

test("R2 client service does not expose server credentials", () => {
  const clientService = readFileSync(new URL("../services/r2Service.ts", import.meta.url), "utf8");

  assert.equal(clientService.includes("@aws-sdk/"), false);
  assert.equal(clientService.includes("VITE_R2_"), false);
  assert.equal(clientService.includes("SECRET_ACCESS_KEY"), false);
});

test("R2 API keeps storage operations on the server side", () => {
  const api = readFileSync(new URL("../api/r2.ts", import.meta.url), "utf8");

  assert.match(api, /R2_SECRET_ACCESS_KEY/);
  assert.match(api, /getUser\(jwt\)/);
});

test("R2 keys are normalized and constrained to app-owned prefixes", () => {
  assert.equal(buildTodoImageKey("todo-1", "receipt.PNG", 123), "todos/todo-1/123.png");
  assert.equal(buildAvatarImageKey("user-1", "me.webp"), "users/user-1/avatar.webp");
  assert.equal(
    normalizeR2Key("https://example.com/kizuna/todos/todo-1/123.png", "kizuna"),
    "todos/todo-1/123.png"
  );
  assert.equal(normalizeR2Key("https://example.com/other/file.png", "kizuna"), null);
  assert.equal(normalizeR2Key("../secrets.txt", "kizuna"), null);
});

test("month deletion bounds only match concrete day todos in the selected month", () => {
  assert.deepEqual(getMonthDateBounds(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
  });
  assert.equal(isDateInMonth("2026-02-01", 2026, 2), true);
  assert.equal(isDateInMonth("2026-02-28", 2026, 2), true);
  assert.equal(isDateInMonth("2026-03-01", 2026, 2), false);
  assert.equal(isDateInMonth("monthly", 2026, 2), false);
  assert.equal(isDateInMonth("2026-02", 2026, 2), false);
});
