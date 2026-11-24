import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: incidentId } = await context.params;
  if (!incidentId) {
    return NextResponse.json({ error: "Incident ID required" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !publishableKey || !secretKey) {
    return NextResponse.json({ error: "Server configuration missing" }, { status: 500 });
  }

  // 1. Verify user is staff
  const userClient = createClient(url, publishableKey);
  const { data: userResult, error: authError } = await userClient.auth.getUser(token);
  if (authError || !userResult.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const adminClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: staffProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userResult.user.id)
    .single();

  if (
    profileError ||
    !staffProfile ||
    !["responder", "communication_officer", "admin", "super_admin"].includes(staffProfile.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Fetch incident to get resident_id
  const { data: incident, error: incError } = await adminClient
    .from("incidents")
    .select("id, resident_id")
    .eq("id", incidentId)
    .maybeSingle();

  if (incError || !incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  // 3. Fetch reporter's profile
  const { data: reporterProfile } = await adminClient
    .from("profiles")
    .select("full_name, contact_number, email, role")
    .eq("id", incident.resident_id)
    .maybeSingle();

  return NextResponse.json({
    fullName: reporterProfile?.full_name || "Verified Citizen",
    email: reporterProfile?.email || null,
    role: reporterProfile?.role || "resident",
    contactNumber: reporterProfile?.contact_number || null,
  });
}
