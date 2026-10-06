import { Timestamp } from "firebase/firestore";

const CATEGORIES = new Set([
  "flooding",
  "fire incident",
  "road obstruction",
  "medical emergency",
  "other disaster-related incidents",
]);

const PRIORITIES = new Set(["High", "Medium", "Low"]);
const STATUSES = new Set(["Pending", "In Progress", "Resolved", "Closed"]);

export function buildPublicIncidentProjection(report) {
  const latitude = Number(report.latitude);
  const longitude = Number(report.longitude);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  let reportDate = report.report_date;
  if (reportDate && typeof reportDate.toDate !== "function") {
    const seconds = Number(reportDate.seconds);
    const nanoseconds = Number(reportDate.nanoseconds) || 0;
    if (Number.isFinite(seconds)) {
      reportDate = Timestamp.fromMillis(seconds * 1000 + nanoseconds / 1_000_000);
    } else {
      const parsedDate = new Date(reportDate);
      reportDate = Number.isNaN(parsedDate.getTime()) ? null : Timestamp.fromDate(parsedDate);
    }
  }
  if (!reportDate) {
    const createdAt = new Date(report.created_at || 0);
    reportDate = Timestamp.fromDate(
      Number.isNaN(createdAt.getTime()) || createdAt.getTime() === 0
        ? new Date()
        : createdAt
    );
  }

  const category = String(report.category || "").toLowerCase();
  const status = String(report.status || "");

  return {
    category: CATEGORIES.has(category) ? category : "other disaster-related incidents",
    secondary_category: report.secondary_category || null,
    priority_level: PRIORITIES.has(report.priority_level) ? report.priority_level : "Medium",
    incident_description: String(report.incident_description || ""),
    latitude,
    longitude,
    status: STATUSES.has(status) ? status : "Pending",
    report_date: reportDate,
    report_id: String(report.report_id || report.id || "REPORT"),
    blotter_id: String(report.blotter_id || report.id || "BLOTTER"),
    surge_mode: report.surge_mode === true,
  };
}
