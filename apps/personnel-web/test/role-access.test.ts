import test from "node:test";
import assert from "node:assert/strict";
import { canAccessAdminModules } from "../src/lib/role-access";
import type { PersonnelRole } from "../src/lib/types";

test("only admins and super admins can access administrative modules", () => {
  const allowed: PersonnelRole[] = ["admin", "super_admin"];
  const denied: PersonnelRole[] = ["resident", "responder", "communication_officer"];

  for (const role of allowed) assert.equal(canAccessAdminModules(role), true);
  for (const role of denied) assert.equal(canAccessAdminModules(role), false);
});
