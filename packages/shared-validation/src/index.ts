export type IncidentCategory =
  | "fire"
  | "flooding"
  | "road_accident"
  | "road_obstruction"
  | "medical_emergency"
  | "other";

export type IncidentStatus = "pending" | "in_progress" | "resolved" | "closed";

export type IncidentPriority = "low" | "medium" | "high";

export type EvidenceValidationError = "invalid_type" | "too_large" | "empty";

const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/pjpeg",
  "image/x-png",
  "image/jfif",
]);
export const MAX_EVIDENCE_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 5;

export function normalizePhilippineMobile(input: string): string | null {
  const value = input.trim().replace(/[\s()-]/g, "");
  if (/^09\d{9}$/.test(value)) {
    return `+63${value.slice(1)}`;
  }
  return /^\+639\d{9}$/.test(value) ? value : null;
}

export function validateIncidentDescription(input: string): boolean {
  const value = input.trim();
  return value.length >= 10 && value.length <= 2000;
}

export function validateIncidentLocation(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function validateIncidentLocationLabel(input: string): boolean {
  const value = input.trim();
  return value.length >= 2 && value.length <= 250;
}

export function validateEvidenceFile(file: Pick<File, "type" | "size"> & { name?: string }): EvidenceValidationError | null {
  const hasValidType = file.type ? allowedImageTypes.has(file.type.toLowerCase()) : false;
  const hasValidExtension = file.name
    ? /\.(jpe?g|png|webp|jfif)$/i.test(file.name)
    : false;

  if (!hasValidType && !hasValidExtension) return "invalid_type";
  if (file.size < 1) return "empty";
  if (file.size > MAX_EVIDENCE_FILE_SIZE) return "too_large";
  return null;
}

export function canTransitionIncidentStatus(
  current: IncidentStatus,
  next: IncidentStatus,
): boolean {
  return (
    (current === "pending" && (next === "in_progress" || next === "resolved")) ||
    (current === "in_progress" && next === "resolved") ||
    (current === "resolved" && next === "closed")
  );
}

export type PersonnelRole =
  | "resident"
  | "responder"
  | "communication_officer"
  | "admin"
  | "super_admin";

export interface RoleManagementResult {
  allowed: boolean;
  reason?: string;
}

export function canManagePersonnelRole(
  actorRole: PersonnelRole | null | undefined,
  targetRole: PersonnelRole,
  actorId: string | null | undefined,
  targetUserId: string,
): RoleManagementResult {
  if (!actorRole || (actorRole !== "admin" && actorRole !== "super_admin")) {
    return { allowed: false, reason: "Not authorized to manage personnel roles" };
  }
  if (actorId && actorId === targetUserId) {
    return { allowed: false, reason: "Personnel cannot change their own role" };
  }
  if (targetRole === "resident") {
    return { allowed: false, reason: "Personnel management cannot demote to resident role" };
  }
  if (actorRole !== "super_admin" && (targetRole === "admin" || targetRole === "super_admin")) {
    return { allowed: false, reason: "Only a super admin can manage privileged personnel" };
  }
  return { allowed: true };
}

export interface BootstrapEligibilityInput {
  email: string;
  appMetadata?: Record<string, unknown> | null;
  existingSuperAdminCount: number;
}

export function validateBootstrapEligibility(
  input: BootstrapEligibilityInput,
  expectedEmail: string,
): { eligible: boolean; error?: string } {
  if (input.existingSuperAdminCount > 0) {
    return { eligible: false, error: "Bootstrap is already completed: a Super Admin already exists" };
  }
  if (!input.email || input.email.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) {
    return { eligible: false, error: "Email mismatch: user does not match designated bootstrap administrator" };
  }
  const appMeta = input.appMetadata || {};
  if (
    appMeta.account_type !== "personnel" ||
    appMeta.personnel_role !== "super_admin" ||
    appMeta.bootstrap_source !== "kalasagai-dev-initial-super-admin-v1"
  ) {
    return { eligible: false, error: "Untrusted metadata: user lacks required personnel super_admin claims" };
  }
  return { eligible: true };
}
