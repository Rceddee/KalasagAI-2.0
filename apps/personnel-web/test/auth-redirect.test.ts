import assert from "node:assert/strict";
import test from "node:test";
import { getPasswordRecoveryRedirectUrl, sendStaffRecoveryEmail } from "../src/lib/auth-redirect";

test("personnel password recovery exchanges the code on the auth callback", () => {
  assert.equal(
    getPasswordRecoveryRedirectUrl("https://personnel.example"),
    "https://personnel.example/auth/callback?type=recovery",
  );
});

test("staff recovery can finish in the recipient's browser", async (t) => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  t.after(() => {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
  const request = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    assert.equal(new URL(req.url).searchParams.get("redirect_to"), "https://personnel.example/auth/callback?type=recovery");
    const body = await req.json();
    assert.equal(body.email, "staff@example.invalid");
    assert.ok(!body.code_challenge);
    return Response.json({});
  });
  const { error } = await sendStaffRecoveryEmail("staff@example.invalid", "https://personnel.example");
  assert.equal(error, null);
  assert.equal(request.mock.callCount(), 1);
});
