// Start both web apps on loopback ports 4310 (Personnel) and 4311 (Resident),
// with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:45490 and a fixture publishable key.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const api = "http://127.0.0.1:45490";
const userId = "00000000-0000-4000-8000-000000000001";
const arrival = { id: "00000000-0000-4000-8000-000000000002", reference: "QA-NEW", created_at: "2026-11-26T00:01:00Z" };
const browser = await chromium.launch({ channel: "chrome" });

async function openApp(role, width) {
  const base = "http://127.0.0.1:" + (role === "resident" ? 4311 : 4310);
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 },
    hasTouch: width < 600, geolocation: { latitude: 13.92, longitude: 122.10 }, permissions: ["geolocation"] });
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "qa@example.test", app_metadata: {}, user_metadata: {} };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = [encode({ alg: "HS256", typ: "JWT" }), encode({ sub: userId, exp: expires }), "dGVzdA"].join(".");
  const state = { writes: [], catchUp: [], sendInsert: null };
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === base && url.pathname.startsWith("/api/incident/")) return route.fulfill({json:{name:"Fixture Reporter",contact_number:"+639170000000"}});
    if (url.origin === base) return route.continue();
    if (url.origin !== api) return route.abort();
    let data = [];
    if (url.pathname === "/auth/v1/token") data = { access_token: token, token_type: "bearer", expires_in: 3600, expires_at: expires, refresh_token: "fixture", user };
    else if (url.pathname === "/auth/v1/user") data = user;
    else if (url.pathname === "/rest/v1/profiles") data = { id: userId, full_name: "Fixture User", contact_number: "+639170000000", role };
    else if (url.pathname === "/rest/v1/incidents" && url.searchParams.get("select") === "id,reference,created_at") {
      data = url.searchParams.get("limit") === "1" ? [{ ...arrival, id: userId, reference: "OLD", created_at: "2026-11-26T00:00:00Z" }] : state.catchUp;
    } else if (url.pathname === "/rest/v1/incidents") {
      data = [{ ...arrival, reference: "QA-EXISTING", resident_id: userId, description: "Fixture road obstruction",
        location_label: "Test street", latitude: 13.92, longitude: 122.10, updated_at: arrival.created_at,
        status: "pending", ai_assessments: [], classification_reviews: [] }];
    } else if (route.request().method() !== "GET" && route.request().method() !== "HEAD") state.writes.push(url.pathname);
    return route.fulfill({ json: data });
  });
  await context.routeWebSocket("**/realtime/v1/websocket**", socket => {
    socket.onMessage(raw => {
      const [join, ref, topic, event, payload] = JSON.parse(raw.toString());
      if (event !== "phx_join" && event !== "heartbeat") return;
      const filters = (payload.config?.postgres_changes ?? []).map((f, i) => ({ ...f, id: i+1 }));
      socket.send(JSON.stringify([join, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: filters } }]));
      if (topic === "realtime:personnel-new-report-alerts") {
        state.sendInsert = () => socket.send(JSON.stringify([join, null, topic, "postgres_changes",
          { ids: [1], data: { schema: "public", table: "incidents", type: "INSERT", columns: [], record: arrival } }]));
      }
    });
  });
  await context.addInitScript(() => {
    window.qaChimes = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) { window.qaChimes++; return start.apply(this, args); };
  });
  const page = await context.newPage();
  await page.goto(base + (role === "resident" ? "/" : "/login"));
  await page.locator('input[type=email]').fill(user.email);
  await page.locator('input[type=password]').fill("local-fixture");
  await page.locator('form button[type=submit]').click();
  return { page, context, state, base };
}

async function fits(page, label) {
  const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(sizes[0] <= sizes[1] + 1, label + " overflows: " + sizes);
}

try {
  for (const width of [360, 390, 1440]) {
    const { page, context, state } = await openApp("resident", width);
    await page.locator("#incident-description").fill("Test");
    await page.locator(".resident-report-submit").click();
    assert.ok(await page.locator("#incident-description").evaluate(el => !el.checkValidity()));
    await page.locator("#incident-description").fill("Fictional flooding on the test road");
    await page.locator("#incident-location-label").fill("Test street");
    await page.locator(".resident-report-submit").click();
    await page.getByText(/Please select a valid incident location/).waitFor();
    await page.getByRole("button", { name: "Use my current location" }).click();
    await page.getByText("Current map pin", { exact: true }).waitFor();
    await page.locator(".resident-report-submit").click();
    await page.getByText(/Valid photo evidence is required/).waitFor();
    assert.deepEqual(state.writes, []);
    const png = await page.evaluate(() => document.createElement("canvas").toDataURL("image/png").split(",")[1]);
    await page.locator("#resident-gallery-input").setInputFiles({
      name: "qa.png", mimeType: "image/png", buffer: Buffer.from(png, "base64"),
    });
    await page.getByText(/Photo attached\. It will upload securely/).waitFor();
    await fits(page,"Resident form");
    console.log("PASS resident",width,"GPS, missing-photo rejection, zero writes, PNG preview, layout");
    await context.close();
  }
  for (const width of [360, 390, 1440]) {
    const { page, context, state } = await openApp("responder", width);
    await page.locator("#dashboard-sidebar").waitFor();
    // The dev toolbar is absent from a release build and can overlay phone controls.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
    const map = await page.locator("#map-section").boundingBox();
    assert.ok(map && map.width >= 240 && map.height >= 180, "Map must be usable at " + width + "px: " + JSON.stringify(map));
    await page.locator("#incident-feed-panel").getByText("QA-EXISTING").click();
    await page.getByText("Fixture road obstruction", {exact:true}).last().waitFor();
    assert.equal(await page.getByRole("button",{name:/save review|update status|try ai suggestion/i}).count(),0);
    assert.ok(!state.writes.some(path=>path.includes("classify-incident")));
    await page.getByRole("link",{name:"Full report details"}).waitFor();
    await page.getByRole("button",{name:"Close report details"}).click();
    await page.locator('a[href="/dashboard/blotters"]').first().click();
    await page.waitForURL("**/dashboard/blotters");
    await page.getByRole("heading", { name: /incident reports/i }).first().waitFor();
    assert.equal(await page.locator("#nav-admin-controls").count(), 0);
    await fits(page,"Personnel records");
    const sound = page.locator(".report-sound-toggle");
    if (await sound.getAttribute("aria-label") === "Enable alert sound") await sound.click();
    await page.getByRole("button", { name: "Mute alert sound" }).waitFor();
    const before = await page.evaluate(() => window.qaChimes);
    assert.ok(state.sendInsert, "registered report subscription");
    state.sendInsert();
    await page.getByRole("status").filter({hasText:"QA-NEW"}).waitFor();
    assert.equal(await page.evaluate(() => window.qaChimes), before + 1);
    state.catchUp = [arrival];
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("button", { name: "Dismiss report notification" }).click();
    state.sendInsert();
    await page.waitForTimeout(200);
    assert.equal(await page.locator(".new-report-notice").count(), 0);
    assert.equal(await page.evaluate(() => window.qaChimes), before + 1);
    console.log("PASS personnel",width,"records navigation, responder menu, insert banner, one audio start, deduplication");
    await context.close();
  }
} finally {
  await browser.close();
}
