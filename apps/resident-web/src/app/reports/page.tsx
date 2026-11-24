"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ResidentShell } from "@/components/ResidentShell";
import { useResidentAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";
import { RefreshIcon, PinIcon, ClipboardIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import type { ResidentIncident } from "@/lib/types";
import type { IncidentStatus } from "@kalasag/shared-validation";

function formatReportDate(dateValue: string): string {
  const date = new Date(dateValue);
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getStatusStyle(status: IncidentStatus) {
  switch (status) {
    case "in_progress":
      return { label: "IN PROGRESS", className: "status-tag-responding" };
    case "resolved":
    case "closed":
      return { label: "COMPLETED", className: "status-tag-completed" };
    default:
      return { label: "RECEIVED", className: "status-tag-received" };
  }
}

export default function MyReportsPage() {
  const { user } = useResidentAuth();
  return <ReportList key={user?.id ?? "signed-out"} userId={user?.id} />;
}

function ReportList({ userId }: { userId?: string }) {
  const toast = useToast();
  const request = useRef(0);
  const [loadError, setLoadError] = useState(false);
  const [reports, setReports] = useState<ResidentIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "all">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const fetchReports = useCallback(async () => {
    if (!userId) return [];
    const { data, error } = await getSupabase()
      .from("incidents")
      .select("id, reference, description, location_label, latitude, longitude, status, created_at")
      .eq("resident_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []) as ResidentIncident[];
  }, [userId]);

  const load = useCallback(async () => {
    const version = ++request.current;
    try {
      const records = await fetchReports();
      if (request.current !== version) return false;
      setLoadError(false);
      setReports(records);
      setLoading(false);
      return true;
    } catch (err: unknown) {
      if (request.current !== version) return false;
      setLoadError(true);
      console.error("Could not load resident reports:", err);
      toast.error("Your reports could not be loaded. Check your connection.");
      setLoading(false);
      return false;
    }
  }, [fetchReports, toast]);

  useEffect(() => {
    const currentRequest = request;
    queueMicrotask(() => {
      void load();
    });

    if (!userId) return;
    const channel = getSupabase()
      .channel(`resident-reports-feed-${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "incidents",
        filter: `resident_id=eq.${userId}`,
      }, () => void load())
      .subscribe();

    return () => {
      currentRequest.current++;
      void getSupabase().removeChannel(channel);
    };
  }, [load, userId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const refreshed = await load();
    setRefreshing(false);
    if (refreshed) toast.info("Reports refreshed.");
  };

  const filteredReports = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    return reports
      .filter((report) => {
        const searchableText = `${report.reference} ${report.description} ${report.location_label}`.toLocaleLowerCase();
        return (!query || searchableText.includes(query))
          && (statusFilter === "all" || report.status === statusFilter);
      })
      .sort((a, b) => {
        const difference = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return sortOrder === "newest" ? -difference : difference;
      });
  }, [reports, searchTerm, sortOrder, statusFilter]);

  const statusCounts = useMemo(() => ({
    all: reports.length,
    pending: reports.filter((report) => report.status === "pending").length,
    in_progress: reports.filter((report) => report.status === "in_progress").length,
    resolved: reports.filter((report) => report.status === "resolved").length,
    closed: reports.filter((report) => report.status === "closed").length,
  }), [reports]);

  const filters: { value: IncidentStatus | "all"; label: string; count: number }[] = [
    { value: "all", label: "All reports", count: statusCounts.all },
    { value: "pending", label: "Received", count: statusCounts.pending },
    { value: "in_progress", label: "In progress", count: statusCounts.in_progress },
    { value: "resolved", label: "Resolved", count: statusCounts.resolved },
    { value: "closed", label: "Closed", count: statusCounts.closed },
  ];

  return (
    <ResidentShell>
      <div className="resident-reports-page">
        <div className="resident-reports-header">
          <div className="resident-reports-heading">
            <span className="resident-reports-eyebrow">Incident tracking</span>
            <h1>My reports</h1>
            <p>Follow the status and response history of incidents you submitted.</p>
          </div>
          <div className="resident-reports-header-actions">
            <button type="button" className="theme-toggle-btn" onClick={handleRefresh} disabled={refreshing}>
              <RefreshIcon size={14} />
              <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
            </button>
            <Link href="/report" className="resident-reports-new-button">File a report</Link>
          </div>
        </div>

        <section className="resident-report-stats" aria-label="Report status summary">
          <div className="resident-report-stat">
            <span>Total reports</span>
            <strong>{statusCounts.all}</strong>
          </div>
          <div className="resident-report-stat">
            <span>Awaiting response</span>
            <strong>{statusCounts.pending}</strong>
          </div>
          <div className="resident-report-stat">
            <span>In progress</span>
            <strong>{statusCounts.in_progress}</strong>
          </div>
          <div className="resident-report-stat">
            <span>Completed</span>
            <strong>{statusCounts.resolved + statusCounts.closed}</strong>
          </div>
        </section>

        <section className="resident-reports-toolbar" aria-label="Search and filter reports">
          <div className="resident-reports-controls">
            <label className="resident-reports-search">
              <span className="sr-only">Search reports</span>
              <input
                type="search"
                placeholder="Search reference, details, or location"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
            <label className="resident-reports-sort">
              <span>Sort by</span>
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>
          <div className="resident-report-filters" aria-label="Filter by status">
            {filters.map((filter) => (
              <button
                aria-pressed={statusFilter === filter.value}
                className={`resident-report-filter${statusFilter === filter.value ? " active" : ""}`}
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                type="button"
              >
                {filter.label}<span>{filter.count}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="resident-reports-result-count" aria-live="polite">
          Showing {filteredReports.length} of {reports.length} {reports.length === 1 ? "report" : "reports"}
        </div>

        {loadError && reports.length > 0 && (
          <div className="resident-reports-error" role="alert">
            Could not check for the latest reports. Your saved results are shown.
            <button type="button" onClick={handleRefresh}>Try again</button>
          </div>
        )}

        <div className="reports-list-container">
          {loading ? (
            <div className="resident-reports-message" role="status">
              Loading your reports…
            </div>
          ) : loadError && reports.length === 0 ? (
            <div className="resident-reports-empty-state" role="alert">
              <strong>Your report history is unavailable</strong>
              <p>Check your connection, then try loading your reports again.</p>
              <button type="button" className="resident-reports-new-button" onClick={handleRefresh}>Try again</button>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="resident-reports-empty-state">
              <ClipboardIcon size={36} color="var(--text-muted)" style={{ margin: "0 auto 12px", display: "block" }} />
              <strong>{reports.length === 0 ? "No reports yet" : "No matching reports"}</strong>
              <p>
                {reports.length === 0
                  ? "When you submit an incident, its status and updates will appear here."
                  : "Try another search or status filter to find the report you need."}
              </p>
              {reports.length === 0 ? (
                <Link href="/report" className="resident-reports-new-button">File your first report</Link>
              ) : (
                <button
                  type="button"
                  className="resident-reports-clear-button"
                  onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}
                >
                  Clear search and filters
                </button>
              )}
            </div>
          ) : (
            filteredReports.map((report) => {
              const statusInfo = getStatusStyle(report.status);

              return (
                <Link
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="resident-report-link"
                >
                  <div className="report-item-card">
                    <div className="report-item-header">
                      <span className="report-item-ref">{report.reference}</span>
                      <span className={statusInfo.className}>{statusInfo.label}</span>
                    </div>

                    <p className="report-item-desc">{report.description}</p>

                    <div className="report-item-footer">
                      <span className="resident-report-card-location">
                        <PinIcon size={12} color="var(--text-muted)" />
                        <span>{report.location_label || "Gumaca, Quezon"}</span>
                      </span>
                      <time dateTime={report.created_at}>{formatReportDate(report.created_at)}</time>
                    </div>
                    <span className="resident-report-open-hint">View report details →</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </ResidentShell>
  );
}
