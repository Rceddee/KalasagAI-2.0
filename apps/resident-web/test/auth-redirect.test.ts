import assert from "node:assert/strict";
import test from "node:test";
import { getSafeAuthRedirectPath } from "../src/lib/auth-redirect";

test("keeps local auth callback destinations", () => {
  assert.equal(getSafeAuthRedirectPath("/reports?status=open#latest"), "/reports?status=open#latest");
});

test("rejects control characters before constructing a redirect URL", () => {
  for (const control of ["\t", "\r", "\n"]) {
    assert.equal(getSafeAuthRedirectPath(`/reports${control}/latest`), "/report");
  }
});

test("falls back to the report page for external or malformed destinations", () => {
  for (const next of [null, "", "https://example.com", "//example.com", "/\\example.com", "javascript:alert(1)"]) {
    assert.equal(getSafeAuthRedirectPath(next), "/report");
  }
});
