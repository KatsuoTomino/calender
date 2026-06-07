import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isDateStrInMonth } from "../utils/todoDates.ts";

test("month matching uses YYYY-MM-DD strings instead of timezone-sensitive Date parsing", () => {
  assert.equal(isDateStrInMonth("2024-02-29", 2024, 2), true);
  assert.equal(isDateStrInMonth("2024-03-01", 2024, 2), false);
  assert.equal(isDateStrInMonth("2024-03-31", 2024, 3), true);
  assert.equal(isDateStrInMonth("important", 2024, 3), false);
});

test("browser R2 service does not import AWS SDK or VITE_R2 secrets", async () => {
  const clientSource = await readFile("services/r2Service.ts", "utf8");

  assert.equal(clientSource.includes("@aws-sdk/"), false);
  assert.equal(clientSource.includes("VITE_R2_"), false);
  assert.equal(clientSource.includes("R2_SECRET_ACCESS_KEY"), false);
});

test("R2 credentials are only referenced by the server API", async () => {
  const apiSource = await readFile("api/r2.ts", "utf8");

  assert.equal(apiSource.includes("process.env.R2_SECRET_ACCESS_KEY"), true);
  assert.equal(apiSource.includes("process.env.VITE_R2_SECRET_ACCESS_KEY"), false);
});
