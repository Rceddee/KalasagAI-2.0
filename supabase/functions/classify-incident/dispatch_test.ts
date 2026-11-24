import { strict as assert } from "node:assert";
import { handleRequest } from "./index.ts";

const incidentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const residentId = "11111111-1111-4111-8111-111111111111";
const otherResidentId = "22222222-2222-4222-8222-222222222222";
const publishableKey = "sb_publishable_dispatch_test";
const dispatchSecret = "local-only-mocked-dispatch-secret-32-bytes";
const testAssessment = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  suggested_category: "fire",
  suggested_priority: "high",
  rationale: "Smoke is reported near the building.",
  model: "test-model",
  created_at: "2026-01-01T00:00:00.000Z",
};
const envNames = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "GEMINI_ENABLED",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_MODEL1",
  "AI_DISPATCH_HMAC_KEY",
];

async function createSignature(
  secret: string,
  timestamp: string,
  id: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${id.toLowerCase()}`),
    ),
  );
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function internalRequest(options: {
  signingSecret?: string;
  timestamp?: string;
  includeDispatchHeaders?: boolean;
} = {}): Promise<Request> {
  const timestamp = options.timestamp ??
    Math.floor(Date.now() / 1000).toString();
  const signature = await createSignature(
    options.signingSecret ?? dispatchSecret,
    timestamp,
    incidentId,
  );
  const headers = new Headers({
    Authorization: "Bearer gateway-verified-test-token",
    "Content-Type": "application/json",
  });
  if (options.includeDispatchHeaders !== false) {
    headers.set("x-kalasag-dispatch-timestamp", timestamp);
    headers.set("x-kalasag-dispatch-signature", signature);
  }
  return new Request("http://function.mock", {
    method: "POST",
    headers,
    body: JSON.stringify({ incidentId }),
  });
}

Deno.test("authenticated AI dispatch uses mocks and preserves job authorization", async (t) => {
  const originalFetch = globalThis.fetch;
  const previousEnv = new Map(
    envNames.map((name) => [name, Deno.env.get(name)] as const),
  );
  let actorRole = "communication_officer";
  let incidentOwnerId = residentId;
  let claimResult = true;
  let claimNetworkFailure = false;
  let providerNetworkFailuresRemaining = 0;
  let existingAssessment: typeof testAssessment | null = null;
  let providerCalls = 0;
  let claimCalls = 0;
  let failCalls = 0;
  let recordCalls = 0;
  let incidentWrites = 0;
  let lastClaimBody: Record<string, unknown> | null = null;
  let lastRecordPath: string | null = null;
  let lastRecordBody: Record<string, unknown> | null = null;

  for (const [name, value] of Object.entries({
    SUPABASE_URL: "http://supabase.mock",
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: "test-only-server-secret-key",
    GEMINI_ENABLED: "true",
    GEMINI_API_KEY: "test-only-gemini-key",
    GEMINI_MODEL1: "test-model",
    GEMINI_MODEL: "test-model",
    AI_DISPATCH_HMAC_KEY: dispatchSecret,
  })) {
    Deno.env.set(name, value);
  }

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const body = request.method === "GET"
      ? null
      : await request.clone().json().catch(() => null);

    if (url.hostname === "generativelanguage.googleapis.com") {
      providerCalls++;
      if (providerNetworkFailuresRemaining > 0) {
        providerNetworkFailuresRemaining--;
        throw new TypeError("Mock provider network failure");
      }
      return Response.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                category: "fire",
                priority: "high",
                rationale: "Smoke is reported near the building.",
              }),
            }],
          },
        }],
      });
    }

    if (url.hostname !== "supabase.mock") {
      throw new Error(`Unexpected outbound request: ${url.hostname}`);
    }

    if (url.pathname === "/auth/v1/user") {
      return Response.json({
        id: residentId,
        aud: "authenticated",
        role: "authenticated",
        email: "resident@example.test",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      });
    }
    if (url.pathname === "/rest/v1/profiles") {
      return Response.json({ role: actorRole });
    }
    if (url.pathname === "/rest/v1/incidents") {
      if (request.method !== "GET") incidentWrites++;
      return Response.json({
        id: incidentId,
        description: "Smoke is visible near a building.",
        location_label: "Test location",
        resident_id: incidentOwnerId,
      });
    }
    if (url.pathname === "/rest/v1/system_settings") {
      return Response.json({ value: true });
    }
    if (url.pathname === "/rest/v1/incident_photos") {
      return Response.json([{ storage_path: "resident/test/evidence.jpg", content_type: "image/jpeg", file_size_bytes: 4 }]);
    }
    if (url.pathname.startsWith("/storage/v1/object/")) {
      return new Response(new Uint8Array([255,216,255,0]));
    }
    if (url.pathname === "/rest/v1/ai_assessments") {
      if (existingAssessment) return Response.json(existingAssessment);
      return new Response(null, { status: 406 });
    }
    if (url.pathname === "/rest/v1/rpc/claim_ai_job_delivery") {
      claimCalls++;
      lastClaimBody = body as Record<string, unknown>;
      if (claimNetworkFailure) throw new TypeError("Mock claim network failure");
      return Response.json(claimResult);
    }
    if (url.pathname === "/rest/v1/rpc/fail_ai_job") {
      failCalls++;
      return new Response(null, { status: 204 });
    }
    if (
      url.pathname === "/rest/v1/rpc/record_claimed_ai_assessment"
    ) {
      recordCalls++;
      lastRecordPath = url.pathname;
      lastRecordBody = body as Record<string, unknown>;
      return Response.json(testAssessment);
    }
    throw new Error(`Unexpected Supabase request: ${request.method} ${url.pathname}`);
  };

  const resetCounters = () => {
    providerCalls = 0;
    claimCalls = 0;
    failCalls = 0;
    recordCalls = 0;
    incidentWrites = 0;
    lastClaimBody = null;
    lastRecordPath = null;
    lastRecordBody = null;
    claimResult = true;
    claimNetworkFailure = false;
    providerNetworkFailuresRemaining = 0;
    existingAssessment = null;
    actorRole = "communication_officer";
    incidentOwnerId = residentId;
  };

  try {
    await t.step("successful signed dispatch reaches mocked inference and records one suggestion", async () => {
      resetCounters();
      const response = await handleRequest(await internalRequest());
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(providerCalls, 1);
      assert.equal(claimCalls, 1);
      assert.equal(recordCalls, 1);
      assert.equal(lastClaimBody?.p_actor_id, residentId);
      assert.equal(
        lastRecordPath,
        "/rest/v1/rpc/record_claimed_ai_assessment",
      );
      assert.equal(lastRecordBody?.p_actor_id, null);
      assert.ok(lastClaimBody?.p_worker_token);
      assert.equal(lastRecordBody?.p_worker_token, lastClaimBody?.p_worker_token);
      assert.equal(incidentWrites, 0);
    });

    await t.step("missing dispatch secret fails closed before database or provider calls", async () => {
      resetCounters();
      Deno.env.delete("AI_DISPATCH_HMAC_KEY");
      const response = await handleRequest(await internalRequest());
      assert.equal(response.status, 503);
      assert.equal(claimCalls, 0);
      assert.equal(providerCalls, 0);
      Deno.env.set("AI_DISPATCH_HMAC_KEY", dispatchSecret);
    });

    await t.step("invalid or expired signatures are rejected before database access", async () => {
      resetCounters();
      const wrongSecret = await handleRequest(
        await internalRequest({ signingSecret: "different-test-secret-that-is-long-enough" }),
      );
      assert.equal(wrongSecret.status, 401);
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 301).toString();
      const expired = await handleRequest(
        await internalRequest({ timestamp: oldTimestamp }),
      );
      assert.equal(expired.status, 401);
      const signed = await internalRequest();
      const wrongIncident = await handleRequest(new Request(signed.url, {
        method: "POST",
        headers: signed.headers,
        body: JSON.stringify({ incidentId: otherResidentId }),
      }));
      assert.equal(wrongIncident.status, 401);
      const missingGatewayCredential = await internalRequest();
      missingGatewayCredential.headers.delete("Authorization");
      const missingCredentialResponse = await handleRequest(
        missingGatewayCredential,
      );
      assert.equal(missingCredentialResponse.status, 401);
      assert.equal(claimCalls, 0);
      assert.equal(providerCalls, 0);
    });

    await t.step("consumed dispatch cannot retrieve a stored assessment or repeat inference", async () => {
      resetCounters();
      claimResult = false;
      existingAssessment = testAssessment;
      const response = await handleRequest(await internalRequest());
      assert.equal(response.status, 409);
      assert.equal(providerCalls, 0);
      assert.equal(recordCalls, 0);
    });

    await t.step("an already-processing duplicate does not invoke inference", async () => {
      resetCounters();
      claimResult = false;
      const response = await handleRequest(await internalRequest());
      assert.equal(response.status, 409);
      assert.equal(providerCalls, 0);
      assert.equal(recordCalls, 0);
    });

    await t.step("unauthorized user requests and missing user credentials are rejected", async () => {
      resetCounters();
      actorRole = "resident";
      incidentOwnerId = otherResidentId;
      const unauthorized = await handleRequest(
        new Request("http://function.mock", {
          method: "POST",
          headers: {
            Authorization: "Bearer mock-user-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ incidentId }),
        }),
      );
      assert.equal(unauthorized.status, 403);
      const missing = await handleRequest(
        new Request("http://function.mock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ incidentId }),
        }),
      );
      assert.equal(missing.status, 401);
      assert.equal(providerCalls, 0);
    });

    await t.step("database claim and provider network failures do not record assessments", async () => {
      resetCounters();
      claimNetworkFailure = true;
      const claimFailure = await handleRequest(await internalRequest());
      assert.equal(claimFailure.status, 503);
      assert.equal(providerCalls, 0);
      assert.equal(recordCalls, 0);

      resetCounters();
      providerNetworkFailuresRemaining = 3;
      const providerFailure = await handleRequest(await internalRequest());
      assert.equal(providerFailure.status, 502);
      assert.equal(providerCalls, 3);
      assert.equal(failCalls, 1);
      assert.equal(recordCalls, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of previousEnv) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
