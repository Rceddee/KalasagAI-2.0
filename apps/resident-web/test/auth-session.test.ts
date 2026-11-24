import assert from "node:assert/strict";
import test from "node:test";
import { isInvalidAuthSessionError } from "../src/lib/auth-session";

test("identifies rejected resident sessions", () => {
  assert.equal(isInvalidAuthSessionError({ status: 401 }), true);
  assert.equal(isInvalidAuthSessionError({ code: "refresh_token_not_found" }), true);
  assert.equal(isInvalidAuthSessionError({ code: "session_expired" }), true);
});

test("does not treat network or unrelated auth errors as expired sessions", () => {
  assert.equal(isInvalidAuthSessionError(new TypeError("fetch failed")), false);
  assert.equal(isInvalidAuthSessionError({ status: 503 }), false);
  assert.equal(isInvalidAuthSessionError({ status: 400, code: "validation_failed" }), false);
});
