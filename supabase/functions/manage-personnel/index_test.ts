import { strict as assert } from "node:assert";
import { handleRequest } from "./index.ts";

const actorId = "11111111-1111-4111-8111-111111111111";
const invitedId = "22222222-2222-4222-8222-222222222222";

async function exerciseInvite(
  roleAssignmentStatus: number,
  createUserFailure?: { status: number; body: Record<string, string> },
) {
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries(
    ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "PERSONNEL_WEB_URL"]
      .map((name) => [name, Deno.env.get(name)]),
  );
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  Deno.env.set("SUPABASE_URL", "http://supabase.mock");
  Deno.env.set("SUPABASE_PUBLISHABLE_KEY", "local-test-publishable-key");
  Deno.env.set("SUPABASE_SECRET_KEY", "local-test-secret-key");
  Deno.env.set("PERSONNEL_WEB_URL", "http://personnel.mock");

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const body = request.method === "GET" || request.method === "DELETE"
      ? null
      : await request.clone().json().catch(() => null);
    requests.push({ method: request.method, path: url.pathname, body });

    if (url.pathname === "/auth/v1/user") {
      return Response.json({
        id: actorId,
        aud: "authenticated",
        role: "authenticated",
        email: "admin@example.test",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      });
    }
    if (url.pathname === "/rest/v1/profiles") {
      return Response.json([{ role: "super_admin" }]);
    }
    if (url.pathname === "/auth/v1/admin/users" && request.method === "POST") {
      if (createUserFailure) {
        return Response.json(createUserFailure.body, { status: createUserFailure.status });
      }
      return Response.json({
        user: {
          id: invitedId,
          aud: "authenticated",
          role: "authenticated",
          email: "responder@example.test",
          app_metadata: { account_type: "personnel", personnel_role: "responder" },
          user_metadata: { full_name: "Synthetic Responder" },
          created_at: "2026-01-01T00:00:00.000Z",
        },
      });
    }
    if (url.pathname === `/auth/v1/admin/users/${invitedId}`) {
      if (request.method === "GET") {
        return Response.json({
          user: {
            id: invitedId,
            aud: "authenticated",
            role: "authenticated",
            email: "responder@example.test",
            app_metadata: { account_type: "personnel", personnel_role: "responder" },
            user_metadata: { full_name: "Synthetic Responder" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
        });
      }
      if (request.method === "DELETE") return Response.json({});
    }
    if (url.pathname === "/rest/v1/rpc/assign_personnel_role") {
      return roleAssignmentStatus < 300
        ? new Response(null, { status: 204 })
        : Response.json({ message: "Role assignment denied" }, { status: roleAssignmentStatus });
    }
    if (url.pathname === "/auth/v1/recover") {
      return Response.json({});
    }
    throw new Error(`Unexpected Supabase request: ${request.method} ${url.pathname}`);
  };

  const request = new Request("http://function.mock", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock-super-admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "invite",
      fullName: "Synthetic Responder",
      email: "responder@example.test",
      role: "responder",
    }),
  });

  try {
    const response = await handleRequest(request);
    return { response, requests };
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

async function exerciseAuditActorLookup(actorRole: string, actorIds: string[]) {
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries(
    ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]
      .map((name) => [name, Deno.env.get(name)]),
  );
  const requests: Array<{ method: string; path: string; url: URL }> = [];
  Deno.env.set("SUPABASE_URL", "http://supabase.mock");
  Deno.env.set("SUPABASE_PUBLISHABLE_KEY", "local-test-publishable-key");
  Deno.env.set("SUPABASE_SECRET_KEY", "local-test-secret-key");

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    requests.push({ method: request.method, path: url.pathname, url });

    if (url.pathname === "/auth/v1/user") {
      return Response.json({
        id: actorId,
        aud: "authenticated",
        role: "authenticated",
        email: "admin@example.test",
        app_metadata: { account_type: "personnel", personnel_role: actorRole },
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      });
    }
    if (url.pathname === "/rest/v1/profiles" && url.searchParams.get("select") === "role") {
      return Response.json([{ role: actorRole }]);
    }
    if (url.pathname === "/rest/v1/profiles" && url.searchParams.get("select") === "id,full_name") {
      return Response.json([{ id: invitedId, full_name: "Resident Example" }]);
    }
    throw new Error(`Unexpected Supabase request: ${request.method} ${url.pathname}`);
  };

  try {
    const response = await handleRequest(new Request("http://function.mock", {
      method: "POST",
      headers: {
        Authorization: "Bearer mock-admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "list-audit-actors", actorIds }),
    }));
    return { response, requests };
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

Deno.test("audit actor lookup returns only requested names to admins", async () => {
  const { response, requests } = await exerciseAuditActorLookup("admin", [invitedId]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    actors: [{ id: invitedId, full_name: "Resident Example" }],
  });
  const profileQuery = requests.find(({ path, url }) =>
    path === "/rest/v1/profiles" && url.searchParams.get("select") === "id,full_name"
  );
  assert.ok(profileQuery);
  assert.equal(profileQuery.url.searchParams.has("email"), false);
});

Deno.test("audit actor lookup denies communication officers and rejects invalid IDs", async () => {
  const denied = await exerciseAuditActorLookup("communication_officer", [invitedId]);
  assert.equal(denied.response.status, 403);
  assert.equal(denied.requests.some(({ url }) => url.searchParams.get("select") === "id,full_name"), false);

  const invalid = await exerciseAuditActorLookup("super_admin", ["not-a-uuid"]);
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.requests.some(({ url }) => url.searchParams.get("select") === "id,full_name"), false);
});

Deno.test("audit actor lookup batches large ID lists", async () => {
  const actorIds = Array.from({ length: 101 }, (_, index) =>
    `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`
  );
  const { response, requests } = await exerciseAuditActorLookup("super_admin", actorIds);
  assert.equal(response.status, 200);
  assert.equal(requests.filter(({ url }) => url.searchParams.get("select") === "id,full_name").length, 2);
});

Deno.test("inviting personnel assigns the profile role before sending the invitation", async () => {
  const { response, requests } = await exerciseInvite(204);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { invited: true });

  const createIndex = requests.findIndex(({ path, method }) =>
    path === "/auth/v1/admin/users" && method === "POST"
  );
  const assignIndex = requests.findIndex(({ path }) =>
    path === "/rest/v1/rpc/assign_personnel_role"
  );
  const recoverIndex = requests.findIndex(({ path }) => path === "/auth/v1/recover");
  assert.ok(createIndex >= 0);
  assert.ok(assignIndex > createIndex);
  assert.ok(recoverIndex > assignIndex);
  assert.deepEqual(requests[assignIndex].body, {
    p_user_id: invitedId,
    p_role: "responder",
  });
});

Deno.test("failed personnel role assignment rolls back the uninvited account", async () => {
  const { response, requests } = await exerciseInvite(403);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Unable to assign the personnel role",
  });
  assert.equal(requests.some(({ path }) => path === "/auth/v1/recover"), false);
  assert.equal(
    requests.some(({ path, method }) =>
      path === `/auth/v1/admin/users/${invitedId}` && method === "DELETE"
    ),
    true,
  );
});

Deno.test("duplicate personnel email returns a specific conflict", async () => {
  const { response, requests } = await exerciseInvite(204, {
    status: 422,
    body: { error_code: "email_exists", message: "User already registered" },
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "An account with this email already exists",
  });
  assert.equal(requests.some(({ path }) => path === "/rest/v1/rpc/assign_personnel_role"), false);
});

Deno.test("unexpected account creation errors return a service failure", async () => {
  const { response } = await exerciseInvite(204, {
    status: 500,
    body: { code: "unexpected_failure", message: "Auth service unavailable" },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Unable to create the personnel account",
  });
});
