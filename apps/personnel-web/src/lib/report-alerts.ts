import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReportArrival {
  id: string;
  reference: string;
  created_at: string;
}

// Realtime delivers inserts immediately. The read cursor catches up across
// disconnects without fetching descriptions, evidence, or AI assessments.
export function listenForNewReports(client: SupabaseClient, notify: (reports: ReportArrival[]) => void) {
  const seen = new Set<string>();
  const abort = new AbortController();
  let initialized = false;
  let reading = false;
  let cursor: ReportArrival | undefined;

  function deliver(rows: ReportArrival[]) {
    if (abort.signal.aborted) return;
    const fresh = rows.filter((row) => {
      if (!row.id || !row.reference || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
    if (fresh.length) notify(fresh);
  }

  async function catchUp() {
    if (reading || abort.signal.aborted) return;
    reading = true;
    try {
      // Establish the baseline on the database clock. Old reports stay quiet.
      if (!initialized) {
        const { data, error } = await client.from("incidents").select("id,reference,created_at")
          .order("created_at", { ascending: false }).order("id", { ascending: false })
          .limit(1).abortSignal(abort.signal);
        if (error || abort.signal.aborted) return;
        cursor = data?.[0];
        initialized = true;
      }

      const pageSize = 100;
      while (!abort.signal.aborted) {
        let query = client.from("incidents").select("id,reference,created_at")
          .order("created_at").order("id").limit(pageSize);
        if (cursor) {
          query = query.or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`);
        }
        const { data, error } = await query.abortSignal(abort.signal);
        if (error || !data?.length || abort.signal.aborted) return;
        deliver(data);
        cursor = data[data.length - 1];
        if (data.length < pageSize) return;
      }
    } finally {
      reading = false;
    }
  }

  void catchUp();
  const channel = client.channel("personnel-new-report-alerts")
    .on<ReportArrival>("postgres_changes", { event: "INSERT", schema: "public", table: "incidents" },
      ({ new: row }) => deliver([row]))
    .subscribe((status) => { if (status === "SUBSCRIBED") void catchUp(); });
  const timer = window.setInterval(catchUp, 20000);
  window.addEventListener("focus", catchUp);
  window.addEventListener("online", catchUp);
  return () => {
    abort.abort();
    window.clearInterval(timer);
    window.removeEventListener("focus", catchUp);
    window.removeEventListener("online", catchUp);
    void client.removeChannel(channel);
  };
}
