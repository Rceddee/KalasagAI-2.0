import assert from "node:assert/strict";
import test from "node:test";
import {
  getIncidentEvidenceStoragePath,
  isDefinitiveSubmissionFailure,
} from "../src/lib/report-submission";

test("evidence object paths remain stable for an idempotency key", () => {
  const firstAttemptPath = getIncidentEvidenceStoragePath("resident-1", "attempt-1", "image/jpeg");
  const retryPath = getIncidentEvidenceStoragePath("resident-1", "attempt-1", "image/jpeg");

  assert.equal(firstAttemptPath, retryPath);
  assert.equal(firstAttemptPath, "resident-1/attempt-1/evidence.jpg");
  assert.equal(getIncidentEvidenceStoragePath("resident-1", "attempt-1", "image/png"), "resident-1/attempt-1/evidence.png");
});

test("only definite database rejections permit evidence cleanup", () => {
  assert.equal(isDefinitiveSubmissionFailure("22023"), true);
  assert.equal(isDefinitiveSubmissionFailure("42501"), true);
  assert.equal(isDefinitiveSubmissionFailure("PGRST116"), false);
  assert.equal(isDefinitiveSubmissionFailure("08006"), false);
  assert.equal(isDefinitiveSubmissionFailure("40003"), false);
});
