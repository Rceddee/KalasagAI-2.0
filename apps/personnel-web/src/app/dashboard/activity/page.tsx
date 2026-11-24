"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { downloadRecordsPdf } from "@/lib/pdf-export";
import { DownloadIcon, RefreshIcon, SearchIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import type { ActivityCategory } from "@/lib/activity-format";
import { formatActivityTimestamp, getActivityPresentation } from "@/lib/activity-format";
import type { AuditLogRecord } from "@/lib/types";

const maxRows = 500;

const activityFilters: Array<{ value: ActivityCategory | "all"; label: string }> = [
  { value: "all", label: "All activity" },
  { value: "report", label: "Incident reports" },
  { value: "status", label: "Status updates" },
  { value: "classification", label: "AI suggestion reviews" },
  { value: "ai", label: "AI activity" },
  { value: "system", label: "System settings" },
  { value: "personnel", label: "Staff changes" },
  { value: "other", label: "Other activity" },
];

export default function ActivityLogsPage() {
  const toast = useToast();
  const request = useRef(0);
  const [entries, setEntries] = useState<AuditLogRecord[]>([]);
  const [incidentReferences, setIncidentReferences] = useState<Record<string, string>>({});
  const [referenceError, setReferenceError] = useState(false);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [actorLookupError, setActorLookupError] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | "all">("all");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const version = ++request.current;
    try {
      const { data, error: queryError } = await getSupabase()
        .from("audit_logs")
        .select("id, actor_id, action, incident_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(maxRows);

      if (queryError) throw queryError;
      const records = (data as AuditLogRecord[]) || [];
      const incidentIds = Array.from(new Set(records.flatMap((entry) => entry.incident_id ? [entry.incident_id] : [])));
      const actorIds = Array.from(new Set(records.flatMap((entry) => entry.actor_id ? [entry.actor_id] : [])));
      const nextReferences: Record<string, string> = {};
      const nextActorNames: Record<string, string> = {};
      let referencesUnavailable = false;
      let actorsUnavailable = false;
      if (incidentIds.length > 0) {
        try {
          const { data: incidents, error: referencesError } = await getSupabase()
            .from("incidents")
            .select("id, reference")
            .in("id", incidentIds);
          if (referencesError) throw referencesError;
          for (const incident of incidents ?? []) {
            nextReferences[incident.id] = incident.reference;
          }
        } catch (reason: unknown) {
          referencesUnavailable = true;
          console.warn("Could not load incident references for activity log:", reason);
        }
      }
      if (actorIds.length > 0) {
        try {
          const { data: actorResult, error: actorError } = await getSupabase()
            .functions.invoke<{ actors: Array<{ id: string; full_name: string }> }>(
              "manage-personnel",
              { body: { action: "list-audit-actors", actorIds } },
            );
          if (actorError) throw actorError;
          if (!actorResult || !Array.isArray(actorResult.actors)) {
            throw new Error("The activity actor lookup returned an invalid response.");
          }
          for (const actor of actorResult.actors) {
            if (typeof actor.id === "string" && typeof actor.full_name === "string" && actor.full_name.trim()) {
              nextActorNames[actor.id] = actor.full_name.trim();
            }
          }
        } catch (reason: unknown) {
          actorsUnavailable = true;
          console.error("Could not resolve activity actors:", reason);
        }
      }
      if (request.current !== version) return false;
      setError(false);
      setReferenceError(referencesUnavailable);
      setIncidentReferences(nextReferences);
      setActorLookupError(actorsUnavailable);
      setActorNames(nextActorNames);
      setEntries(records);
      setLoading(false);
      return true;
    } catch (reason: unknown) {
      if (request.current !== version) return false;
      setError(true);
      console.error("Failed to load audit logs:", reason);
      toast.error("Could not load activity log.");
      setLoading(false);
      return false;
    }
  }, [toast]);

  useEffect(() => {
    const currentRequest = request;
    let active = true;
    queueMicrotask(() => { if (active) void load(); });

    const channel = getSupabase()
      .channel("audit-logs-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => void load())
      .subscribe();

    return () => {
      active = false;
      currentRequest.current++;
      void getSupabase().removeChannel(channel);
    };
  }, [load]);

  const presentedEntries = useMemo(
    () => entries.map((entry) => ({
      entry,
      presentation: getActivityPresentation(
        entry,
        entry.incident_id ? incidentReferences[entry.incident_id] : undefined,
        entry.actor_id ? actorNames[entry.actor_id] : undefined,
      ),
    })),
    [actorNames, entries, incidentReferences],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return presentedEntries.filter(({ entry, presentation }) => {
      if (categoryFilter !== "all" && presentation.category !== categoryFilter) return false;
      if (!term) return true;
      const searchable = [
        entry.action,
        presentation.categoryLabel,
        presentation.title,
        presentation.summary,
        presentation.actor,
        presentation.incident,
        ...presentation.details,
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(term);
    });
  }, [categoryFilter, presentedEntries, search]);

  const summary = useMemo(() => ({
    total: entries.length,
    incidentReports: presentedEntries.filter(({ presentation }) => presentation.category === "report").length,
    staffActions: presentedEntries.filter(({ presentation }) =>
      ["status", "classification", "personnel"].includes(presentation.category),
    ).length,
    automated: presentedEntries.filter(({ presentation }) =>
      presentation.actor === "System" || presentation.actor === "Automated AI service",
    ).length,
  }), [entries.length, presentedEntries]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const refreshed = await load();
    setRefreshing(false);
    if (refreshed) toast.info("Activity log refreshed.");
  };

  const handleExportPdf = () => {
    downloadRecordsPdf({
      title: "MDRRMO KALASAG AI SYSTEM ACTIVITY LOG",
      filename: `KALASAG_ACTIVITY_LOG_${new Date().toISOString().slice(0, 10)}`,
      headers: ["Date and time", "Activity", "Summary", "Person or system", "Report", "Details"],
      rows: filtered.map(({ entry, presentation }) => [
        formatActivityTimestamp(entry.created_at),
        presentation.title,
        presentation.summary,
        presentation.actor,
        presentation.incident,
        presentation.details.join(" · ") || "No additional details",
      ]),
    });
  };

  return (
    <div className="activity-page">
      <header className="header activity-header" id="activity-header">
        <div className="header-title-sec">
          <h2>Activity log</h2>
          <p>A clear record of report, staff, and system updates.</p>
        </div>
        <div className="activity-header-actions">
          <button
            className="btn btn-google activity-action-button"
            disabled={loading || refreshing}
            onClick={() => void handleRefresh()}
            type="button"
          >
            <RefreshIcon size={14} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
          <button
            className="btn btn-google activity-action-button"
            disabled={loading || filtered.length === 0}
            onClick={handleExportPdf}
            type="button"
          >
            <DownloadIcon size={14} />
            <span>Export PDF</span>
          </button>
        </div>
      </header>

      <div className="page-content activity-content" id="activity-content">
        <section className="activity-summary-grid" aria-label="Activity summary">
          <div className="activity-summary-card"><span>Recent events</span><strong>{summary.total}</strong></div>
          <div className="activity-summary-card"><span>Incident reports</span><strong>{summary.incidentReports}</strong></div>
          <div className="activity-summary-card"><span>Personnel actions</span><strong>{summary.staffActions}</strong></div>
          <div className="activity-summary-card"><span>Automatic system updates</span><strong>{summary.automated}</strong></div>
        </section>

        <section className="activity-toolbar" aria-label="Search and filter activity">
          <div className="page-search-wrapper">
            <span className="page-search-icon"><SearchIcon size={18} /></span>
            <input
              aria-label="Search activity"
              className="page-search-input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reports, status changes, actors, or details"
              type="search"
              value={search}
            />
          </div>
          <label className="activity-filter-field">
            <span>Activity type</span>
            <select
              className="page-filter-select"
              onChange={(event) => setCategoryFilter(event.target.value as ActivityCategory | "all")}
              value={categoryFilter}
            >
              {activityFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </label>
        </section>

        <div className="activity-results-line" aria-live="polite">
          <span>
            Showing {filtered.length} of {entries.length} recent {entries.length === 1 ? "event" : "events"}
            {entries.length === maxRows ? " (latest 500)" : ""}
          </span>
          <span>Times shown in Philippine local time</span>
        </div>

        {referenceError && (
          <div className="activity-reference-note" role="status">
            Report reference numbers could not be loaded. Short report IDs are shown instead.
          </div>
        )}
        {actorLookupError && (
          <div className="activity-reference-note" role="alert">
            Staff names could not be loaded. Account IDs are shown where names are unavailable.
          </div>
        )}

        {error && entries.length > 0 && (
          <div className="activity-error" role="alert">
            Could not check for new events. The last loaded activity is still shown.
            <button type="button" onClick={() => void handleRefresh()}>Try again</button>
          </div>
        )}

        <div className="data-table-card activity-table-card">
          <div className="data-table-scroll">
            {loading ? (
              <div className="activity-state-message" role="status">Loading recent activity…</div>
            ) : error && entries.length === 0 ? (
              <div className="activity-state-message" role="alert">
                <strong>Activity records are unavailable.</strong>
                <button className="btn btn-google" onClick={() => void handleRefresh()} type="button">Retry</button>
              </div>
            ) : (
              <table className="data-table activity-table">
                <thead>
                  <tr>
                    <th scope="col">Date and time</th>
                    <th scope="col">Activity</th>
                    <th scope="col">Person or system</th>
                    <th scope="col">Report</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr className="empty-row">
                      <td colSpan={5}>
                        {entries.length === 0
                          ? "No activity has been recorded yet."
                          : "No activity matches your search or selected type."}
                      </td>
                    </tr>
                  ) : (
                    filtered.map(({ entry, presentation }) => (
                      <tr key={entry.id}>
                        <td className="activity-time-cell">
                          <time dateTime={entry.created_at}>{formatActivityTimestamp(entry.created_at)}</time>
                        </td>
                        <td className="activity-description-cell">
                          <span className={`activity-category activity-category-${presentation.category}`}>
                            {presentation.categoryLabel}
                          </span>
                          <strong>{presentation.title}</strong>
                          <span>{presentation.summary}</span>
                        </td>
                        <td>{presentation.actor}</td>
                        <td className="activity-incident-cell">{presentation.incident}</td>
                        <td>
                          {presentation.details.length > 0 ? (
                            <ul className="activity-detail-list">
                              {presentation.details.map((detail) => <li key={detail}>{detail}</li>)}
                            </ul>
                          ) : <span className="activity-no-details">No additional details</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
