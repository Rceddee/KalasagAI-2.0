import type { IncidentCategory, IncidentPriority, IncidentStatus } from "@kalasag/shared-validation";

export type PersonnelRole =
  | "resident"
  | "responder"
  | "communication_officer"
  | "admin"
  | "super_admin";

export interface PersonnelProfile {
  full_name: string;
  role: PersonnelRole;
}

export interface IncidentRecord {
  id: string;
  reference: string;
  resident_id: string;
  description: string;
  location_label: string;
  latitude: number;
  longitude: number;
  status: IncidentStatus;
  created_at: string;
  updated_at: string;
  suggested_category: IncidentCategory | null;
  suggested_priority: IncidentPriority | null;
  confirmed_category: IncidentCategory | null;
  confirmed_priority: IncidentPriority | null;
  priority_level: IncidentPriority | null;
}

export interface IncidentMapRecord extends IncidentRecord {
  category: IncidentCategory;
  report_date: string;
  report_id: string;
  blotter_id: string;
  incident_description: string;
  reporter_name?: string;
  contact_number?: string | null;
  profiles?: { full_name: string | null };
}

export interface BlotterPdfRecord extends IncidentRecord {
  category?: string | null;
  ai_reasoning?: string | null;
  rationale?: string | null;
  reporter_name?: string | null;
  reporter_contact?: string | null;
}

export interface StatusHistoryRecord {
  id: number;
  incident_id: string;
  from_status: IncidentStatus | null;
  to_status: IncidentStatus;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}

export interface AuditLogRecord {
  id: number;
  actor_id: string | null;
  action: string;
  incident_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}
