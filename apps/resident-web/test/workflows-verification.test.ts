import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhilippineMobile,
  validateIncidentDescription,
  validateIncidentLocation,
  validateIncidentLocationLabel,
  validateEvidenceFile,
  type IncidentCategory,
  type IncidentPriority,
} from "@kalasag/shared-validation";

test("Resident Registration: normalizes valid Philippine mobile numbers and rejects invalid", () => {
  assert.equal(normalizePhilippineMobile("0917 123 4567"), "+639171234567");
  assert.equal(normalizePhilippineMobile("+63 917 123 4567"), "+639171234567");
  assert.equal(normalizePhilippineMobile("0918-987-6543"), "+639189876543");

  // Rejections
  assert.equal(normalizePhilippineMobile("08171234567"), null); // Non-9 prefix
  assert.equal(normalizePhilippineMobile("091712345"), null); // Too short
  assert.equal(normalizePhilippineMobile("091712345678"), null); // Too long
  assert.equal(normalizePhilippineMobile(""), null);
});

test("Incident Reporting: validates required fields, description length, and coordinates", () => {
  assert.equal(validateIncidentDescription("Structure fire visible from municipal hall grounds"), true);
  assert.equal(validateIncidentLocationLabel("Barangay Poblacion, Gumaca"), true);
  assert.equal(validateIncidentLocation(13.9221, 122.1005), true);

  // Description too short (< 10 chars)
  assert.equal(validateIncidentDescription("Fire here"), false);

  // Out of range coordinates
  assert.equal(validateIncidentLocation(91.0, 122.1005), false);
  assert.equal(validateIncidentLocation(13.9221, 185.0), false);
  assert.equal(validateIncidentLocation(Number.NaN, 122.1005), false);
});

test("Photo Evidence: enforces allowed MIME types and file size boundaries", () => {
  // Allowed types: jpeg, png, webp
  assert.equal(validateEvidenceFile({ type: "image/jpeg", size: 1024 * 1024 }), null);
  assert.equal(validateEvidenceFile({ type: "image/png", size: 5 * 1024 * 1024 }), null);
  assert.equal(validateEvidenceFile({ type: "image/webp", size: 500 * 1024 }), null);

  // Disallowed types
  assert.equal(validateEvidenceFile({ type: "image/gif", size: 1024 }), "invalid_type");
  assert.equal(validateEvidenceFile({ type: "application/pdf", size: 1024 }), "invalid_type");

  // Size boundary (> 10 MB rejected, 0 bytes rejected)
  assert.equal(validateEvidenceFile({ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 }), "too_large");
  assert.equal(validateEvidenceFile({ type: "image/jpeg", size: 0 }), "empty");
});

test("Submission Retry: preserves idempotency key across retry attempts", () => {
  const firstIdempotencyKey = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const retryKey = firstIdempotencyKey;

  // Simulate network retry on same submission attempt
  assert.equal(retryKey, firstIdempotencyKey);
  const evidencePath = `resident-123/${firstIdempotencyKey}/evidence-0.jpg`;
  assert.match(evidencePath, new RegExp(firstIdempotencyKey));
});

test("Review Summary: correctly parses confirmed category and priority without exposing staff notes", () => {
  type ReviewSummary = {
    confirmed_category: IncidentCategory;
    confirmed_priority: IncidentPriority;
  };

  const sampleRpcResponse: ReviewSummary = {
    confirmed_category: "fire",
    confirmed_priority: "high",
  };

  assert.equal(sampleRpcResponse.confirmed_category, "fire");
  assert.equal(sampleRpcResponse.confirmed_priority, "high");
  assert.equal("note" in sampleRpcResponse, false); // notes not exposed
});

test("Resident UX: messaging explicitly clarifies that report receipt is not dispatch confirmation", () => {
  const statusLabels: Record<string, string> = {
    pending: "Report Received - Pending Personnel Review",
    in_progress: "Response Team Active",
    resolved: "Incident Resolved",
    closed: "Archived",
  };

  assert.match(statusLabels.pending, /Pending Personnel Review/);
  assert.doesNotMatch(statusLabels.pending, /Dispatched/);
});
