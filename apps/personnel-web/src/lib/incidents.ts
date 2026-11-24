import type { SupabaseClient } from "@supabase/supabase-js";
import type { IncidentCategory, IncidentPriority, IncidentStatus } from "@kalasag/shared-validation";
import type { IncidentRecord } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";

interface IncidentRow {
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
}

interface AssessmentRow {
  suggested_category: IncidentCategory;
  suggested_priority: IncidentPriority;
}

interface ReviewRow {
  confirmed_category: IncidentCategory;
  confirmed_priority: IncidentPriority | null;
}

export async function fetchStaffIncidents(
  supabase: SupabaseClient = getSupabase(),
  incidentId?: string,
): Promise<IncidentRecord[]> {
  // Fetch the newest review and assessment per parent. Embedding avoids a long
  // list of UUIDs in the URL and preserves incidents that have no review yet.
  const records: IncidentRecord[] = [];
  let afterId: string | undefined;
  const pageSize = 250;
  for (;;) {
    let query = supabase.from("incidents")
      .select("id, reference, resident_id, description, location_label, latitude, longitude, status, created_at, updated_at, ai_assessments(suggested_category, suggested_priority), classification_reviews(confirmed_category, confirmed_priority)")
      .order("id")
      .limit(pageSize);
    for (const relation of ["ai_assessments", "classification_reviews"]) {
      query = query.order("created_at", { referencedTable: relation, ascending: false })
        .order("id", { referencedTable: relation, ascending: false })
        .limit(1, { referencedTable: relation });
    }
    if (incidentId) query = query.eq("id", incidentId);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) throw error;
    const page = data as (IncidentRow & {
      ai_assessments: AssessmentRow[];
      classification_reviews: ReviewRow[];
    })[];
    for (const { ai_assessments, classification_reviews, ...incident } of page) {
      const assessment = ai_assessments[0];
      const review = classification_reviews[0];
      records.push({
        ...incident,
        suggested_category: assessment?.suggested_category ?? null,
        suggested_priority: assessment?.suggested_priority ?? null,
        confirmed_category: review?.confirmed_category ?? null,
        confirmed_priority: review?.confirmed_priority ?? null,
        priority_level: review?.confirmed_priority ?? assessment?.suggested_priority ?? null,
      });
    }
    if (page.length < pageSize) break;
    afterId = page[page.length - 1].id;
  }
  return records.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function isMappedIncident(incident: IncidentRecord): boolean {
  return Number.isFinite(incident.latitude) &&
    Number.isFinite(incident.longitude) &&
    incident.latitude >= -90 && incident.latitude <= 90 &&
    incident.longitude >= -180 && incident.longitude <= 180;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function statusLabel(status: IncidentStatus): string {
  return ({ pending: "Pending", in_progress: "In progress", resolved: "Resolved", closed: "Closed" })[status];
}

export function categoryLabel(category: string | null): string {
  if (!category) return "Unclassified";
  return category.replaceAll("_", " ");
}

export function priorityLabel(priority: IncidentPriority | null): string {
  if (!priority) return "Pending";
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}
