"use client";

import { createContext, useContext } from "react";

/**
 * RBAC (Role-Based Access Control) Context
 * 
 * Roles:
 *   - Super Admin: Full access, including administration of staff roles.
 *   - Admin: Operational and personnel access, excluding Super Admin management.
 *   - Communication Officer: Can view all operational pages, update incident status/assignments, export data. No access to Admin Controls.
 *   - Responder: Can view Command Center and incident details. Read-only access to Blotters, Analytics, and Logs. No admin access.
 * 
 * This context is provided by DashboardLayout after successful authentication and personnel verification.
 */

const AuthContext = createContext({
  user: null,
  role: "",
});

export function AuthProvider({ user, role, children }) {
  return (
    <AuthContext.Provider value={{ user, role }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Permission helper — checks if the current role is allowed to perform an action.
 * 
 * Permission matrix:
 * ┌───────────────────────────┬───────┬────────────────────────┬───────────┐
 * │ Action                    │ Super Admin │ Admin │ Communication Officer │ Responder │
 * ├───────────────────────────┼─────────────┼───────┼───────────────────────┼───────────┤
 * │ view:command-center       │      ✅      │  ✅   │          ✅           │     ✅    │
 * │ view:blotters              │      ✅      │  ✅   │          ✅           │     ✅    │
 * │ view:analytics             │      ✅      │  ✅   │          ✅           │     ✅    │
 * │ view:logs                  │      ✅      │  ✅   │          ✅           │     ❌    │
 * │ view:admin                 │      ✅      │  ✅   │          ❌           │     ❌    │
 * │ manage:privileged-personnel│      ✅      │  ❌   │          ❌           │     ❌    │
 * └───────────────────────────┴───────┴────────────────────────┴───────────┘
 */
const PERMISSIONS = {
  "view:command-center":        ["Super Admin", "Admin", "Communication Officer", "Responder"],
  "view:blotters":              ["Super Admin", "Admin", "Communication Officer", "Responder"],
  "view:analytics":             ["Super Admin", "Admin", "Communication Officer", "Responder"],
  "view:ai-volume":             ["Super Admin", "Admin"],
  "manage:ai-controls":         ["Super Admin", "Admin"],
  "view:logs":                  ["Super Admin", "Admin", "Communication Officer"],
  "view:admin":                 ["Super Admin", "Admin"],
  "update:incident-status":     ["Super Admin", "Admin", "Communication Officer"],
  "update:incident-responder":  ["Super Admin", "Admin", "Communication Officer"],
  "export:csv":                 ["Super Admin", "Admin", "Communication Officer"],
  "export:pdf":                 ["Super Admin", "Admin", "Communication Officer"],
  "manage:personnel":           ["Super Admin", "Admin"],
  "manage:privileged-personnel":["Super Admin"],
  "manage:backup":              ["Super Admin", "Admin"],
  "send:password-reset":        ["Super Admin", "Admin"],
};

export function hasPermission(role, action) {
  const allowed = PERMISSIONS[action];
  if (!allowed) return false;
  return allowed.includes(role);
}
