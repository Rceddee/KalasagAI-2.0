import assert from "node:assert/strict";
import test from "node:test";
import {
  canManagePersonnelRole,
  validateBootstrapEligibility,
  normalizePhilippineMobile,
} from "../src/index.ts";

test("ordinary resident cannot acquire personnel or Super Admin privileges", () => {
  const residentId = "resident-uuid-1234";
  const targetId = "target-uuid-5678";

  // Resident attempting to promote themselves or anyone else
  const selfPromote = canManagePersonnelRole("resident", "super_admin", residentId, residentId);
  assert.equal(selfPromote.allowed, false);
  assert.match(selfPromote.reason || "", /Not authorized/);

  const promoteOther = canManagePersonnelRole("resident", "responder", residentId, targetId);
  assert.equal(promoteOther.allowed, false);
  assert.match(promoteOther.reason || "", /Not authorized/);

  // Unauthenticated actor
  const unauth = canManagePersonnelRole(null, "super_admin", null, targetId);
  assert.equal(unauth.allowed, false);
});

test("personnel cannot escalate their own role", () => {
  const adminId = "admin-uuid-1234";
  const result = canManagePersonnelRole("admin", "super_admin", adminId, adminId);
  assert.equal(result.allowed, false);
  assert.match(result.reason || "", /cannot change their own role/);
});

test("standard admin cannot promote to admin or super_admin", () => {
  const adminId = "admin-uuid-1234";
  const targetId = "target-uuid-5678";

  const promoteToAdmin = canManagePersonnelRole("admin", "admin", adminId, targetId);
  assert.equal(promoteToAdmin.allowed, false);
  assert.match(promoteToAdmin.reason || "", /Only a super admin can manage privileged personnel/);

  const promoteToSuperAdmin = canManagePersonnelRole("admin", "super_admin", adminId, targetId);
  assert.equal(promoteToSuperAdmin.allowed, false);
  assert.match(promoteToSuperAdmin.reason || "", /Only a super admin can manage privileged personnel/);
});

test("super admin can manage responder and communication officer roles", () => {
  const superAdminId = "super-admin-uuid-1234";
  const targetId = "target-uuid-5678";

  const result = canManagePersonnelRole("super_admin", "communication_officer", superAdminId, targetId);
  assert.equal(result.allowed, true);
});

test("bootstrap eligibility strictly enforces one-time execution and trusted claims", () => {
  const designatedEmail = "cedrickvidal23@gmail.com";

  // Valid development bootstrap
  const validBootstrap = validateBootstrapEligibility(
    {
      email: designatedEmail,
      appMetadata: {
        account_type: "personnel",
        personnel_role: "super_admin",
        bootstrap_source: "kalasagai-dev-initial-super-admin-v1",
      },
      existingSuperAdminCount: 0,
    },
    designatedEmail,
  );
  assert.equal(validBootstrap.eligible, true);

  // Rejected: Bootstrap already executed (super admin exists)
  const duplicateBootstrap = validateBootstrapEligibility(
    {
      email: designatedEmail,
      appMetadata: {
        account_type: "personnel",
        personnel_role: "super_admin",
        bootstrap_source: "kalasagai-dev-initial-super-admin-v1",
      },
      existingSuperAdminCount: 1,
    },
    designatedEmail,
  );
  assert.equal(duplicateBootstrap.eligible, false);
  assert.match(duplicateBootstrap.error || "", /already completed/);

  // Rejected: Arbitrary resident attempting bootstrap without trusted app_metadata
  const residentAttempt = validateBootstrapEligibility(
    {
      email: "resident@example.com",
      appMetadata: {
        provider: "email",
        providers: ["email"],
      },
      existingSuperAdminCount: 0,
    },
    designatedEmail,
  );
  assert.equal(residentAttempt.eligible, false);
  assert.match(residentAttempt.error || "", /Email mismatch/);

  // Rejected: Matching email but forged or missing app_metadata claims
  const forgedAttempt = validateBootstrapEligibility(
    {
      email: designatedEmail,
      appMetadata: {
        provider: "email",
        providers: ["email"],
      },
      existingSuperAdminCount: 0,
    },
    designatedEmail,
  );
  assert.equal(forgedAttempt.eligible, false);
  assert.match(forgedAttempt.error || "", /Untrusted metadata/);
});

test("preserves mandatory contact number validation for registration", () => {
  assert.equal(normalizePhilippineMobile("09171234567"), "+639171234567");
  assert.equal(normalizePhilippineMobile("09949243372"), "+639949243372");
  assert.equal(normalizePhilippineMobile("+639949243372"), "+639949243372");
  assert.equal(normalizePhilippineMobile("invalid-number"), null);
  assert.equal(normalizePhilippineMobile(""), null);
});
