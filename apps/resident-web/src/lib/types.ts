import type { IncidentStatus } from "@kalasag/shared-validation";

export interface ResidentProfile {
  full_name: string;
  email: string;
  contact_number: string | null;
  role: string;
}

export interface ResidentIncident {
  id: string;
  reference: string;
  description: string;
  location_label: string;
  latitude: number;
  longitude: number;
  status: IncidentStatus;
  created_at: string;
}

export interface IncidentHistoryEntry {
  id: number;
  from_status: IncidentStatus | null;
  to_status: IncidentStatus;
  note: string | null;
  created_at: string;
}
