/**
 * KalasagAI — Standardized Incident & Blotter Identification Helper
 * Standardizes IDs as human-friendly identifiers:
 * e.g., REPORT 01, REPORT 02, ... and BLOTTER 01, BLOTTER 02, ...
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
 * Derives a deterministic 1-based index from an incident or its array position
 * @param {object} incident 
 * @param {number} [index] 
 * @param {number} [total]
 * @returns {number}
 */
export function getSequentialNumber(incident, index = 0, total = 0) {
  if (typeof incident?.report_number === "number" && incident.report_number > 0) {
    return incident.report_number;
  }
  if (typeof incident?.sequence === "number" && incident.sequence > 0) {
    return incident.sequence;
  }
  // If we have total and index (when sorted newest first), index 0 is newest, or if reverse:
  if (total > 0 && typeof index === "number") {
    return total - index;
  }
  if (typeof index === "number" && index >= 0) {
    return index + 1;
  }
  // Fallback using simple numeric hash of ID if no index is provided
  if (incident?.id) {
    let hash = 0;
    for (let i = 0; i < incident.id.length; i++) {
      hash = (hash * 31 + incident.id.charCodeAt(i)) % 99;
    }
    return Math.abs(hash) + 1;
  }
  return 1;
}

/**
 * Format a human-friendly Report ID (e.g. REPORT 01)
 * @param {object} incident 
 * @param {number} [index] 
 * @param {number} [total]
 * @returns {string}
 */
export function formatReportId(incident, index, total) {
  if (!incident) return "REPORT 01";
  if (incident.report_id && typeof incident.report_id === "string" && incident.report_id.trim()) {
    // If it's already in REPORT XX format, return normalized
    const normalized = incident.report_id.trim().toUpperCase();
    if (normalized.startsWith("REPORT")) return normalized.replace("REPORT-", "REPORT ");
    return `REPORT ${normalized}`;
  }
  const seq = getSequentialNumber(incident, index, total);
  return `REPORT ${padNumber(seq)}`;
}

/**
 * Format a human-friendly Blotter ID (e.g. BLOTTER 01)
 * @param {object} incident 
 * @param {number} [index] 
 * @param {number} [total]
 * @returns {string}
 */
export function formatBlotterId(incident, index, total) {
  if (!incident) return "BLOTTER 01";
  if (incident.blotter_id && typeof incident.blotter_id === "string" && incident.blotter_id.trim()) {
    const normalized = incident.blotter_id.trim().toUpperCase();
    if (normalized.startsWith("BLOTTER")) return normalized.replace("BLOTTER-", "BLOTTER ");
    return `BLOTTER ${normalized}`;
  }
  const seq = getSequentialNumber(incident, index, total);
  return `BLOTTER ${padNumber(seq)}`;
}

/**
 * Check if a query matches an incident's Blotter ID, Report ID, or Raw ID
 * @param {object} incident 
 * @param {string} query 
 * @param {number} [index] 
 * @param {number} [total]
 * @returns {boolean}
 */
export function matchIncidentId(incident, query, index, total) {
  if (!query || !query.trim()) return true;
  const q = query.trim().toUpperCase();
  const rawId = (incident.id || "").toUpperCase();
  const reportId = formatReportId(incident, index, total).toUpperCase();
  const blotterId = formatBlotterId(incident, index, total).toUpperCase();

  // Direct exact/partial matches
  if (rawId.includes(q)) return true;
  if (reportId.includes(q)) return true;
  if (blotterId.includes(q)) return true;

  // Search by plain number, e.g. "01" or "1"
  const plainNumber = q.replace(/[^0-9]/g, "");
  if (plainNumber) {
    const seq = getSequentialNumber(incident, index, total);
    if (seq === parseInt(plainNumber, 10)) return true;
    if (padNumber(seq).includes(plainNumber)) return true;
  }

  return false;
}
