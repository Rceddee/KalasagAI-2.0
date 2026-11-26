import type { PersonnelRole } from "@/lib/types";

export function canAccessAdminModules(role: PersonnelRole): boolean {
  return role === "admin" || role === "super_admin";
}

export function canManageIncidents(role: PersonnelRole): boolean {
  return role === "communication_officer" || canAccessAdminModules(role);
}
