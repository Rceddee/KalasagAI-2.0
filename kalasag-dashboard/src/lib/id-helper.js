/**
 * KalasagAI — Standardized Incident & Blotter Identification Helper
 * Standardizes IDs as human-friendly identifiers:
 * e.g., REPORT 01, REPORT 02, ... and BLOTTER 01, BLOTTER 02, ...
 *
 * IDs are always read from the stored `report_id` / `blotter_id` fields
 * that are assigned atomically by `allocateReportNumbers()` in the mobile
 * app.  The old position-based fallback has been removed because it
 * produced unstable IDs that shifted whenever the list re-sorted.
 */

/**
 * Format a zero-padded sequential number
 * @param {number} num 
 * @param {number} padding 
 * @returns {string}
 */
export function padNumber(num, padding = 2) {
  return String(num).padStart(padding, "0");
}

/**
 * Extract the numeric part from a stored ID string.
 * e.g. "REPORT 03" → 3, "BLOTTER 12" → 12
 * Returns 0 when no number can be extracted.
 * @param {string} idString
 * @returns {number}
 */
export function extractIdNumber(idString) {
  if (!idString) return 0;
  const match = String(idString).match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Format a human-friendly Report ID (e.g. REPORT 01)
 * Always uses the stored `report_id` field from Firestore.
 * Falls back to a truncated document ID if the field is missing.
 * @param {object} incident 
 * @returns {string}
 */
export function formatReportId(incident) {
  if (!incident) return "REPORT --";
  if (incident.report_id && typeof incident.report_id === "string" && incident.report_id.trim()) {
    const normalized = incident.report_id.trim().toUpperCase();
    if (normalized.startsWith("REPORT")) return normalized.replace("REPORT-", "REPORT ");
    return `REPORT ${normalized}`;
  }
  // Fallback: show truncated Firestore doc ID so it's at least stable
  if (incident.id) {
    return `REPORT ${incident.id.slice(0, 6).toUpperCase()}`;
  }
  return "REPORT --";
}

/**
 * Format a human-friendly Blotter ID (e.g. BLOTTER 01)
 * Always uses the stored `blotter_id` field from Firestore.
 * Falls back to a truncated document ID if the field is missing.
 * @param {object} incident 
 * @returns {string}
 */
export function formatBlotterId(incident) {
  if (!incident) return "BLOTTER --";
  if (incident.blotter_id && typeof incident.blotter_id === "string" && incident.blotter_id.trim()) {
    const normalized = incident.blotter_id.trim().toUpperCase();
    if (normalized.startsWith("BLOTTER")) return normalized.replace("BLOTTER-", "BLOTTER ");
    return `BLOTTER ${normalized}`;
  }
  // Fallback: show truncated Firestore doc ID so it's at least stable
  if (incident.id) {
    return `BLOTTER ${incident.id.slice(0, 6).toUpperCase()}`;
  }
  return "BLOTTER --";
}

/**
 * Compare two incidents by their blotter/report ID number (numeric sort).
 * @param {object} a
 * @param {object} b
 * @param {boolean} ascending
 * @returns {number}
 */
export function compareByIdNumber(a, b, ascending = true) {
  const numA = extractIdNumber(a?.blotter_id || a?.report_id);
  const numB = extractIdNumber(b?.blotter_id || b?.report_id);
  return ascending ? numA - numB : numB - numA;
}

/**
 * Check if a query matches an incident's Blotter ID, Report ID, or Raw ID
 * @param {object} incident 
 * @param {string} query 
 * @returns {boolean}
 */
export function matchIncidentId(incident, query) {
  if (!query || !query.trim()) return true;
  const q = query.trim().toUpperCase();
  const rawId = (incident.id || "").toUpperCase();
  const reportId = formatReportId(incident).toUpperCase();
  const blotterId = formatBlotterId(incident).toUpperCase();

  // Direct exact/partial matches
  if (rawId.includes(q)) return true;
  if (reportId.includes(q)) return true;
  if (blotterId.includes(q)) return true;

  // Search by plain number, e.g. "01" or "1"
  const plainNumber = q.replace(/[^0-9]/g, "");
  if (plainNumber) {
    const idNum = extractIdNumber(incident.blotter_id || incident.report_id);
    if (idNum > 0) {
      if (idNum === parseInt(plainNumber, 10)) return true;
      if (padNumber(idNum).includes(plainNumber)) return true;
    }
  }

  return false;
}
