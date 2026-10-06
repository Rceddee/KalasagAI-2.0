import { doc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";

export async function allocateReportNumbers(): Promise<{
  report_id: string;
  blotter_id: string;
  seq: number;
}> {
  const counterRef = doc(db, "system_config", "report_counter");
  const seq = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    const current = snap.exists() ? Number(snap.data()?.incident_count) || 0 : 0;
    const next = current + 1;
    transaction.set(counterRef, { incident_count: next });
    return next;
  });

  const padded = seq.toString().padStart(2, "0");
  return {
    report_id: `REPORT ${padded}`,
    blotter_id: `BLOTTER ${padded}`,
    seq,
  };
}
