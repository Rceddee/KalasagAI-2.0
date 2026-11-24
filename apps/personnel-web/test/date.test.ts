import assert from "node:assert/strict";
import test from "node:test";
import { manilaDateKey } from "../src/lib/date";

test("incident date filters use the displayed Philippine calendar date", () => {
  assert.equal(manilaDateKey("2026-11-10T18:00:00.000Z"), "2026-11-11");
  assert.equal(manilaDateKey("2026-11-11T15:59:59.000Z"), "2026-11-11");
});
