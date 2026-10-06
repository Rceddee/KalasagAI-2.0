/**
 * Backfill script — assigns permanent `report_id` and `blotter_id` to any
 * incident_reports documents that are missing them.
 *
 * Uses Firebase Admin SDK to bypass Firestore security rules.
 *
 * Run from the kalasag-dashboard directory:
 *   node scripts/backfill-report-ids.mjs
 */

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load environment variables
config({ path: ".env.local" });

// Try to find a service account key, otherwise use application default credentials
const saKeyPath = resolve("serviceAccountKey.json");
let app;

if (existsSync(saKeyPath)) {
  const serviceAccount = JSON.parse(readFileSync(saKeyPath, "utf8"));
  app = initializeApp({ credential: cert(serviceAccount) });
  console.log(`🔑 Using service account key: ${saKeyPath}`);
} else {
  // Use the project ID from env and application default credentials (gcloud CLI)
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error("❌ Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local and no serviceAccountKey.json found.");
    console.error("   Option 1: Place a service account JSON at kalasag-dashboard/serviceAccountKey.json");
    console.error("   Option 2: Run 'gcloud auth application-default login' and set NEXT_PUBLIC_FIREBASE_PROJECT_ID");
    process.exit(1);
  }
  try {
    app = initializeApp({ credential: applicationDefault(), projectId });
    console.log(`🔑 Using application default credentials for project: ${projectId}`);
  } catch (e) {
    console.error("❌ Could not initialize with application default credentials.");
    console.error("   Download a service account key from Firebase Console → Project Settings → Service Accounts");
    console.error("   Save it as: kalasag-dashboard/serviceAccountKey.json");
    process.exit(1);
  }
}

const db = getFirestore(app);

function pad(n) {
  return String(n).padStart(2, "0");
}

function extractNumber(idStr) {
  if (!idStr) return 0;
  const m = String(idStr).match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
}

async function backfill() {
  console.log("───────────────────────────────────────────────");

  // 1. Fetch all incident reports
  const snapshot = await db.collection("incident_reports").get();
  const allReports = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`📄 Total incident_reports: ${allReports.length}`);

  if (allReports.length === 0) {
    console.log("No reports found. Nothing to do.");
    return;
  }

  // 2. Sort by report_date (oldest first) for chronological numbering
  allReports.sort((a, b) => {
    const timeA = a.report_date?._seconds ? a.report_date._seconds * 1000
      : (a.report_date?.seconds ? a.report_date.seconds * 1000
        : (a.created_at ? new Date(a.created_at).getTime() : 0));
    const timeB = b.report_date?._seconds ? b.report_date._seconds * 1000
      : (b.report_date?.seconds ? b.report_date.seconds * 1000
        : (b.created_at ? new Date(b.created_at).getTime() : 0));
    return timeA - timeB;
  });

  // 3. Find reports with/without IDs
  let maxExistingNumber = 0;
  const reportsWithIds = [];
  const reportsMissingIds = [];

  for (const report of allReports) {
    const existingNum = extractNumber(report.report_id);
    if (existingNum > 0) {
      reportsWithIds.push(report);
      if (existingNum > maxExistingNumber) maxExistingNumber = existingNum;
    } else {
      reportsMissingIds.push(report);
    }
  }

  console.log(`✅ Reports with existing IDs: ${reportsWithIds.length} (max number: ${maxExistingNumber})`);
  console.log(`⚠️  Reports MISSING IDs: ${reportsMissingIds.length}`);

  // Read current counter
  const counterRef = db.doc("system_config/report_counter");
  const counterSnap = await counterRef.get();
  const currentCounter = counterSnap.exists ? (counterSnap.data().incident_count || 0) : 0;
  console.log(`🔢 Current counter value: ${currentCounter}`);

  if (reportsMissingIds.length === 0) {
    console.log("\n🎉 All reports already have IDs. Nothing to backfill.");
    const correctCounter = Math.max(currentCounter, maxExistingNumber);
    if (currentCounter !== correctCounter) {
      await counterRef.set({ incident_count: correctCounter });
      console.log(`🔄 Counter synced: ${currentCounter} → ${correctCounter}`);
    } else {
      console.log(`✔️  Counter already correct: ${currentCounter}`);
    }
    return;
  }

  // 4. Assign sequential IDs to missing reports
  let nextNumber = Math.max(maxExistingNumber, currentCounter) + 1;
  const updates = [];

  console.log("\n📋 Assigning IDs to reports (oldest first):");
  for (const report of reportsMissingIds) {
    const reportId = `REPORT ${pad(nextNumber)}`;
    const blotterId = `BLOTTER ${pad(nextNumber)}`;
    const dateStr = report.report_date?._seconds
      ? new Date(report.report_date._seconds * 1000).toISOString()
      : (report.report_date?.seconds
        ? new Date(report.report_date.seconds * 1000).toISOString()
        : (report.created_at || "unknown date"));

    console.log(`   ${reportId} / ${blotterId}  ←  doc ${report.id}  (${dateStr})`);
    updates.push({ docId: report.id, reportId, blotterId });
    nextNumber++;
  }

  // 5. Write updates in batches (500 ops max per batch)
  console.log("\n⏳ Writing to Firestore...");
  const BATCH_LIMIT = 250; // 2 writes per report
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const chunk = updates.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    for (const { docId, reportId, blotterId } of chunk) {
      batch.update(db.doc(`incident_reports/${docId}`), { report_id: reportId, blotter_id: blotterId });
      // Also update public_incidents if it exists
      const pubRef = db.doc(`public_incidents/${docId}`);
      const pubSnap = await pubRef.get();
      if (pubSnap.exists) {
        batch.update(pubRef, { report_id: reportId, blotter_id: blotterId });
      }
    }

    await batch.commit();
    console.log(`   ✅ Batch ${Math.floor(i / BATCH_LIMIT) + 1} committed (${chunk.length} reports)`);
  }

  // 6. Update the counter
  const finalCount = nextNumber - 1;
  await counterRef.set({ incident_count: finalCount });
  console.log(`\n🔄 Counter updated to: ${finalCount}`);

  console.log("\n🎉 Backfill complete!");
  console.log(`   ${updates.length} reports now have permanent IDs.`);
}

backfill().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
