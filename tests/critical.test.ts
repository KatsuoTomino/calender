import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractR2Key, isValidR2Key } from "../utils/r2Keys.ts";
import { getMonthDateRange, isDateStrInMonth } from "../utils/todoDates.ts";

test("month ranges are stable YYYY-MM-DD string bounds", () => {
  assert.deepEqual(getMonthDateRange(2024, 2), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.equal(isDateStrInMonth("2024-02-29", 2024, 2), true);
  assert.equal(isDateStrInMonth("2024-03-01", 2024, 2), false);
  assert.equal(isDateStrInMonth("monthly", 2024, 2), false);
});

test("R2 key extraction keeps only object keys", () => {
  assert.equal(
    extractR2Key("https://example.com/my-bucket/todos/todo-1/123.jpg"),
    "todos/todo-1/123.jpg"
  );
  assert.equal(
    extractR2Key("https://example.com/users/user-1/avatar.png"),
    "users/user-1/avatar.png"
  );
  assert.equal(extractR2Key("todos/todo-1/123.jpg"), "todos/todo-1/123.jpg");
});

test("R2 key validation rejects traversal and unsupported prefixes", () => {
  assert.equal(isValidR2Key("todos/todo_1/123-abc.jpg"), true);
  assert.equal(isValidR2Key("users/user-1/avatar.webp"), true);
  assert.equal(isValidR2Key("todos/../secret.txt"), false);
  assert.equal(isValidR2Key("private/secret.txt"), false);
});

test("client R2 service does not expose server-only R2 credentials", () => {
  const clientService = readFileSync("services/r2Service.ts", "utf8");
  assert.equal(clientService.includes("@aws-sdk/"), false);
  assert.equal(clientService.includes("VITE_R2_"), false);
  assert.equal(clientService.includes("R2_SECRET_ACCESS_KEY"), false);
});

test("Vercel SPA rewrite leaves API routes available", () => {
  const vercelConfig = readFileSync("vercel.json", "utf8");
  assert.match(vercelConfig, /\(\?!api\/\)/);
  assert.doesNotMatch(vercelConfig, /"source":\s*"\/\(\.\*\)"/);
});
