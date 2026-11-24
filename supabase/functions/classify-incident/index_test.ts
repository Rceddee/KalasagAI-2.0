import { strict as assert } from "node:assert";
import { handleRequest } from "./index.ts";

Deno.test("classification stores only a server-side suggestion for authorized personnel", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  let actorRole = "communication_officer";
  let incidentOwnerId = "11111111-1111-4111-8111-111111111111";
  let providerCalls = 0;
  let providerFailuresRemaining = 1;
  let providerNetworkFailuresRemaining = 0;
  let invalidDecisionResponse = false;
  let geminiPrompt = "";
  let evidencePhotoRecords = [{
    storage_path: "reporter/test/photo.jpg",
    content_type: "image/jpeg",
    file_size_bytes: 4,
  }];

  Deno.env.set("SUPABASE_URL", "http://supabase.mock");
  Deno.env.set("SUPABASE_PUBLISHABLE_KEY", "local-test-publishable-key");
  Deno.env.set("SUPABASE_SECRET_KEY", "local-test-secret-key");
  Deno.env.set("GEMINI_ENABLED", "true");
  Deno.env.set("GEMINI_API_KEY", "local-test-gemini-key");
  Deno.env.set("GEMINI_MODEL", "legacy-gemini-model");
  Deno.env.set("GEMINI_MODEL1", "gemini-3.5-flash-lite");

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const body = request.method === "GET"
      ? null
      : await request.clone().json().catch(() => null);
    requests.push({ method: request.method, path: url.pathname, body });

    if (url.hostname === "generativelanguage.googleapis.com") {
      providerCalls++;
      assert.ok(init?.signal instanceof AbortSignal);
      if (providerNetworkFailuresRemaining > 0) {
        providerNetworkFailuresRemaining--;
        throw new DOMException("The request was aborted.", "AbortError");
      }
      if (providerFailuresRemaining > 0) {
        providerFailuresRemaining--;
        return Response.json(
          {
            error: {
              code: 503,
              status: "UNAVAILABLE",
              message: "The service is temporarily overloaded.",
            },
          },
          { status: 503, headers: { "x-goog-request-id": "mock-request-id" } },
        );
      }
      if (url.pathname === "/v1beta/decisions") {
        if (invalidDecisionResponse) {
          return Response.json({
            answers: {
              category: {
                type: "choice",
                choice: "wildfire",
                confidence: 0.94,
              },
              priority: {
                type: "choice",
                choice: "high",
                confidence: 0.82,
              },
            },
          });
        }
        return Response.json({
          answers: {
            category: { type: "choice", choice: "fire", confidence: 0.94 },
            priority: { type: "choice", choice: "high", confidence: 0.82 },
          },
        });
      }
      const payload = body as {
        contents: Array<{ parts: Array<Record<string, unknown>> }>;
      };
      geminiPrompt = payload.contents[0].parts
        .find((part) => typeof part.text === "string")?.text as string;
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
        id: "11111111-1111-4111-8111-111111111111",
        aud: "authenticated",
        role: "authenticated",
        email: "officer@example.test",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      });
    }
    if (url.pathname === "/rest/v1/profiles") {
      return Response.json([{ role: actorRole }]);
    }
    if (url.pathname === "/rest/v1/incidents") {
      return Response.json([{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        description: "Smoke is visible near a building.",
        location_label: "Test location",
        resident_id: incidentOwnerId,
      }]);
    }
    if (url.pathname === "/rest/v1/system_settings") {
      return Response.json({ value: true });
    }
    if (url.pathname === "/rest/v1/incident_photos") {
      return Response.json(evidencePhotoRecords);
    }
    if (url.pathname.startsWith("/storage/v1/object/")) {
      return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), {
        headers: { "Content-Type": "image/jpeg" },
      });
    }
    if (url.pathname === "/rest/v1/rpc/claim_ai_job_delivery") {
      return Response.json(true);
    }
    if (url.pathname === "/rest/v1/rpc/fail_ai_job") {
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/rest/v1/rpc/record_claimed_ai_assessment") {
      const assessmentInput = body as {
        p_category?: string;
        p_priority?: string;
        p_rationale?: string;
        p_model?: string;
      };
      return Response.json({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        suggested_category: assessmentInput.p_category,
        suggested_priority: assessmentInput.p_priority,
        rationale: assessmentInput.p_rationale,
        model: assessmentInput.p_model,
        created_at: "2026-01-01T00:00:00.000Z",
      });
    }
    throw new Error(
      `Unexpected Supabase request: ${request.method} ${url.pathname}`,
    );
  };

  const callHandler = () =>
    handleRequest(
      new Request("http://function.mock", {
        method: "POST",
        headers: {
          Authorization: "Bearer mock-user-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          incidentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      }),
    );

  try {
    const response = await callHandler();
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.assessment.suggested_category, "fire");
    assert.equal(result.assessment.suggested_priority, "high");
    assert.equal(providerCalls, 2);
    assert.ok(
      requests.some(({ path }) =>
        path === "/v1beta/models/gemini-3.5-flash-lite:generateContent"
      ),
    );
    assert.ok(
      geminiPrompt.includes(
        "Classify this emergency incident for human review",
      ),
    );
    assert.ok(geminiPrompt.includes("Do not assign responders"));
    assert.ok(geminiPrompt.includes("priority must be low, medium, or high"));
    assert.ok(geminiPrompt.includes("attached evidence photos"));
    const generateContentRequest = requests
      .filter(({ path }) =>
        path === "/v1beta/models/gemini-3.5-flash-lite:generateContent"
      )
      .at(-1)?.body as {
        contents?: Array<{ parts?: Array<Record<string, unknown>> }>;
      } | undefined;
    const generateContentParts = generateContentRequest?.contents?.[0].parts ??
      [];
    assert.ok(
      generateContentParts.some((part) => {
        const inlineData = part.inlineData as {
          mimeType?: string;
          data?: string;
        } | undefined;
        return inlineData?.mimeType === "image/jpeg" &&
          inlineData.data === "/9j/AA==";
      }),
    );
    const assessmentRequest = requests
      .filter(({ path }) => path === "/rest/v1/rpc/record_claimed_ai_assessment")
      .at(-1)?.body as { p_priority?: string } | undefined;
    assert.equal(assessmentRequest?.p_priority, "high");
    assert.equal(
      requests.some(({ path }) => path === "/rest/v1/rpc/record_claimed_ai_assessment"),
      true,
    );
    assert.equal(
      requests.some(({ method, path }) =>
        path.includes("classification_reviews") ||
        path === "/rest/v1/rpc/review_incident_classification" ||
        (path === "/rest/v1/incidents" && method !== "GET")
      ),
      false,
    );

    actorRole = "unknown";
    const providerCallsBeforeUnauthorizedRequest = providerCalls;
    const deniedRoleResponse = await callHandler();
    assert.equal(deniedRoleResponse.status, 403);
    assert.equal(providerCalls, providerCallsBeforeUnauthorizedRequest);

    actorRole = "responder";
    const ownResponderReportResponse = await callHandler();
    assert.equal(ownResponderReportResponse.status, 200);
    assert.equal(providerCalls, providerCallsBeforeUnauthorizedRequest + 1);

    incidentOwnerId = "22222222-2222-4222-8222-222222222222";
    const otherResponderReportResponse = await callHandler();
    assert.equal(otherResponderReportResponse.status, 403);
    assert.equal(providerCalls, providerCallsBeforeUnauthorizedRequest + 1);

    actorRole = "resident";
    const otherResidentResponse = await callHandler();
    assert.equal(otherResidentResponse.status, 403);
    assert.equal(providerCalls, providerCallsBeforeUnauthorizedRequest + 1);

    incidentOwnerId = "11111111-1111-4111-8111-111111111111";
    const ownReportResponse = await callHandler();
    assert.equal(ownReportResponse.status, 200);
    assert.equal(providerCalls, providerCallsBeforeUnauthorizedRequest + 2);
    const residentAssessmentRequest = requests
      .filter(({ path }) => path === "/rest/v1/rpc/record_claimed_ai_assessment")
      .at(-1)?.body as { p_actor_id?: string } | undefined;
    assert.equal(
      residentAssessmentRequest?.p_actor_id,
      "11111111-1111-4111-8111-111111111111",
    );

    actorRole = "communication_officer";
    Deno.env.set("GEMINI_MODEL1", "gemini-decision-1");
    const callsBeforeDecisionClassification = providerCalls;
    const decisionResponse = await callHandler();
    assert.equal(decisionResponse.status, 200);
    const decisionResult = await decisionResponse.json();
    assert.equal(providerCalls, callsBeforeDecisionClassification + 1);
    assert.equal(decisionResult.assessment.suggested_category, "fire");
    assert.equal(decisionResult.assessment.suggested_priority, "high");
    assert.equal(decisionResult.assessment.model, "gemini-decision-1");
    assert.ok(
      decisionResult.assessment.rationale.includes("category fire: 94%"),
    );
    const decisionRequest = requests
      .filter(({ path }) => path === "/v1beta/decisions")
      .at(-1)?.body as {
        model?: string;
        input?: Array<{
          type?: string;
          text?: string;
          mime_type?: string;
          data?: string;
        }>;
        questions?: Record<string, {
          type?: string;
          criteria?: Record<string, string>;
        }>;
      } | undefined;
    assert.equal(decisionRequest?.model, "gemini-decision-1");
    assert.ok(
      decisionRequest?.input?.some((part) =>
        part.type === "text" && part.text?.includes("untrusted data")
      ),
    );
    assert.ok(
      decisionRequest?.input?.some((part) =>
        part.type === "image" &&
        part.mime_type === "image/jpeg" &&
        part.data === "/9j/AA=="
      ),
    );
    assert.equal(decisionRequest?.questions?.category?.type, "choice");
    assert.equal(decisionRequest?.questions?.priority?.type, "choice");
    assert.ok(decisionRequest?.questions?.category?.criteria?.road_accident);
    assert.ok(decisionRequest?.questions?.priority?.criteria?.high);

    invalidDecisionResponse = true;
    const assessmentsBeforeInvalidDecision = requests.filter(({ path }) =>
      path === "/rest/v1/rpc/record_claimed_ai_assessment"
    ).length;
    const failedJobsBeforeInvalidDecision = requests.filter(({ path }) =>
      path === "/rest/v1/rpc/fail_ai_job"
    ).length;
    const invalidDecision = await callHandler();
    assert.equal(invalidDecision.status, 502);
    assert.equal(
      requests.filter(({ path }) =>
        path === "/rest/v1/rpc/record_claimed_ai_assessment"
      ).length,
      assessmentsBeforeInvalidDecision,
    );
    assert.equal(
      requests.filter(({ path }) => path === "/rest/v1/rpc/fail_ai_job").length,
      failedJobsBeforeInvalidDecision + 1,
    );
    invalidDecisionResponse = false;

    Deno.env.delete("GEMINI_MODEL1");
    Deno.env.set("GEMINI_MODEL", "gemini-3.5-flash-lite");
    const legacyModelResponse = await callHandler();
    assert.equal(legacyModelResponse.status, 200);
    const legacyModelResult = await legacyModelResponse.json();
    assert.equal(
      legacyModelResult.assessment.model,
      "gemini-3.5-flash-lite",
    );
    Deno.env.set("GEMINI_MODEL1", "gemini-decision-1");

    const providerCallsBeforeDisabledRequest = providerCalls;
    Deno.env.set("GEMINI_ENABLED", "false");
    const disabledResponse = await callHandler();
    assert.equal(disabledResponse.status, 503);
    assert.equal(providerCalls, providerCallsBeforeDisabledRequest);

    Deno.env.set("GEMINI_ENABLED", "true");
    providerFailuresRemaining = 3;
    const callsBeforeExhaustedRetries = providerCalls;
    const unavailableResponse = await callHandler();
    assert.equal(unavailableResponse.status, 503);
    assert.equal(providerCalls, callsBeforeExhaustedRetries + 3);
    assert.equal(
      requests.some(({ path }) => path === "/rest/v1/rpc/fail_ai_job"),
      true,
    );

    providerFailuresRemaining = 0;
    providerNetworkFailuresRemaining = 3;
    const failedJobCallsBeforeNetworkErrors = requests.filter(({ path }) =>
      path === "/rest/v1/rpc/fail_ai_job"
    ).length;
    const networkErrorResponse = await callHandler();
    assert.equal(networkErrorResponse.status, 502);
    assert.equal(providerNetworkFailuresRemaining, 0);
    assert.equal(
      requests.filter(({ path }) => path === "/rest/v1/rpc/fail_ai_job").length,
      failedJobCallsBeforeNetworkErrors + 1,
    );

    providerNetworkFailuresRemaining = 0;
    evidencePhotoRecords = [
      {
        storage_path: "reporter/test/photo-1.jpg",
        content_type: "image/jpeg",
        file_size_bytes: 10 * 1024 * 1024,
      },
      {
        storage_path: "reporter/test/photo-2.jpg",
        content_type: "image/jpeg",
        file_size_bytes: 10 * 1024 * 1024,
      },
    ];
    const callsBeforeOversizedEvidence = providerCalls;
    const oversizedEvidenceResponse = await callHandler();
    assert.equal(oversizedEvidenceResponse.status, 413);
    evidencePhotoRecords = [];
    assert.equal((await callHandler()).status, 422);
    assert.equal(providerCalls, callsBeforeOversizedEvidence);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
