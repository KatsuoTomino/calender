import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planLinkedTodoDelete } from "../utils/linkedTodoDelete.ts";

describe("planLinkedTodoDelete", () => {
  it("requires Google access and defers Calendar delete when both are requested", () => {
    const plan = planLinkedTodoDelete({
      alsoDeleteFromGoogle: true,
      hasGoogleEvent: true,
    });
    assert.equal(plan.requireGoogleAccess, true);
    assert.equal(plan.deleteGoogleEvent, true);
    assert.equal(plan.clearLinkOnly, false);
  });

  it("does not touch Google when the user chose app-only delete", () => {
    const plan = planLinkedTodoDelete({
      alsoDeleteFromGoogle: false,
      hasGoogleEvent: true,
    });
    assert.equal(plan.requireGoogleAccess, false);
    assert.equal(plan.deleteGoogleEvent, false);
    assert.equal(plan.clearLinkOnly, true);
  });

  it("does not call Calendar API when the todo has no event id", () => {
    const plan = planLinkedTodoDelete({
      alsoDeleteFromGoogle: true,
      hasGoogleEvent: false,
    });
    assert.equal(plan.requireGoogleAccess, false);
    assert.equal(plan.deleteGoogleEvent, false);
    assert.equal(plan.clearLinkOnly, true);
  });
});
