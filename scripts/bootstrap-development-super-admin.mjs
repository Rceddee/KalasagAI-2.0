import { createClient } from "@supabase/supabase-js";

const projectRef = "ydyawyqhvdlllqrtuxko";
const supabaseUrl = `https://${projectRef}.supabase.co`;
const email = process.env.KALASAG_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const fullName = process.env.KALASAG_BOOTSTRAP_FULL_NAME?.trim();
const contactNumber = process.env.KALASAG_BOOTSTRAP_CONTACT_NUMBER?.trim() || "09949243372";
const secretKey = process.env.KALASAG_DEV_SECRET_KEY;
const personnelWebUrl = "http://localhost:3000";
const redirectTo = new URL("/auth/callback", personnelWebUrl).toString();
const bootstrapSource = "kalasagai-dev-initial-super-admin-v1";

if (!email || !fullName || !secretKey) {
  throw new Error("Set KALASAG_BOOTSTRAP_EMAIL, KALASAG_BOOTSTRAP_FULL_NAME, and KALASAG_DEV_SECRET_KEY.");
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || fullName.length > 120) {
  throw new Error("Enter a valid email address and a full name of at most 120 characters.");
}

const normalizedPhone = contactNumber.replace(/[\s()-]/g, "");
const validPhone = /^09\d{9}$/.test(normalizedPhone)
  ? `+63${normalizedPhone.slice(1)}`
  : /^\+639\d{9}$/.test(normalizedPhone)
  ? normalizedPhone
  : null;

if (!validPhone) {
  throw new Error("Enter a valid Philippine mobile number (e.g., +639170000001 or 09170000001).");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureBootstrapAudit(userId) {
  const { data: existing, error: lookupError } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("action", "personnel.bootstrap_super_admin")
    .contains("details", { target_user_id: userId })
    .maybeSingle();
  if (lookupError) throw new Error(`Unable to check bootstrap audit history: ${lookupError.message}`);
  if (existing) return;

  const { error: insertError } = await supabase.from("audit_logs").insert({
    actor_id: null,
    action: "personnel.bootstrap_super_admin",
    details: {
      target_user_id: userId,
      target_email: email,
      bootstrap_source: bootstrapSource,
      provisioning_authority: "owner-controlled-development-bootstrap",
      actor_role: "service_role",
    },
  });
  if (insertError) throw new Error(`Unable to record bootstrap audit history: ${insertError.message}`);
}

async function sendRecoveryIfNeeded(user) {
  if (user.email_confirmed_at || user.app_metadata.bootstrap_recovery_sent_at) {
    console.log("Bootstrap account already exists; no account changes were made.");
    return;
  }

  const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (recoveryError) {
    throw new Error(`Recovery email could not be requested; the account was not deleted: ${recoveryError.message}`);
  }

  const { error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      account_type: "personnel",
      personnel_role: "super_admin",
      bootstrap_source: bootstrapSource,
      bootstrap_recovery_sent_at: new Date().toISOString(),
    },
  });
  if (metadataError) {
    throw new Error(`Recovery email was requested, but its idempotency marker could not be saved: ${metadataError.message}`);
  }

  console.log("Recovery email requested for the development super-admin account.");
}

async function run() {
  const { data: existingProfile, error: profileLookupError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();
  if (profileLookupError) throw new Error(`Unable to check the existing profile: ${profileLookupError.message}`);

  if (existingProfile) {
    const { data: userResult, error: userLookupError } = await supabase.auth.admin.getUserById(existingProfile.id);
    if (userLookupError || !userResult.user) {
      throw new Error(`An account already exists but could not be verified: ${userLookupError?.message ?? "No Auth user returned."}`);
    }

    const user = userResult.user;
    if (
      existingProfile.role !== "super_admin" ||
      user.app_metadata.account_type !== "personnel" ||
      user.app_metadata.personnel_role !== "super_admin" ||
      user.app_metadata.bootstrap_source !== bootstrapSource
    ) {
      throw new Error("An account already exists for this email; no account or role changes were made.");
    }

    await ensureBootstrapAudit(user.id);
    await sendRecoveryIfNeeded(user);
    return;
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: false,
    app_metadata: {
      account_type: "personnel",
      personnel_role: "super_admin",
      bootstrap_source: bootstrapSource,
    },
    user_metadata: {
      full_name: fullName,
      contact_number: validPhone,
    },
  });
  if (createError || !created.user) {
    throw new Error(`Auth user creation failed; no existing account was changed: ${createError?.message ?? "No user returned."}`);
  }

  const { error: bootstrapRoleError } = await supabase.rpc("bootstrap_initial_super_admin", {
    p_user_id: created.user.id,
    p_expected_email: email,
  });
  if (bootstrapRoleError) {
    throw new Error(`Auth user was created but initial super-admin assignment failed: ${bootstrapRoleError.message}`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", created.user.id)
    .maybeSingle();
  if (profileError || profile?.role !== "super_admin") {
    throw new Error(`Auth user was created but the super-admin profile was not verified: ${profileError?.message ?? "Profile role mismatch."} Do not rerun creation or delete the account; investigate this partial state.`);
  }

  await ensureBootstrapAudit(created.user.id);
  await sendRecoveryIfNeeded(created.user);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : "Development bootstrap failed.");
  process.exitCode = 1;
});
