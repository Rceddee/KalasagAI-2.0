import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), "supabase/functions/.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
    const [k, ...v] = trimmed.split("=");
    env[k.trim()] = v.join("=").trim();
  }
}

const supabaseUrl = env.SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !secretKey || !publishableKey) {
  console.error("Missing keys in supabase/functions/.env.local");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const residentEmail = "kalasag.synthetic.e2e.mwowrg2xirsz39@example.com";
const adminEmail = "cedrickvidal23@gmail.com";
const testIncidentRef = "KAL-20261123-000005";
const testIncidentId = "3a18373b-a159-407a-8b80-7e448143a74f";

const results = [];
function record(testId, app, scenario, passed, details = "") {
  results.push({ testId, app, scenario, passed, details });
  const status = passed ? "PASS" : "FAIL";
  console.log(`[${status}] [${testId}] ${app} - ${scenario}${details ? " (" + details + ")" : ""}`);
}

async function runBrowserTests() {
  console.log("=== KALASAG AI 2.0 BROWSER ACCEPTANCE TESTING SUITE ===");
  console.log("Launching system Chrome via Playwright...");

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });

  // Pre-generate auth sessions via Supabase Admin API with retry
  console.log("\nGenerating authenticated test sessions...");
  async function getSessionWithRetry(email, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({ type: "magiclink", email });
        if (linkErr || !linkData?.properties?.hashed_token) {
          if (attempt === maxRetries) throw new Error(`Failed to generate link for ${email}: ${linkErr?.message || "No hashed token"}`);
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        const client = createClient(supabaseUrl, publishableKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: authData, error: authErr } = await client.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: "magiclink",
        });
        if (authErr || !authData?.session) {
          if (attempt === maxRetries) throw new Error(`Failed to verify OTP for ${email}: ${authErr?.message || "No session"}`);
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        return authData.session;
      } catch (e) {
        if (attempt === maxRetries) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  const residentSession = await getSessionWithRetry(residentEmail);
  const adminSession = await getSessionWithRetry(adminEmail);

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const authKey = `sb-${projectRef}-auth-token`;

  // -------------------------------------------------------------
  // PART A: RESIDENT WEB (http://localhost:3001)
  // -------------------------------------------------------------
  console.log("\n--- PART A: RESIDENT WEB ACCEPTANCE ---");
  const resContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, // Mobile first
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  });
  const resPage = await resContext.newPage();

  // Test RW-01: Login Screen Rendering
  try {
    await resPage.goto("http://localhost:3001", { waitUntil: "networkidle" });
    const title = await resPage.title();
    const hasBranding = await resPage.locator("text=KALASAG AI").isVisible();
    const hasEmail = await resPage.locator('input[type="email"]').isVisible();
    const hasPassword = await resPage.locator('input[type="password"]').isVisible();
    const hasSubmit = await resPage.locator('button:has-text("Sign in"), button:has-text("Login")').isVisible();
    record("RW-01", "Resident Web", "Login screen rendering & branding", hasBranding && hasEmail && hasPassword && hasSubmit, `title: ${title}`);
  } catch (err) {
    record("RW-01", "Resident Web", "Login screen rendering & branding", false, err.message);
  }

  // Test RW-02: Invalid Login Feedback
  try {
    await resPage.fill('input[type="email"]', "invalid.resident@example.com");
    await resPage.fill('input[type="password"]', "WrongPassword123!");
    await resPage.click('button:has-text("Sign in"), button:has-text("Login")');
    await resPage.waitForTimeout(1500);
    const hasError = await resPage.locator(".error, .text-red-500, [role='alert'], .text-error").isVisible() ||
                     (await resPage.content()).includes("Invalid") ||
                     (await resPage.content()).includes("credentials");
    record("RW-02", "Resident Web", "Invalid credential error feedback", hasError);
  } catch (err) {
    record("RW-02", "Resident Web", "Invalid credential error feedback", false, err.message);
  }

  // Test RW-03: Responsive Mobile Viewports (360px, 390px, 430px)
  try {
    let noHorizontalScroll = true;
    for (const width of [360, 390, 430]) {
      await resPage.setViewportSize({ width, height: 800 });
      await resPage.waitForTimeout(300);
      const scrollWidth = await resPage.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await resPage.evaluate(() => document.documentElement.clientWidth);
      if (scrollWidth > clientWidth) noHorizontalScroll = false;
    }
    record("RW-03", "Resident Web", "Mobile viewports without horizontal overflow (360, 390, 430px)", noHorizontalScroll);
  } catch (err) {
    record("RW-03", "Resident Web", "Mobile viewports without horizontal overflow", false, err.message);
  }

  // Test RW-04: Session Authentication & Resident Dashboard
  try {
    await resContext.addCookies([
      {
        name: authKey,
        value: JSON.stringify(residentSession),
        domain: "localhost",
        path: "/",
      },
    ]);
    await resPage.goto("http://localhost:3001/dashboard", { waitUntil: "networkidle" });
    await resPage.waitForSelector(".resident-map-canvas, .leaflet-container, .resident-layout", { timeout: 10000 });
    const mapPresent = await resPage.locator(".resident-map-canvas, .leaflet-container").first().isVisible();
    record("RW-04", "Resident Web", "Authenticated resident dashboard & map display", mapPresent);
  } catch (err) {
    record("RW-04", "Resident Web", "Authenticated resident dashboard & map display", false, err.message);
  }

  // Test RW-05: Report History List (`/reports`)
  try {
    await resPage.goto("http://localhost:3001/reports", { waitUntil: "networkidle" });
    await resPage.waitForTimeout(2000);
    const hasIncidentRef = (await resPage.content()).includes(testIncidentRef);
    record("RW-05", "Resident Web", "Report history displays test incident reference", hasIncidentRef, testIncidentRef);
  } catch (err) {
    record("RW-05", "Resident Web", "Report history displays test incident reference", false, err.message);
  }

  // Test RW-06: Incident Detail View (`/reports/[id]`)
  try {
    await resPage.goto(`http://localhost:3001/reports/${testIncidentId}`, { waitUntil: "networkidle" });
    await resPage.waitForTimeout(2500);
    const pageText = await resPage.content();
    const hasRef = pageText.includes(testIncidentRef);
    const hasPending = pageText.includes("RECEIVED") || pageText.includes("pending");
    const hasLocation = pageText.includes("Gumaca") || pageText.includes("Poblacion");
    const hasFire = pageText.includes("fire") || pageText.includes("Fire");
    const hasLow = pageText.includes("low") || pageText.includes("Low");
    const hasImage = await resPage.locator('img[src*="incident-evidence"]').isVisible();

    // Privacy checks
    const leaksNotes = pageText.includes("Verified during automated acceptance testing");
    const leaksRationale = pageText.includes("The description explicitly states this is a simulation test");

    record("RW-06", "Resident Web", "Incident detail data display (ref, status, location, image, review)", hasRef && hasPending && hasLocation && (hasFire || hasLow));
    record("RW-07", "Resident Web", "Privacy Guard: Staff review notes hidden from resident", !leaksNotes);
    record("RW-08", "Resident Web", "Privacy Guard: Raw Gemini AI rationale hidden from resident", !leaksRationale);
    record("RW-09", "Resident Web", "Signed photo evidence rendering", hasImage);
  } catch (err) {
    record("RW-06", "Resident Web", "Incident detail view", false, err.message);
  }

  // Test RW-10: Non-existent Incident Error Handling
  try {
    await resPage.goto("http://localhost:3001/reports/00000000-0000-0000-0000-000000000000", { waitUntil: "networkidle" });
    await resPage.waitForTimeout(2000);
    const content = await resPage.content();
    const handled = content.includes("unavailable") || content.includes("not found") || content.includes("Report not found") || content.includes("Return to My Reports");
    record("RW-10", "Resident Web", "Non-existent incident clean error feedback", handled);
  } catch (err) {
    record("RW-10", "Resident Web", "Non-existent incident clean error feedback", false, err.message);
  }

  await resContext.close();

  // -------------------------------------------------------------
  // PART B: PERSONNEL WEB (http://localhost:3000)
  // -------------------------------------------------------------
  console.log("\n--- PART B: PERSONNEL WEB 6-MODULE ACCEPTANCE ---");
  const staffContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }, // Desktop
  });
  const staffPage = await staffContext.newPage();

  // Test PW-01: Personnel Login Screen
  try {
    await staffPage.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    const hasBrand = await staffPage.locator("text=KALASAG AI").isVisible();
    const hasForm = await staffPage.locator('input[type="email"]').isVisible() &&
                    await staffPage.locator('input[type="password"]').isVisible();
    record("PW-01", "Personnel Web", "Login screen rendering & personnel branding", hasBrand && hasForm);
  } catch (err) {
    record("PW-01", "Personnel Web", "Login screen rendering", false, err.message);
  }

  // Set Super Admin authentication
  await staffContext.addCookies([
    {
      name: authKey,
      value: JSON.stringify(adminSession),
      domain: "localhost",
      path: "/",
    },
  ]);

  // Test PW-02: Module 1 — Maps and Reports (/dashboard)
  try {
    await staffPage.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle" });
    await staffPage.waitForTimeout(2500);
    const hasMap = await staffPage.locator(".leaflet-container, #map").isVisible();
    const hasNav = await staffPage.locator("text=Maps & Reports, text=Blotters").first().isVisible();
    const pageText = await staffPage.content();
    const hasCategories = pageText.includes("All Categories") || pageText.includes("Filter") || pageText.includes("Fire");
    record("PW-02", "Personnel Web", "Module 1: Maps and Reports interactive map & filters", (hasMap || hasNav) && hasCategories);
  } catch (err) {
    record("PW-02", "Personnel Web", "Module 1: Maps and Reports", false, err.message);
  }

  // Test PW-03: Module 2 — Incident Blotters List (/dashboard/blotters)
  try {
    await staffPage.goto("http://localhost:3000/dashboard/blotters", { waitUntil: "networkidle" });
    await staffPage.waitForTimeout(2000);
    const hasBlotter = (await staffPage.content()).includes(testIncidentRef);
    record("PW-03", "Personnel Web", "Module 2: Incident Blotters list displays test incident", hasBlotter, testIncidentRef);
  } catch (err) {
    record("PW-03", "Personnel Web", "Module 2: Incident Blotters list", false, err.message);
  }

  // Test PW-04: Module 2 — Blotter Detail View (/dashboard/blotters/[id])
  try {
    await staffPage.goto(`http://localhost:3000/dashboard/blotters/${testIncidentId}`, { waitUntil: "networkidle" });
    await staffPage.waitForTimeout(2500);
    const text = await staffPage.content();

    const hasRef = text.includes(testIncidentRef);
    const hasPending = text.includes("pending");
    const hasFire = text.includes("fire");
    const hasLow = text.includes("low");
    const hasModel = text.includes("gemini-3.5-flash-lite");
    const hasRationale = text.includes("simulation test with no real emergency");
    const hasHumanVerify = text.includes("HUMAN VERIFICATION REQUIRED") || text.includes("verify or correct");
    const hasContact = text.includes("+639599857401");

    record("PW-04", "Personnel Web", "Module 2: Blotter detail displays AI suggested category & priority", hasRef && hasFire && hasLow);
    record("PW-05", "Personnel Web", "Module 2: Blotter detail displays real Gemini model & rationale", hasModel && hasRationale);
    record("PW-06", "Personnel Web", "Module 2: Human Verification Required advisory & review section", hasHumanVerify);
    record("PW-07", "Personnel Web", "Module 2: Role-based reporter contact number visibility", hasContact);
  } catch (err) {
    record("PW-04", "Personnel Web", "Module 2: Blotter detail view", false, err.message);
  }

  // Test PW-08: Module 3 — Analytics & Reports (/dashboard/analytics)
  try {
    await staffPage.goto("http://localhost:3000/dashboard/analytics", { waitUntil: "networkidle" });
    await staffPage.waitForTimeout(2500);
    const text = await staffPage.content();
    const hasMetrics = text.includes("Total Reports") || text.includes("Accuracy") || text.includes("Incidents");
    const hasCanvas = await staffPage.locator("canvas").first().isVisible();
    record("PW-08", "Personnel Web", "Module 3: Analytics & Reports metrics & charts rendering", hasMetrics && hasCanvas);
  } catch (err) {
    record("PW-08", "Personnel Web", "Module 3: Analytics & Reports", false, err.message);
  }

  // Test PW-09: Module 4 — AI Volume & Surge (/dashboard/surge)
  try {
    await staffPage.goto("http://localhost:3000/dashboard/surge", { waitUntil: "networkidle" });
    await staffPage.waitForTimeout(2000);
    const text = await staffPage.content();
    const hasSurge = text.includes("Surge") || text.includes("Volume") || text.includes("Threshold");
    record("PW-09", "Personnel Web", "Module 4: AI Volume & Surge advisory threshold rendering", hasSurge);
  } catch (err) {
    record("PW-09", "Personnel Web", "Module 4: AI Volume & Surge", false, err.message);
  }

  // Test PW-10: Module 5 — Activity Logs (/dashboard/activity)
  try {
    await staffPage.goto("http://localhost:3000/dashboard/activity", { waitUntil: "networkidle" });
    await staffPage.waitForTimeout(2000);
    const text = await staffPage.content();
    const hasSubmitted = text.includes("incident.submitted");
    const hasAssessed = text.includes("incident.ai_assessed");
    const hasReviewed = text.includes("incident.classification_reviewed");
    record("PW-10", "Personnel Web", "Module 5: Activity Logs complete 3-step audit chain", hasSubmitted && hasAssessed && hasReviewed);
  } catch (err) {
    record("PW-10", "Personnel Web", "Module 5: Activity Logs", false, err.message);
  }

  // Test PW-11: Module 6 — Admin Controls (/dashboard/admin)
  try {
    await staffPage.goto("http://localhost:3000/dashboard/admin", { waitUntil: "networkidle" });
    await staffPage.waitForTimeout(2000);
    const text = await staffPage.content();
    const hasAdmin = text.includes("Personnel") || text.includes("Staff") || text.includes("Role") || text.includes("Super Admin");
    record("PW-11", "Personnel Web", "Module 6: Admin Controls staff directory & role permissions", hasAdmin);
  } catch (err) {
    record("PW-11", "Personnel Web", "Module 6: Admin Controls", false, err.message);
  }

  // Test PW-12: Desktop to Tablet Responsiveness & Theme Toggle
  try {
    await staffPage.setViewportSize({ width: 768, height: 1024 }); // Tablet
    await staffPage.waitForTimeout(300);
    const hasNav = await staffPage.locator("nav, [role='navigation'], header").first().isVisible();
    // Test dark/light toggle if available
    const themeButton = staffPage.locator('button[aria-label*="theme"], button:has-text("Theme"), button:has([data-icon="sun"]), button:has([data-icon="moon"])').first();
    if (await themeButton.isVisible()) {
      await themeButton.click();
      await staffPage.waitForTimeout(300);
    }
    record("PW-12", "Personnel Web", "Responsive tablet layout & navigation stability", hasNav);
  } catch (err) {
    record("PW-12", "Personnel Web", "Responsive layout", false, err.message);
  }

  await staffContext.close();
  await browser.close();

  console.log("\n=== BROWSER ACCEPTANCE TESTS SUMMARY ===");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`Total Tests: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error("Some browser acceptance tests failed!");
    process.exit(1);
  } else {
    console.log("ALL BROWSER ACCEPTANCE TESTS PASSED SUCCESSFULLY! ✅");
  }
}

runBrowserTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
