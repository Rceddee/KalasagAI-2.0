import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/auth/callback/route";

test("verification exchanges the code and returns private session cookies on the local redirect", async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  t.after(() => {
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
  const auth = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    assert.equal(request.url, "https://fixture.supabase.invalid/auth/v1/token?grant_type=pkce");
    assert.deepEqual(await request.json(), { auth_code: "fixture-code", code_verifier: "fixture-verifier" });
    return Response.json({
      access_token: "fixture-session", refresh_token: "fixture-refresh", token_type: "bearer",
      expires_in: 3600, user: { id: "00000000-0000-4000-8000-000000000001" },
    });
  });
  const request = new NextRequest("https://resident.example/auth/callback?code=fixture-code&next=/reports");
  request.cookies.set("sb-fixture-auth-token-code-verifier", JSON.stringify("fixture-verifier"));
  const response = await GET(request);
  assert.equal(auth.mock.callCount(), 1);
  assert.equal(response.headers.get("location"), "https://resident.example/reports");
  assert.ok(response.cookies.get("sb-fixture-auth-token")?.value);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});
