"use client";
import { canTransitionIncidentStatus } from "@kalasag/shared-validation";
import { useDashboardAuth } from "@/components/DashboardAuth";
import { canManageIncidents } from "@/lib/role-access";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { fetchStaffIncidents, priorityLabel, categoryLabel } from "@/lib/incidents";
import { downloadSingleBlotterPdf, downloadRecordsPdf } from "@/lib/pdf-export";
import { SearchIcon, DownloadIcon, CloseIcon, RefreshIcon, MapIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import type { IncidentStatus } from "@kalasag/shared-validation";
import type { IncidentRecord } from "@/lib/types";

const IncidentLocationMap = dynamic(
  () => import("@/components/IncidentLocationMap"),
  {
    ssr: false,
    loading: () => (
      <div className="incident-location-map-loading" role="status">
        Loading map…
      </div>
    ),
  },
);

const CATEGORY_BADGES: Record<string, { class: string; label: string }> = {
  flooding: { class: "badge-blue", label: "Flooding" },
  "fire incident": { class: "badge-red", label: "Fire" },
  fire: { class: "badge-red", label: "Fire" },
  "road obstruction": { class: "badge-orange", label: "Road Obstruction" },
  road_obstruction: { class: "badge-orange", label: "Road Obstruction" },
  "road accident": { class: "badge-orange", label: "Road Accident" },
  road_accident: { class: "badge-orange", label: "Road Accident" },
  "medical emergency": { class: "badge-yellow", label: "Medical" },
  medical_emergency: { class: "badge-yellow", label: "Medical" },
  "other disaster-related incidents": { class: "badge-green", label: "Other" },
  other: { class: "badge-green", label: "Other" },
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "status-pending",
  in_progress: "status-inprogress",
  resolved: "status-resolved",
  closed: "status-closed",
};

function priorityBadgeClass(priority: IncidentRecord["priority_level"]) {
  if (priority === "high") return "badge-red";
  if (priority === "low") return "badge-green";
  return priority === "medium" ? "badge-orange" : "badge-blue";
}

const PAGE_SIZE = 25;

export default function BlottersPage() {
  const canManage = canManageIncidents(useDashboardAuth().role);
  const toast = useToast();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [aiFilter, setAiFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortField, setSortField] = useState<"created_at" | "reference">("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  const [selectedIncident, setSelectedIncident] = useState<IncidentRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState<IncidentStatus>("pending");
  const [statusNote, setStatusNote] = useState("");
  const [updating, setUpdating] = useState(false);
  const [requestingAi, setRequestingAi] = useState(false);
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [loadingReporter, setLoadingReporter] = useState(false);

  const loadBlotters = useCallback(async () => {
    try {
      const records = await fetchStaffIncidents();
      setLoadError(false);
      setIncidents(records);
      setLoading(false);
    } catch (err) {
      setLoadError(true);
      console.error("Failed to load blotters:", err);
      toast.error("Could not load incident reports.");
      setLoading(false);
    }
  }, [toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBlotters();
    setRefreshing(false);
  };

  useEffect(() => {
    queueMicrotask(() => { void loadBlotters(); });
  }, [loadBlotters]);

  useEffect(() => {
    const channel = getSupabase()
      .channel("incident-blotters-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => void loadBlotters())
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_assessments" }, () => void loadBlotters())
      .on("postgres_changes", { event: "*", schema: "public", table: "classification_reviews" }, () => void loadBlotters())
      .subscribe();
    return () => { void getSupabase().removeChannel(channel); };
  }, [loadBlotters]);

  const handleSort = (field: "created_at" | "reference") => {
    setPage(1);
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getDateCutoff = () => {
    const now = new Date();
    if (dateFilter === "today") {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (dateFilter === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    if (dateFilter === "month") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    return null;
  };

  const filteredIncidents = useMemo(() => {
    const cutoff = getDateCutoff();
    const query = searchTerm.trim().toLocaleLowerCase();
    return incidents.filter((inc) => {
      const search = `${inc.reference} ${inc.description} ${inc.location_label}`.toLocaleLowerCase();
      if (query && !search.includes(query)) return false;

      const st = (inc.status || "pending").toLowerCase();
      if (statusFilter !== "all" && st !== statusFilter) return false;

      const cat = (inc.confirmed_category || inc.suggested_category || "other").toLowerCase();
      if (categoryFilter !== "all" && cat !== categoryFilter) return false;

      const pri = (inc.priority_level || "").toLowerCase();
      if (priorityFilter !== "all" && pri !== priorityFilter) return false;

      if (aiFilter === "ai_classified" && !inc.suggested_category) return false;
      if (aiFilter === "human_confirmed" && !inc.confirmed_category) return false;
      if (aiFilter === "unclassified" && (inc.suggested_category || inc.confirmed_category)) return false;

      if (cutoff && new Date(inc.created_at) < cutoff) return false;

      return true;
    }).sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, searchTerm, statusFilter, categoryFilter, priorityFilter, aiFilter, dateFilter, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedIncidents = filteredIncidents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Stats derived from ALL (unfiltered) incidents
  const stats = useMemo(() => ({
    total: incidents.length,
    pending: incidents.filter((i) => i.status === "pending").length,
    in_progress: incidents.filter((i) => i.status === "in_progress").length,
    resolved: incidents.filter((i) => i.status === "resolved").length,
    closed: incidents.filter((i) => i.status === "closed").length,
    needsReview: incidents.filter((i) => !i.confirmed_category).length,
  }), [incidents]);

  const openModal = useCallback(async (incident: IncidentRecord) => {
    setSelectedIncident(incident);
    setStatusUpdate(incident.status);
    setStatusNote("");
    setReporterName("");
    setReporterContact("");
    setModalOpen(true);

    // Fetch reporter info
    setLoadingReporter(true);
    try {
      const { data: sessionData } = await getSupabase().auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const res = await fetch(`/api/incident/${incident.id}/reporter`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json() as { fullName?: string; contactNumber?: string };
          if (data.fullName) setReporterName(data.fullName);
          if (data.contactNumber) setReporterContact(data.contactNumber);
        }
      }
    } catch {
      // non-critical — reporter info is optional
    } finally {
      setLoadingReporter(false);
    }
  }, []);

  const handleUpdateStatus = async () => {
    if (!canManage || !selectedIncident || !canTransitionIncidentStatus(selectedIncident.status, statusUpdate)) return;
    setUpdating(true);
    try {
      const { error } = await getSupabase().rpc("update_incident_status", {
        p_incident_id: selectedIncident.id,
        p_status: statusUpdate,
        p_note: statusNote.trim() || "Status updated on the Incident Reports page",
      });
      if (error) throw error;
      toast.success("Report status updated.");
      setSelectedIncident((prev) => prev ? { ...prev, status: statusUpdate } : prev);
      void loadBlotters();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setUpdating(false);
    }
  };

  const handleRequestAi = async () => {
    if (!canManage || !selectedIncident) return;
    setRequestingAi(true);
    try {
      const { error } = await getSupabase().functions.invoke("classify-incident", {
        body: { incidentId: selectedIncident.id },
      });
      if (error) throw error;
      toast.success("AI suggestion requested. Refreshing…");
      await loadBlotters();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "AI classification failed.");
    } finally {
      setRequestingAi(false);
    }
  };

  const handleExportPdf = () => {
    downloadRecordsPdf({
      title: "OFFICIAL MUNICIPAL INCIDENT BLOTTER RECORDS",
      filename: `MDRRMO_BLOTTERS_${new Date().toISOString().slice(0, 10)}`,
      headers: ["Report ID", "Category", "Priority", "Status", "Location", "Date reported", "Summary"],
      rows: filteredIncidents.map((i) => [
        i.reference,
        (i.confirmed_category || i.suggested_category || "Other").toUpperCase(),
        priorityLabel(i.priority_level),
        (i.status || "Pending").toUpperCase(),
        i.location_label || "Gumaca, Quezon",
        new Date(i.created_at).toLocaleString("en-PH"),
        i.description,
      ]),
    });
  };

  const hasActiveFilters = searchTerm.trim() !== ""
    || statusFilter !== "all"
    || categoryFilter !== "all"
    || priorityFilter !== "all"
    || aiFilter !== "all"
    || dateFilter !== "all";

  const clearFilters = () => {
    setPage(1);
    setSearchTerm("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setPriorityFilter("all");
    setAiFilter("all");
    setDateFilter("all");
  };

  const changeFilter = (update: () => void) => {
    setPage(1);
    update();
  };

  return (
    <div style={{ display: "contents" }}>
      <header className="header blotter-header" id="blotters-header">
        <div className="header-title-sec">
          <h2>Incident reports</h2>
          <span style={{ fontSize: "13px", color: "var(--text-muted)", marginLeft: "12px" }}>
            Reports submitted to the Gumaca MDRRMO
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            className="btn btn-google"
            onClick={() => void handleRefresh()}
            disabled={refreshing || loading}
            style={{ width: "auto", padding: "8px 12px", fontSize: "13px", gap: "6px" }}
            type="button"
            aria-label={refreshing ? "Refreshing reports" : "Refresh reports"}
          >
            <RefreshIcon size={14} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
          <button
            className="btn btn-google"
            onClick={handleExportPdf}
            disabled={loading || filteredIncidents.length === 0}
            style={{ width: "auto", padding: "8px 16px", fontSize: "14px", gap: "6px" }}
            type="button"
          >
            <DownloadIcon size={14} />
            <span>Export PDF</span>
          </button>
        </div>
      </header>

      <div className="page-content blotters-content" id="blotters-content">
        <div className="blotter-ai-guidance" role="note">
          AI suggests a category and priority for each new report. Personnel review the suggestion and manage report status separately.
        </div>

        {/* Stats Bar */}
        <div className="blotters-stats-row">
          <div className="blotter-stat-chip">
            <span className="blotter-stat-num">{stats.total}</span>
            <span className="blotter-stat-label">Total reports</span>
          </div>
          <div className="blotter-stat-chip">
            <span className="blotter-stat-dot dot-yellow" />
            <span className="blotter-stat-num">{stats.pending}</span>
            <span className="blotter-stat-label">Pending</span>
          </div>
          <div className="blotter-stat-chip">
            <span className="blotter-stat-dot dot-blue" />
            <span className="blotter-stat-num">{stats.in_progress}</span>
            <span className="blotter-stat-label">In Progress</span>
          </div>
          <div className="blotter-stat-chip">
            <span className="blotter-stat-dot dot-green" />
            <span className="blotter-stat-num">{stats.resolved}</span>
            <span className="blotter-stat-label">Resolved</span>
          </div>
          <div className="blotter-stat-chip">
            <span className="blotter-stat-dot dot-green" />
            <span className="blotter-stat-num">{stats.closed}</span>
            <span className="blotter-stat-label">Closed</span>
          </div>
          <div className="blotter-stat-chip blotter-stat-review">
            <span className="blotter-stat-num">{stats.needsReview}</span>
            <span className="blotter-stat-label">Needs staff review</span>
          </div>
        </div>

        {/* Filters */}
        <div className="page-toolbar blotter-toolbar">
          <div className="page-search-wrapper" style={{ flex: "1 1 220px", minWidth: "180px" }}>
            <span className="page-search-icon"><SearchIcon size={18} /></span>
            <input
              type="text"
              className="page-search-input"
              placeholder="Search report ID, description, or barangay…"
              value={searchTerm}
              onChange={(e) => changeFilter(() => setSearchTerm(e.target.value))}
              id="blotter-search-field"
            />
          </div>

          <select className="page-filter-select" value={categoryFilter} onChange={(e) => changeFilter(() => setCategoryFilter(e.target.value))}>
            <option value="all">All Categories</option>
            <option value="flooding">Flooding</option>
            <option value="fire">Fire Incident</option>
            <option value="road_obstruction">Road Obstruction</option>
            <option value="road_accident">Road Accident</option>
            <option value="medical_emergency">Medical Emergency</option>
            <option value="other">Other Hazards</option>
          </select>

          <select className="page-filter-select" value={priorityFilter} onChange={(e) => changeFilter(() => setPriorityFilter(e.target.value))}>
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select className="page-filter-select" value={statusFilter} onChange={(e) => changeFilter(() => setStatusFilter(e.target.value))} id="blotter-status-filter">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <select className="page-filter-select" value={aiFilter} onChange={(e) => changeFilter(() => setAiFilter(e.target.value))}>
            <option value="all">All review states</option>
            <option value="ai_classified">AI suggestion ready</option>
            <option value="human_confirmed">Reviewed by personnel</option>
            <option value="unclassified">Waiting for AI suggestion</option>
          </select>

          <select className="page-filter-select" value={dateFilter} onChange={(e) => changeFilter(() => setDateFilter(e.target.value))}>
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>
          {hasActiveFilters && (
            <button className="blotter-clear-filters" onClick={clearFilters} type="button">
              Clear filters
            </button>
          )}
        </div>

        <div className="blotter-results-summary" aria-live="polite">
          <span>
            Showing {filteredIncidents.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredIncidents.length)}
            {" "}of {filteredIncidents.length} matching             {filteredIncidents.length === 1 ? "report" : "reports"}
          </span>
          {hasActiveFilters && <span>Counts above reflect all incident records.</span>}
        </div>

        {loadError && incidents.length > 0 && (
          <div className="blotter-load-error" role="alert">
            Could not refresh reports. The last loaded reports are still shown.
            <button type="button" onClick={() => void handleRefresh()}>Try again</button>
          </div>
        )}

        {/* Blotters Table */}
        <div className="data-table-card blotter-table-card">
          <div className="data-table-scroll">
            {loading ? (
              <div className="blotter-table-state" role="status">
                Loading incident reports…
              </div>
            ) : loadError && incidents.length === 0 ? (
              <div className="blotter-table-state" role="alert">
                <strong>Incident records are unavailable.</strong>
                <button className="btn btn-google" onClick={() => void handleRefresh()} type="button">Retry</button>
              </div>
            ) : (
              <table className="data-table blotter-table">
                <colgroup>
                  <col className="blotter-col-reference" />
                  <col className="blotter-col-incident" />
                  <col className="blotter-col-assessment" />
                  <col className="blotter-col-location" />
                  <col className="blotter-col-date" />
                  <col className="blotter-col-status" />
                  <col className="blotter-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="sortable" scope="col">
                      <button
                        aria-label={`Sort by report ID${sortField === "reference" ? (sortAsc ? ", ascending" : ", descending") : ""}`}
                        className="blotter-sort-button"
                        onClick={() => handleSort("reference")}
                        type="button"
                      >
                        Report ID {sortField === "reference" ? (sortAsc ? " ▴" : " ▾") : ""}
                      </button>
                    </th>
                    <th scope="col">Incident</th>
                    <th scope="col">Priority &amp; AI review</th>
                    <th scope="col">Location</th>
                    <th className="sortable" scope="col">
                      <button
                        aria-label={`Sort by date filed${sortField === "created_at" ? (sortAsc ? ", ascending" : ", descending") : ""}`}
                        className="blotter-sort-button"
                        onClick={() => handleSort("created_at")}
                        type="button"
                      >
                        Date Filed {sortField === "created_at" ? (sortAsc ? " ▴" : " ▾") : ""}
                      </button>
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedIncidents.length === 0 ? (
                    <tr className="empty-row">
                      <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                        No reports match these filters.
                      </td>
                    </tr>
                  ) : (
                    pagedIncidents.map((incident) => {
                      const rawCat = (incident.confirmed_category || incident.suggested_category || "other").toLowerCase();
                      const badge = CATEGORY_BADGES[rawCat] || { class: "badge-green", label: "Other" };
                      const st = (incident.status || "pending").toLowerCase();
                      const statusClass = STATUS_CLASSES[st] || "status-pending";
                      const hasConfirmed = !!incident.confirmed_category;
                      const hasAi = !!incident.suggested_category;

                      return (
                        <tr
                          key={incident.id}
                          className="blotter-row-clickable"
                          tabIndex={0}
                          aria-label={`Open quick view for report ${incident.reference}`}
                          onClick={() => void openModal(incident)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              void openModal(incident);
                            }
                          }}
                        >
                          <td className="cell-mono blotter-reference-cell">
                            <strong>{incident.reference}</strong>
                          </td>
                          <td className="blotter-incident-cell">
                            <div className="blotter-incident-meta">
                              <span className={`badge ${badge.class}`}>{badge.label}</span>
                              {hasConfirmed && (
                                <span className="blotter-confirmed-badge">Reviewed by personnel</span>
                              )}
                            </div>
                            <p className="blotter-incident-description">{incident.description}</p>
                          </td>
                          <td>
                            <div className="blotter-assessment-stack">
                              <span className={`badge ${priorityBadgeClass(incident.priority_level)}`}>
                                {priorityLabel(incident.priority_level)} priority
                              </span>
                              {hasConfirmed ? (
                                <span className="blotter-ai-status ai-confirmed" title="Personnel reviewed and confirmed this classification">
                                  Review complete
                                </span>
                              ) : hasAi ? (
                                <span className="blotter-ai-status ai-classified" title="Generated automatically; personnel review is still required">
                                  AI suggestion · staff review needed
                                </span>
                              ) : (
                                <span className="blotter-ai-status ai-pending" title="Automatic classification is pending or unavailable">
                                  AI suggestion pending
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="blotter-location-cell">
                            <span>
                              {incident.location_label || "Gumaca"}
                            </span>
                          </td>
                          <td className="cell-muted blotter-date-cell">
                            <time dateTime={incident.created_at}>
                              {new Intl.DateTimeFormat("en-PH", {
                                month: "short", day: "numeric", year: "numeric",
                                hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila",
                              }).format(new Date(incident.created_at))}
                            </time>
                          </td>
                          <td>
                            <span className={`blotter-status-pill ${statusClass}`}>
                              {st.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}
                            </span>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="blotter-actions">
                              <Link
                                href={`/dashboard/blotters/${incident.id}`}
                                className="btn btn-google"
                                style={{ width: "auto", padding: "6px 7px", fontSize: "11px" }}
                                title="Open full incident report"
                              >
                                Full Record
                              </Link>
                              <button
                                className="btn btn-google"
                                onClick={() => downloadSingleBlotterPdf(incident)}
                                title="Download incident report PDF"
                                style={{ width: "auto", padding: "6px 7px", fontSize: "12px" }}
                                type="button"
                              >
                                <DownloadIcon size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {!loading && filteredIncidents.length > 0 && (
            <div className="blotter-pagination" aria-label="Incident report pages">
              <div className="blotter-pagination-controls">
                <button
                  className="btn btn-google"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  style={{ width: "auto", padding: "6px 14px", fontSize: "13px" }}
                  type="button"
                >
                  ← Previous
                </button>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)", padding: "0 8px" }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-google"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  style={{ width: "auto", padding: "6px 14px", fontSize: "13px" }}
                  type="button"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick-View Modal */}
      {modalOpen && selectedIncident && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h3>Report ID: {selectedIncident.reference}</h3>
                {selectedIncident.confirmed_category && (
                  <span className="blotter-confirmed-badge">✓ Reviewed by personnel</span>
                )}
              </div>
              <button className="btn-close" onClick={() => setModalOpen(false)} type="button">
                <CloseIcon size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {/* Core Info Grid */}
              <div className="modal-section-grid">
                <div className="detail-block">
                  <h4>Category</h4>
                  <p>
                    <strong>
                      {categoryLabel(selectedIncident.confirmed_category ?? selectedIncident.suggested_category ?? "other")}
                    </strong>
                    {selectedIncident.confirmed_category && (
                      <span style={{ marginLeft: "6px", fontSize: "11px", color: "var(--text-success)" }}>✓</span>
                    )}
                  </p>
                </div>
                <div className="detail-block">
                  <h4>Status</h4>
                  <p><strong>{(selectedIncident.status || "Pending").replace("_", " ").toUpperCase()}</strong></p>
                </div>
                <div className="detail-block">
                  <h4>Priority</h4>
                  <p><strong>{priorityLabel(selectedIncident.priority_level)}</strong></p>
                </div>
                <div className="detail-block">
                  <h4>Date reported</h4>
                  <p>{new Date(selectedIncident.created_at).toLocaleString("en-PH")}</p>
                </div>
              </div>

              {/* Location */}
              <div className="detail-block" style={{ marginBottom: "12px" }}>
                <h4><MapIcon size={12} style={{ marginRight: "4px" }} />Location</h4>
                <p style={{ marginBottom: "4px" }}>{selectedIncident.location_label || "Gumaca, Quezon"}</p>
                {selectedIncident.latitude && selectedIncident.longitude && (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${selectedIncident.latitude}&mlon=${selectedIncident.longitude}#map=17/${selectedIncident.latitude}/${selectedIncident.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "14px", color: "var(--text-info)" }}
                  >
                    {selectedIncident.latitude.toFixed(5)}, {selectedIncident.longitude.toFixed(5)} · Open in OpenStreetMap ↗
                  </a>
                )}
              </div>

              {/* Map */}
              {selectedIncident.latitude && selectedIncident.longitude && (
                <div style={{ marginBottom: "16px", borderRadius: "10px", overflow: "hidden", border: "1px solid var(--glass-border)" }}>
                  <IncidentLocationMap
                    latitude={selectedIncident.latitude}
                    longitude={selectedIncident.longitude}
                    reference={selectedIncident.reference}
                    locationLabel={selectedIncident.location_label}
                  />
                </div>
              )}

              {/* Incident Narrative */}
              <div className="detail-block" style={{ marginBottom: "12px" }}>
                <h4>What was reported</h4>
                <div className="description-text">{selectedIncident.description}</div>
              </div>

              {/* AI Classification */}
              <div className="blotter-modal-ai-section">
                <div className="blotter-modal-ai-header">
                  <div>
                    <span className="blotter-modal-ai-label">AI suggestion</span>
                    <p className="blotter-ai-review-notice">
                      This suggestion does not approve the report or dispatch a response. Personnel should check the category and priority.
                    </p>
                  </div>
                  {canManage && !selectedIncident.suggested_category && (
                    <button
                      className="btn btn-google"
                      onClick={() => void handleRequestAi()}
                      disabled={requestingAi}
                      style={{ width: "auto", padding: "8px 12px" }}
                      type="button"
                    >
                      {requestingAi ? "Requesting…" : "Try AI suggestion"}
                    </button>
                  )}
                </div>
                <div className="modal-section-grid" style={{ marginTop: "8px" }}>
                  <div className="detail-block">
                    <h4>AI-suggested category</h4>
                    <p>{selectedIncident.suggested_category ? categoryLabel(selectedIncident.suggested_category) : "Waiting for suggestion"}</p>
                  </div>
                  <div className="detail-block">
                    <h4>AI Priority</h4>
                    <p>{priorityLabel(selectedIncident.suggested_priority)}</p>
                  </div>
                  <div className="detail-block">
                    <h4>Category confirmed by personnel</h4>
                    <p>{selectedIncident.confirmed_category ? categoryLabel(selectedIncident.confirmed_category) : "Not yet confirmed"}</p>
                  </div>
                </div>
              </div>

              {/* Reporter Info */}
              <div className="detail-block" style={{ marginTop: "12px" }}>
                <h4>Reporter</h4>
                {loadingReporter ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Loading reporter details…</p>
                ) : (
                  <>
                    <p><strong>{reporterName || "Verified Citizen"}</strong></p>
                    {reporterContact && (
                      <p style={{ fontSize: "15px" }}>
                        📞 <a href={`tel:${reporterContact}`} style={{ color: "var(--text-info)" }}>{reporterContact}</a>
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ flexDirection: "column", gap: "12px", alignItems: "stretch" }}>
              {/* Status note */}
              {canManage && selectedIncident.status !== "closed" && <div>
                <label style={{ fontSize: "14px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Note about the status change (optional)
                </label>
                <input
                  type="text"
                  className="page-search-input"
                  placeholder="Add a note for this status change…"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  maxLength={500}
                  style={{ width: "100%", fontSize: "16px", padding: "8px 12px" }}
                />
              </div>}

              <div style={{ display: "flex", gap: "10px", justifyContent: "space-between", flexWrap: "wrap" }}>
                {canManage && selectedIncident.status !== "closed" && <div style={{ display: "flex", gap: "10px", flex: 1, flexWrap: "wrap" }}>
                  <select
                    className="select-status"
                    value={statusUpdate}
                    onChange={(e) => setStatusUpdate(e.target.value as IncidentStatus)}
                    disabled={updating}
                  >
                    {(["pending", "in_progress", "resolved", "closed"] as const)
                      .filter(next => next === selectedIncident.status || canTransitionIncidentStatus(selectedIncident.status, next))
                      .map(next => <option key={next} value={next}>{next === "in_progress" ? "In Progress" : next[0].toUpperCase() + next.slice(1)}</option>)}
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={() => void handleUpdateStatus()}
                    disabled={updating || statusUpdate === selectedIncident.status}
                    style={{ width: "auto", padding: "8px 16px", fontSize: "14px" }}
                    type="button"
                  >
                    {updating ? "Updating…" : "Update Status"}
                  </button>
                </div>}

                <div style={{ display: "flex", gap: "8px" }}>
                  <Link
                    href={`/dashboard/blotters/${selectedIncident.id}`}
                    className="btn btn-google"
                    style={{ width: "auto", padding: "8px 14px", fontSize: "15px" }}
                    onClick={() => setModalOpen(false)}
                  >
                    Full report →
                  </Link>
                  <button
                    className="btn btn-google"
                    onClick={() => downloadSingleBlotterPdf(selectedIncident)}
                    style={{ width: "auto", padding: "8px 14px", fontSize: "14px", gap: "6px" }}
                    type="button"
                  >
                    <DownloadIcon size={14} />
                    <span>PDF</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
