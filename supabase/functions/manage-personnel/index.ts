import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const personnelRoles = new Set([
  "responder",
  "communication_officer",
  "admin",
  "super_admin",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxActorIds = 500;

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response({ error: "Method not allowed" }, 405);
  }

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return response({ error: "Authentication is required" }, 401);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return response({ error: "A valid JSON request body is required" }, 400);
  }
  if (typeof input !== "object" || input === null || !("action" in input) || typeof input.action !== "string") {
    return response({ error: "A valid personnel action is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey =
    Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !secretKey) {
    console.error("Personnel function is missing Supabase server configuration");
    return response({ error: "Personnel service is not configured" }, 503);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, flowType: "implicit" },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userResult, error: authError } = await userClient.auth.getUser(token);
  if (authError || !userResult.user) {
    return response({ error: "Authentication is invalid or expired" }, 401);
  }

  const { data: actor, error: actorError } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userResult.user.id)
    .maybeSingle();
  if (actorError) {
    console.error("Personnel permission lookup failed", actorError.message);
    return response({ error: "Unable to verify personnel permissions" }, 503);
  }
  if (!actor || !["admin", "super_admin"].includes(actor.role)) {
    return response({ error: "Not authorized to manage personnel" }, 403);
  }

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (input.action === "list") {
    const { data, error } = await adminClient
      .from("profiles")
      .select("id, full_name, email, role, created_at")
      .neq("role", "resident")
      .order("full_name", { ascending: true });
    if (error) {
      console.error("Personnel directory query failed", error.message);
      return response({ error: "Unable to load the personnel directory" }, 503);
    }
    return response({ personnel: data });
  }

  if (input.action === "list-audit-actors") {
    if (
      !("actorIds" in input) ||
      !Array.isArray(input.actorIds) ||
      input.actorIds.length > maxActorIds ||
      !input.actorIds.every((id) => typeof id === "string" && uuidPattern.test(id))
    ) {
      return response({ error: "A valid list of audit actor IDs is required" }, 400);
    }

    const actorIds = [...new Set(input.actorIds)];
    if (actorIds.length === 0) return response({ actors: [] });

    const actors: Array<{ id: string; full_name: string }> = [];
    for (let offset = 0; offset < actorIds.length; offset += 100) {
      const { data, error } = await adminClient
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds.slice(offset, offset + 100));
      if (error) {
        console.error("Audit actor lookup failed", error.message);
        return response({ error: "Unable to resolve activity actors" }, 503);
      }
      actors.push(...(data ?? []));
    }
    return response({ actors });
  }

  if (input.action !== "invite") {
    return response({ error: "Unsupported personnel action" }, 400);
  }
  if (
    !("fullName" in input) ||
    typeof input.fullName !== "string" ||
    input.fullName.trim().length < 1 ||
    input.fullName.trim().length > 120 ||
    !("email" in input) ||
    typeof input.email !== "string" ||
    input.email.trim().length > 254 ||
    !("role" in input) ||
    typeof input.role !== "string" ||
    !personnelRoles.has(input.role)
  ) {
    return response({ error: "Full name, email, and a valid personnel role are required" }, 400);
  }
  if (
    actor.role !== "super_admin" &&
    (input.role === "admin" || input.role === "super_admin")
  ) {
    return response({ error: "Only a super admin can invite privileged personnel" }, 403);
  }

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ error: "Enter a valid email address" }, 400);
  }

  const personnelWebUrl = Deno.env.get("PERSONNEL_WEB_URL");
  if (!personnelWebUrl) {
    console.error("Personnel Web recovery URL is not configured");
    return response({ error: "Personnel invitation email is not configured" }, 503);
  }
  let redirectTo: string;
  try {
    redirectTo = new URL("/auth/callback", personnelWebUrl).toString();
  } catch {
    console.error("Personnel Web recovery URL is invalid");
    return response({ error: "Personnel invitation email is not configured" }, 503);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: false,
    app_metadata: {
      account_type: "personnel",
      personnel_role: input.role,
    },
    user_metadata: { full_name: input.fullName.trim() },
  });
  if (createError) {
    console.error("Personnel account creation failed", createError.message);
    if (createError.code === "email_exists" || createError.code === "user_already_exists") {
      return response({ error: "An account with this email already exists" }, 409);
    }
    return response({ error: "Unable to create the personnel account" }, 503);
  }
  if (!created.user) {
    console.error("Personnel account creation returned no user");
    return response({ error: "Unable to create the personnel account" }, 503);
  }

  const { error: roleError } = await userClient.rpc("assign_personnel_role", {
    p_user_id: created.user.id,
    p_role: input.role,
  });
  if (roleError) {
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id);
    if (rollbackError) {
      console.error("Unable to roll back a personnel account without its assigned role", rollbackError.message);
    }
    console.error("Personnel role assignment failed", roleError.message);
    return response({ error: "Unable to assign the personnel role" }, 503);
  }

  const { error: emailError } = await userClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (emailError) {
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id);
    if (rollbackError) {
      console.error("Unable to roll back an unsent personnel invitation", rollbackError.message);
    }
    console.error("Personnel invitation email failed", emailError.message);
    return response({ error: "The invitation could not be emailed; no account was kept" }, 503);
  }

  return response({ invited: true });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
