import test from "node:test";
import assert from "node:assert/strict";
import { getActivityPresentation } from "../src/lib/activity-format";
import type { AuditLogRecord } from "../src/lib/types";

function entry(overrides: Partial<AuditLogRecord>): AuditLogRecord {
  return {
    id: 1,
    actor_id: null,
    action: "incident.status_changed",
    incident_id: "12345678-0000-0000-0000-000000000000",
    details: {},
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("activity presentation translates status events and avoids exposing full account IDs", () => {
  const event = getActivityPresentation(entry({
    actor_id: "abcdef12-0000-0000-0000-000000000000",
    details: { from: "pending", to: "in_progress" },
  }), "GB-2026-001");

  assert.equal(event.title, "Incident status updated");
  assert.equal(event.summary, "Status changed from Pending to In progress.");
  assert.equal(event.actor, "Unresolved account · ABCDEF12");
  assert.equal(event.incident, "Incident GB-2026-001");
  assert.deepEqual(event.details, ["Previous status: Pending", "New status: In progress"]);
  assert.equal(
    getActivityPresentation(
      entry({ actor_id: "abcdef12-0000-0000-0000-000000000000" }),
      undefined,
      "Maria Santos",
    ).actor,
    "Maria Santos",
  );
  assert.equal(
    getActivityPresentation(entry({
      actor_id: "abcdef12-0000-0000-0000-000000000000",
    })).actor,
    "Unresolved account · ABCDEF12",
  );
});

test("activity presentation explains automatic AI and system-setting events", () => {
  const aiEvent = getActivityPresentation(entry({
    action: "incident.ai_assessed",
    details: { source: "automatic_dispatch", priority: "high", model: "model-v1" },
  }));
  assert.equal(aiEvent.actor, "Automated AI service");
  assert.equal(aiEvent.summary, "The AI service automatically processed this incident.");
  assert.deepEqual(aiEvent.details, ["AI priority: High", "AI model: model-v1", "Source: Automatic system processing"]);

  const settingEvent = getActivityPresentation(entry({
    action: "system.setting_changed",
    incident_id: null,
    details: { key: "surge_mode", value: true },
  }));
  assert.equal(settingEvent.summary, "Surge mode was turned on.");
  assert.deepEqual(settingEvent.details, ["Setting: Surge mode", "New value: Enabled"]);
});
