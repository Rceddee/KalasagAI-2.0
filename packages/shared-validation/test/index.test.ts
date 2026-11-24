import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionIncidentStatus,
  normalizePhilippineMobile,
  validateEvidenceFile,
  validateIncidentDescription,
  validateIncidentLocation,
  validateIncidentLocationLabel,
} from "../src/index.ts";

test("normalizes Philippine mobile numbers and rejects unsupported formats", () => {
  assert.equal(normalizePhilippineMobile("09171234567"), "+639171234567");
  assert.equal(normalizePhilippineMobile("+639171234567"), "+639171234567");
  assert.equal(normalizePhilippineMobile("09 171-234-567"), "+639171234567");
  assert.equal(normalizePhilippineMobile("639171234567"), null);
  assert.equal(normalizePhilippineMobile("0917123456"), null);
});

test("validates meaningful incident descriptions and real coordinate ranges", () => {
  assert.equal(validateIncidentDescription("  May sunog sa palengke  "), true);
  assert.equal(validateIncidentDescription("short"), false);
  assert.equal(validateIncidentDescription("x".repeat(2001)), false);
  assert.equal(validateIncidentLocation(13.9, 122.1), true);
  assert.equal(validateIncidentLocation(40.7128, -74.006), true);
  assert.equal(validateIncidentLocation(Number.NaN, 122.1), false);
  assert.equal(validateIncidentLocation(91, 122.1), false);
  assert.equal(validateIncidentLocationLabel("  Main Street  "), true);
  assert.equal(validateIncidentLocationLabel("x"), false);
  assert.equal(validateIncidentLocationLabel("x".repeat(251)), false);
});

test("enforces evidence type and size limits", () => {
  assert.equal(validateEvidenceFile({ type: "image/jpeg", size: 1024 }), null);
  assert.equal(validateEvidenceFile({ type: "image/jpg", size: 1024 }), null);
  assert.equal(validateEvidenceFile({ type: "image/png", size: 1024 }), null);
  assert.equal(validateEvidenceFile({ type: "image/webp", size: 1024 }), null);
  assert.equal(validateEvidenceFile({ type: "", name: "emergency.jpg", size: 1024 }), null);
  assert.equal(validateEvidenceFile({ type: "application/octet-stream", name: "scene.PNG", size: 1024 }), null);
  assert.equal(validateEvidenceFile({ type: "application/pdf", size: 1024 }), "invalid_type");
  assert.equal(validateEvidenceFile({ type: "image/gif", size: 1024 }), "invalid_type");
  assert.equal(validateEvidenceFile({ type: "image/png", size: 0 }), "empty");
  assert.equal(validateEvidenceFile({ type: "image/webp", size: 10 * 1024 * 1024 + 1 }), "too_large");
});

test("allows only forward incident status transitions", () => {
  assert.equal(canTransitionIncidentStatus("pending", "in_progress"), true);
  assert.equal(canTransitionIncidentStatus("in_progress", "resolved"), true);
  assert.equal(canTransitionIncidentStatus("resolved", "closed"), true);
  assert.equal(canTransitionIncidentStatus("closed", "pending"), false);
  assert.equal(canTransitionIncidentStatus("resolved", "in_progress"), false);
});
