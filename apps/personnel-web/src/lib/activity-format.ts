import type { AuditLogRecord } from "@/lib/types";

export type ActivityCategory =
  | "report"
  | "status"
  | "classification"
  | "ai"
  | "system"
  | "personnel"
  | "other";

export interface ActivityPresentation {
  category: ActivityCategory;
  categoryLabel: string;
  title: string;
  summary: string;
  actor: string;
  incident: string;
  details: string[];
}

const categoryLabels: Record<ActivityCategory, string> = {
  report: "Incident report",
  status: "Status update",
  classification: "Classification",
  ai: "AI processing",
  system: "System settings",
  personnel: "Personnel",
  other: "Other activity",
};

const actionLabels: Record<string, string> = {
  "incident.submitted": "Incident report submitted",
  "incident.status_changed": "Incident status updated",
  "incident.classification_reviewed": "Incident classification reviewed",
  "incident.ai_assessed": "AI assessment completed",
  "system.setting_changed": "System setting updated",
  "personnel.role_changed": "Personnel role changed",
};

const valueLabels: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
  fire: "Fire",
  flooding: "Flooding",
  road_accident: "Road accident",
  road_obstruction: "Road obstruction",
  medical_emergency: "Medical emergency",
  other: "Other",
  low: "Low",
  medium: "Medium",
  high: "High",
  resident: "Resident",
  responder: "Responder",
  communication_officer: "Communication officer",
  admin: "Admin",
  super_admin: "Super admin",
  surge_mode: "Surge mode",
  surge_threshold: "Surge threshold",
  gemini_enabled: "Gemini AI",
  automatic_dispatch: "Automatic system processing",
  user_request: "Staff request",
};

function getCategory(action: string): ActivityCategory {
  if (action === "incident.submitted") return "report";
  if (action === "incident.status_changed") return "status";
  if (action === "incident.classification_reviewed") return "classification";
  if (action === "incident.ai_assessed") return "ai";
  if (action === "system.setting_changed") return "system";
  if (action === "personnel.role_changed") return "personnel";
  return "other";
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return valueLabels[value] ?? value.replaceAll("_", " ");
  }
  if (value === null || value === undefined) return "Not set";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  return "Additional information recorded";
}

function shortAccountId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function buildSummary(entry: AuditLogRecord, category: ActivityCategory): string {
  const details = entry.details ?? {};
  switch (entry.action) {
    case "incident.submitted": {
      const reference = typeof details.reference === "string" ? details.reference : "";
      return reference
        ? `A new incident report was submitted as ${reference}.`
        : "A new incident report was submitted.";
    }
    case "incident.status_changed":
      return `Status changed from ${formatValue(details.from)} to ${formatValue(details.to)}.`;
    case "incident.classification_reviewed":
      return "Personnel reviewed and confirmed the incident classification.";
    case "incident.ai_assessed":
      return details.source === "automatic_dispatch"
        ? "The AI service automatically processed this incident."
        : "An AI assessment was requested and recorded.";
    case "system.setting_changed": {
      const key = typeof details.key === "string" ? details.key : "";
      const value = details.value;
      if (key === "surge_mode") {
        return `Surge mode was turned ${value === true ? "on" : "off"}.`;
      }
      if (key === "surge_threshold") {
        return `The surge alert threshold was set to ${formatValue(value)}%.`;
      }
      if (key === "gemini_enabled") {
        return `Gemini AI was turned ${value === true ? "on" : "off"}.`;
      }
      return `${formatValue(key)} was updated.`;
    }
    case "personnel.role_changed":
      return `A personnel role changed from ${formatValue(details.from)} to ${formatValue(details.to)}.`;
    default:
      return category === "other"
        ? `A ${entry.action.replace(/[._]/g, " ")} event was recorded.`
        : `${actionLabels[entry.action] ?? "Activity"} was recorded.`;
  }
}

function buildDetails(entry: AuditLogRecord): string[] {
  const details = entry.details ?? {};
  const lines: string[] = [];

  if (entry.action === "incident.submitted" && typeof details.reference === "string") {
    lines.push(`Report reference: ${details.reference}`);
  } else if (entry.action === "incident.status_changed") {
    lines.push(`Previous status: ${formatValue(details.from)}`);
    lines.push(`New status: ${formatValue(details.to)}`);
  } else if (entry.action === "incident.classification_reviewed") {
    if (details.category !== undefined) lines.push(`Confirmed category: ${formatValue(details.category)}`);
    if (details.priority !== undefined) lines.push(`Confirmed priority: ${formatValue(details.priority)}`);
  } else if (entry.action === "incident.ai_assessed") {
    if (details.priority !== undefined) lines.push(`AI priority: ${formatValue(details.priority)}`);
    if (typeof details.model === "string") lines.push(`AI model: ${details.model}`);
    if (details.source !== undefined) lines.push(`Source: ${formatValue(details.source)}`);
  } else if (entry.action === "system.setting_changed") {
    if (details.key !== undefined) lines.push(`Setting: ${formatValue(details.key)}`);
    if (details.value !== undefined) lines.push(`New value: ${formatValue(details.value)}`);
  } else if (entry.action === "personnel.role_changed") {
    if (typeof details.user_id === "string") {
      lines.push(`Target account: ${shortAccountId(details.user_id)}`);
    }
  } else {
    for (const [key, value] of Object.entries(details)) {
      if (value !== null && value !== undefined) {
        const label = key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
        lines.push(`${label}: ${formatValue(value)}`);
      }
    }
  }

  return lines;
}

export function getActivityPresentation(
  entry: AuditLogRecord,
  linkedReference?: string,
  linkedActorName?: string,
): ActivityPresentation {
  const category = getCategory(entry.action);
  const details = entry.details ?? {};
  const incidentId = entry.incident_id;
  const reference = linkedReference
    || (typeof details.reference === "string" ? details.reference : "");
  const incident = incidentId
    ? `Incident ${reference || `#${shortAccountId(incidentId)}`}`
    : "System-wide";
  const actor = entry.actor_id
    ? linkedActorName?.trim()
      || `Unresolved account · ${shortAccountId(entry.actor_id)}`
    : entry.action === "incident.ai_assessed" && details.source === "automatic_dispatch"
      ? "Automated AI service"
      : "System";

  return {
    category,
    categoryLabel: categoryLabels[category],
    title: actionLabels[entry.action] ?? entry.action.replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    summary: buildSummary(entry, category),
    actor,
    incident,
    details: buildDetails(entry),
  };
}

export function formatActivityTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}
