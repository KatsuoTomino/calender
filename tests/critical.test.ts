import assert from "node:assert/strict";
import test from "node:test";
import { applyDateColorUpdate, applyDateLabelUpdate } from "../utils/dateColors.ts";
import {
  assertAllowedR2ObjectKeyForUser,
  isAllowedR2ObjectKeyForUser,
  makeAvatarKey,
  makeTodoImageKey,
} from "../utils/r2Keys.ts";
import { getMonthDateRange, isDateStrInMonth } from "../utils/todoDates.ts";
import { DateColor } from "../types.ts";

test("R2 object key validation rejects traversal and cross-user avatar access", () => {
  const userId = "user-123";

  assert.equal(
    isAllowedR2ObjectKeyForUser("todos/todo-123/1700000000000.jpg", userId),
    true
  );
  assert.equal(
    isAllowedR2ObjectKeyForUser(`users/${userId}/avatar.png`, userId),
    true
  );
  assert.equal(
    isAllowedR2ObjectKeyForUser("users/other-user/avatar.png", userId),
    false
  );
  assert.equal(
    isAllowedR2ObjectKeyForUser("todos/todo-123/../secret.jpg", userId),
    false
  );
  assert.throws(() =>
    assertAllowedR2ObjectKeyForUser("https://example.com/../secret.jpg", userId)
  );
});

test("R2 key builders constrain file extensions and paths", () => {
  assert.equal(
    makeTodoImageKey("todo-1", "receipt.PNG", 1700000000000),
    "todos/todo-1/1700000000000.png"
  );
  assert.equal(makeAvatarKey("user-1", "avatar.svg"), "users/user-1/avatar.jpg");
});

test("month filtering is based on YYYY-MM-DD strings only", () => {
  assert.deepEqual(getMonthDateRange(2026, 2), {
    startDateStr: "2026-02-01",
    endDateStr: "2026-02-28",
  });
  assert.equal(isDateStrInMonth("2026-02-01", 2026, 2), true);
  assert.equal(isDateStrInMonth("2026-02-28", 2026, 2), true);
  assert.equal(isDateStrInMonth("2026-03-01", 2026, 2), false);
  assert.equal(isDateStrInMonth("monthly", 2026, 2), false);
});

test("clearing date color preserves an existing label", () => {
  const dateColors: DateColor[] = [
    {
      id: "date-color-1",
      dateStr: "2026-07-06",
      color: "red",
      label: "病院",
      createdBy: "user-1",
    },
  ];

  assert.deepEqual(
    applyDateColorUpdate(dateColors, "2026-07-06", null, "user-1", "new-id"),
    [
      {
        id: "date-color-1",
        dateStr: "2026-07-06",
        color: null,
        label: "病院",
        createdBy: "user-1",
      },
    ]
  );
});

test("clearing date label preserves an existing color", () => {
  const dateColors: DateColor[] = [
    {
      id: "date-color-1",
      dateStr: "2026-07-06",
      color: "blue",
      label: "旅行",
      createdBy: "user-1",
    },
  ];

  assert.deepEqual(
    applyDateLabelUpdate(dateColors, "2026-07-06", null, "user-1", "new-id"),
    [
      {
        id: "date-color-1",
        dateStr: "2026-07-06",
        color: "blue",
        label: null,
        createdBy: "user-1",
      },
    ]
  );
});
