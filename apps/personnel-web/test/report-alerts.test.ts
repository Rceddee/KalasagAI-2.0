import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as flush } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { listenForNewReports, type ReportArrival } from "../src/lib/report-alerts";

test("alert once per incident across live inserts, catch-up reads, and dashboard cleanup", async (t) => {
  const history = { id: "01", reference: "OLD", created_at: "2026-11-24T01:00:00Z" };
  const live = { ...history, id: "02", reference: "LIVE", created_at: "2026-11-24T02:00:00Z" };
  const missed = { ...live, id: "03", reference: "MISSED" };
  const queries: URL[] = [];
  let catchUpRows: ReportArrival[] = [];
  const client = createClient("https://fixture.invalid", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      queries.push(url);
      return Response.json(url.searchParams.get("limit") === "1" ? [history] : catchUpRows);
    } },
  });

  const channel = client.channel("fixture");
  let insert!: (payload: { new: ReportArrival }) => void;
  t.mock.method(channel, "on", (type: string, filter: { event: string; table: string }, callback: typeof insert) => {
    assert.equal(type, "postgres_changes");
    assert.equal(filter.event, "INSERT");
    assert.equal(filter.table, "incidents");
    insert = callback;
    return channel;
  });
  t.mock.method(channel, "subscribe", () => channel);
  t.mock.method(client, "channel", () => channel);
  const remove = t.mock.method(client, "removeChannel", async () => "ok");
  const events = Object.assign(new EventTarget(), { setInterval: () => 1, clearInterval: () => {} });
  Object.defineProperty(globalThis, "window", { configurable: true, value: events });
  t.after(() => Reflect.deleteProperty(globalThis, "window"));

  const arrivals: string[] = [];
  const stop = listenForNewReports(client, (rows) => arrivals.push(...rows.map((row) => row.reference)));
  await flush();
  assert.deepEqual(arrivals, []);
  assert.match(queries[1].searchParams.get("or") ?? "", /id.gt.01/);

  insert({ new: live });
  assert.deepEqual(arrivals, ["LIVE"]);
  catchUpRows = [live, missed];
  events.dispatchEvent(new Event("focus"));
  await flush();
  insert({ new: missed });
  assert.deepEqual(arrivals, ["LIVE", "MISSED"]);

  catchUpRows = [];
  events.dispatchEvent(new Event("focus"));
  await flush();
  assert.match(queries.at(-1)?.searchParams.get("or") ?? "", /id.gt.03/);
  stop();
  const reads = queries.length;
  events.dispatchEvent(new Event("focus"));
  insert({ new: { ...missed, id: "04" } });
  assert.equal(queries.length, reads);
  assert.deepEqual(arrivals, ["LIVE", "MISSED"]);
  assert.equal(remove.mock.callCount(), 1);
});
