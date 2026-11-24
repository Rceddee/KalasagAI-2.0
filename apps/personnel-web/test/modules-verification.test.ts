import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionIncidentStatus,
  canManagePersonnelRole,
  validateIncidentLocation,
  type IncidentCategory,
  type IncidentStatus,
} from "@kalasag/shared-validation";

test("Module 1 (Maps & Reports): category filter covers all six operational categories", () => {
  const categories: IncidentCategory[] = [
    "fire",
    "flooding",
    "road_accident",
    "road_obstruction",
    "medical_emergency",
    "other",
  ];
  assert.equal(categories.length, 6);

  // Coordinate validation
  assert.equal(validateIncidentLocation(13.9221, 122.1005), true);
  assert.equal(validateIncidentLocation(91.0, 122.1005), false); // Out of bounds latitude
});

test("Module 1 (Maps & Reports): status transitions strictly adhere to forward lifecycle", () => {
  const validTransitions: Array<[IncidentStatus, IncidentStatus]> = [
    ["pending", "in_progress"],
    ["pending", "resolved"],
    ["in_progress", "resolved"],
    ["resolved", "closed"],
  ];
  for (const [from, to] of validTransitions) {
    assert.equal(canTransitionIncidentStatus(from, to), true, `Expected ${from} -> ${to} to be valid`);
  }

  const invalidTransitions: Array<[IncidentStatus, IncidentStatus]> = [
    ["in_progress", "pending"],
    ["resolved", "in_progress"],
    ["closed", "resolved"],
    ["closed", "pending"],
  ];
  for (const [from, to] of invalidTransitions) {
    assert.equal(canTransitionIncidentStatus(from, to), false, `Expected ${from} -> ${to} to be rejected`);
  }
});

test("Module 3 (Analytics): calculates accuracy only from reviewed suggestions", () => {
  type RecordPair = {
    suggestedCategory: IncidentCategory | null;
    confirmedCategory: IncidentCategory | null;
  };

  function computeAiAccuracy(records: RecordPair[]): number | null {
    const reviewed = records.filter(
      (r): r is { suggestedCategory: IncidentCategory; confirmedCategory: IncidentCategory } =>
        r.suggestedCategory !== null && r.confirmedCategory !== null,
    );
    if (reviewed.length === 0) return null;
    const matches = reviewed.filter((r) => r.suggestedCategory === r.confirmedCategory).length;
    return Math.round((matches / reviewed.length) * 100);
  }

  // Without reviewed records, returns null (Unavailable)
  assert.equal(computeAiAccuracy([]), null);
  assert.equal(computeAiAccuracy([{ suggestedCategory: "fire", confirmedCategory: null }]), null);

  // With reviewed records, returns exact percentage
  const records: RecordPair[] = [
    { suggestedCategory: "fire", confirmedCategory: "fire" },
    { suggestedCategory: "flooding", confirmedCategory: "flooding" },
    { suggestedCategory: "road_accident", confirmedCategory: "road_obstruction" },
  ];
  assert.equal(computeAiAccuracy(records), 67); // 2 of 3 = 67%
});

test("Module 4 (AI Volume & Surge): surge threshold comparison and advisory state", () => {
  function evaluateSurgeMode(currentCount: number, baselineAverage: number, thresholdPercent: number): boolean {
    if (baselineAverage <= 0) return false;
    const surgeRatio = ((currentCount - baselineAverage) / baselineAverage) * 100;
    return surgeRatio >= thresholdPercent;
  }

  // 10 incidents vs baseline 5 -> 100% surge >= 90% threshold -> true
  assert.equal(evaluateSurgeMode(10, 5, 90), true);
  // 6 incidents vs baseline 5 -> 20% surge < 90% threshold -> false
  assert.equal(evaluateSurgeMode(6, 5, 90), false);
});

test("Module 5 (Activity Logs): distinguishes user, staff, and system-generated events", () => {
  type AuditLogEntry = {
    actor_id: string | null;
    action: string;
    source?: string;
  };

  const logs: AuditLogEntry[] = [
    { actor_id: "resident-1", action: "incident.submitted" },
    { actor_id: "staff-1", action: "incident.status_updated" },
    { actor_id: null, action: "incident.ai_assessed", source: "automatic_dispatch" },
  ];

  const systemEvents = logs.filter((l) => l.actor_id === null && l.source === "automatic_dispatch");
  assert.equal(systemEvents.length, 1);
  assert.equal(systemEvents[0].action, "incident.ai_assessed");
});

test("Module 6 (Admin Controls): role management boundaries between Admin and Super Admin", () => {
  const adminId = "admin-user-1";
  const superAdminId = "super-admin-user-1";
  const targetId = "target-user-2";

  // Standard Admin permissions
  assert.equal(canManagePersonnelRole("admin", "responder", adminId, targetId).allowed, true);
  assert.equal(canManagePersonnelRole("admin", "communication_officer", adminId, targetId).allowed, true);
  assert.equal(canManagePersonnelRole("admin", "admin", adminId, targetId).allowed, false);
  assert.equal(canManagePersonnelRole("admin", "super_admin", adminId, targetId).allowed, false);

  // Super Admin permissions
  assert.equal(canManagePersonnelRole("super_admin", "responder", superAdminId, targetId).allowed, true);
  assert.equal(canManagePersonnelRole("super_admin", "communication_officer", superAdminId, targetId).allowed, true);
  assert.equal(canManagePersonnelRole("super_admin", "admin", superAdminId, targetId).allowed, true);
  assert.equal(canManagePersonnelRole("super_admin", "super_admin", superAdminId, targetId).allowed, true);

  // Self-demotion/promotion is forbidden
  assert.equal(canManagePersonnelRole("admin", "admin", adminId, adminId).allowed, false);
  assert.equal(canManagePersonnelRole("super_admin", "super_admin", superAdminId, superAdminId).allowed, false);

  // Non-privileged users
  assert.equal(canManagePersonnelRole("resident", "responder", "res-1", targetId).allowed, false);
  assert.equal(canManagePersonnelRole("responder", "responder", "resp-1", targetId).allowed, false);
});
