"use client";
import { canTransitionIncidentStatus } from "@kalasag/shared-validation";
import { useDashboardAuth } from "@/components/DashboardAuth";
import { canManageIncidents } from "@/lib/role-access";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { getSupabase } from "@/lib/supabase";
import { fetchStaffIncidents, isMappedIncident } from "@/lib/incidents";
import { downloadRecordsPdf, downloadSingleBlotterPdf } from "@/lib/pdf-export";
import {
  DownloadIcon,
  PinIcon,
  ClockIcon,
  InboxIcon,
  CloseIcon,
  CheckIcon,
  ClipboardIcon,
  FilterIcon,
} from "@/components/Icons";
import { useToast } from "@/components/Toast";
import type { IncidentMapRecord } from "@/lib/types";
import type { IncidentCategory, IncidentPriority, IncidentStatus } from "@kalasag/shared-validation";

const IncidentMap = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="map-skeleton" style={{ height: "100%", minHeight: "450px", display: "grid", placeItems: "center" }}>
      <span>Loading Maps and Reports Map...</span>
    </div>
  ),
});

const IncidentLocationMap = dynamic(
  () => import("@/components/IncidentLocationMap"),
  {
    ssr: false,
    loading: () => (
      <div className="incident-location-map-loading" role="status">
        Loading incident map…
      </div>
    ),
  }
);

const CATEGORY_BADGES: Record<string, { class: string; label: string }> = {
  "flooding": { class: "badge-blue", label: "Flooding" },
  "fire incident": { class: "badge-red", label: "Fire" },
  "fire": { class: "badge-red", label: "Fire" },
  "road obstruction": { class: "badge-orange", label: "Road Obstruction" },
  "road_obstruction": { class: "badge-orange", label: "Road Obstruction" },
  "road accident": { class: "badge-orange", label: "Road Accident" },
  "road_accident": { class: "badge-orange", label: "Road Accident" },
  "medical emergency": { class: "badge-yellow", label: "Medical" },
  "medical_emergency": { class: "badge-yellow", label: "Medical" },
  "other disaster-related incidents": { class: "badge-green", label: "Other" },
  "other": { class: "badge-green", label: "Other" },
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "status-pending",
  in_progress: "status-inprogress",
  resolved: "status-resolved",
  closed: "status-closed",
};

function formatFullDate(dateValue: string | null | undefined) {
  if (!dateValue) return "Unknown";
  const d = new Date(dateValue);
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function timeAgo(dateValue: string | null | undefined) {
  if (!dateValue) return "Unknown";
  const d = new Date(dateValue);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function priorityLabel(priority: IncidentPriority | null) {
  return priority ? priority.toUpperCase() : "PENDING";
}

function priorityBadgeClass(priority: IncidentPriority | null) {
  if (priority === "high") return "badge-red";
  if (priority === "low") return "badge-green";
  return priority === "medium" ? "badge-orange" : "badge-blue";
}

export default function DashboardPage() {
  const canManage = canManageIncidents(useDashboardAuth().role);
  const toast = useToast();

  const [incidents, setIncidents] = useState<IncidentMapRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIncident, setModalIncident] = useState<IncidentMapRecord | null>(null);
  const [contactInfo, setContactInfo] = useState<string | null>(null);
  const [reporterName, setReporterName] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [copiedContact, setCopiedContact] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [dateFilter, setDateFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const activeFilterCount =
    Number(categoryFilter !== "all") +
    Number(statusFilter !== "active") +
    Number(dateFilter !== "all");
  const [statusUpdate, setStatusUpdate] = useState<IncidentStatus>("pending");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [reviewCategory, setReviewCategory] = useState<IncidentCategory>("other");
  const [reviewPriority, setReviewPriority] = useState<IncidentPriority | "">("");
  const [reviewNote, setReviewNote] = useState("");
  const [reclassifying, setReclassifying] = useState(false);
  const [requestingAi, setRequestingAi] = useState(false);

  const [currentTime, setCurrentTime] = useState("");

  const incidentDetailsRequest = useRef(0);

  useEffect(() => {
    if (!zoomPhoto) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setZoomPhoto(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [zoomPhoto]);

  // PST Clock
  useEffect(() => {
    const updateClock = () => {
      const phTime = new Date().toLocaleTimeString("en-PH", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      setCurrentTime(phTime);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load Incidents
  const loadIncidents = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const records = await fetchStaffIncidents(supabase);

      const mapped = records.map<IncidentMapRecord>((r) => {
        const cat = r.confirmed_category || r.suggested_category || "other";
        return {
          ...r,
          category: cat,
          report_date: r.created_at,
          report_id: r.reference,
          blotter_id: r.reference.replace("INC-", "BLT-"),
          incident_description: r.description,
        };
      });

      setIncidents(mapped);
      setModalIncident((current) => {
        if (!current) return current;
        return mapped.find((incident) => incident.id === current.id) ?? current;
      });
    } catch (err) {
      console.error("Failed to load incidents:", err);
      toast.error("Failed to load live incident reports.");
    }
  }, [toast]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadIncidents();
    });

    const channel = getSupabase()
      .channel("command-center-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => void loadIncidents())
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_assessments" }, () => void loadIncidents())
      .on("postgres_changes", { event: "*", schema: "public", table: "classification_reviews" }, () => void loadIncidents())
      .subscribe();

    return () => {
      void getSupabase().removeChannel(channel);
    };
  }, [loadIncidents]);

  // Open details modal
  const openIncidentModal = async (incident: IncidentMapRecord) => {
    const requestId = ++incidentDetailsRequest.current;
    setSelectedId(incident.id);
    setModalIncident(incident);
    setStatusUpdate(incident.status);
    setReviewCategory(incident.confirmed_category || incident.suggested_category || incident.category || "other");
    setReviewPriority(incident.confirmed_priority || incident.suggested_priority || "");
    setReviewNote("");
    setContactInfo(null);
    setReporterName(incident.reporter_name || incident.profiles?.full_name || null);
    setPhotoUrl(null);
    setPhotoLoadError(false);
    setZoomPhoto(false);
    setModalOpen(true);

    const supabase = getSupabase();

    // 1. Fetch reporter profile & contact info via server endpoint
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const res = await fetch(`/api/incident/${incident.id}/reporter`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const reporter = await res.json();
          if (requestId === incidentDetailsRequest.current) {
            if (reporter.fullName) setReporterName(reporter.fullName);
            if (reporter.contactNumber) setContactInfo((prev) => prev || reporter.contactNumber);
          }
        }
      }
    } catch {
      // Endpoint fallback
    }

    // Direct RPC fallback for contact
    try {
      const { data: contact } = await supabase.rpc("get_incident_contact", {
        p_incident_id: incident.id,
      });
      if (requestId !== incidentDetailsRequest.current) return;
      if (contact) setContactInfo(contact);
    } catch {
      // Role not authorized or no snapshot
    }

    // 2. Fetch photo evidence
    try {
      const { data: photos, error: photosError } = await supabase
        .from("incident_photos")
        .select("storage_path")
        .eq("incident_id", incident.id)
        .limit(1);
      if (requestId !== incidentDetailsRequest.current) return;
      if (photosError) throw photosError;

      if (photos && photos.length > 0) {
        const { data: signed, error: signedError } = await supabase.storage
          .from("incident-evidence")
          .createSignedUrl(photos[0].storage_path, 3600);
        if (requestId !== incidentDetailsRequest.current) return;
        if (signedError) throw signedError;
        if (signed?.signedUrl) setPhotoUrl(signed.signedUrl);
      }
    } catch (error: unknown) {
      if (requestId !== incidentDetailsRequest.current) return;
      console.error("Failed to load incident evidence:", error);
      setPhotoLoadError(true);
    }

    // 3. Auto-request AI classification in the background if unclassified
    if (canManage && !incident.suggested_category && !incident.confirmed_category) {
      void supabase.functions.invoke("classify-incident", {
        body: { incidentId: incident.id },
      }).then((res) => {
        if (requestId !== incidentDetailsRequest.current) return;
        const newAssessment = res.data?.assessment;
        if (newAssessment) {
          setModalIncident((prev) => prev && prev.id === incident.id ? {
            ...prev,
            suggested_category: newAssessment.suggested_category,
            suggested_priority: newAssessment.suggested_priority,
            priority_level: prev.confirmed_priority || newAssessment.suggested_priority,
          } : prev);
          setReviewCategory((prev) => prev === "other" ? newAssessment.suggested_category : prev);
          setReviewPriority((prev) => !prev ? newAssessment.suggested_priority : prev);
          void loadIncidents();
        }
      }).catch((err) => {
        console.warn("Auto AI classification request notice:", err);
      });
    }
  };

  const closeIncidentModal = () => {
    incidentDetailsRequest.current += 1;
    setModalOpen(false);
    setZoomPhoto(false);
    setReporterName(null);
  };

  // Status update
  const handleUpdateStatus = async () => {
    if (!canManage || !modalIncident || !canTransitionIncidentStatus(modalIncident.status, statusUpdate)) return;
    setUpdatingStatus(true);
    try {
      const { error } = await getSupabase().rpc("update_incident_status", {
        p_incident_id: modalIncident.id,
        p_status: statusUpdate,
        p_note: "Status updated by personnel in the live reports dashboard",
      });

      if (error) throw error;

      toast.success(`Status updated to ${statusUpdate.replace("_", " ").toUpperCase()}`);
      setModalIncident((previous) => previous ? { ...previous, status: statusUpdate } : previous);
      void loadIncidents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update incident status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Review and confirm incident classification as authorized staff
  const handleReviewClassification = async () => {
    if (!canManage || !modalIncident || !reviewCategory || !reviewPriority) return;
    setReclassifying(true);
    try {
      const { error } = await getSupabase().rpc("review_incident_classification", {
        p_incident_id: modalIncident.id,
        p_category: reviewCategory,
        p_priority: reviewPriority,
        p_note: reviewNote.trim() || "Confirmed by personnel in the live reports dashboard",
      });

      if (error) throw error;

      toast.success(`Classification and ${reviewPriority.toUpperCase()} priority confirmed.`);
      setModalIncident((previous) => previous
        ? {
          ...previous,
          confirmed_category: reviewCategory,
          confirmed_priority: reviewPriority,
          priority_level: reviewPriority,
          category: reviewCategory,
        }
        : previous);
      void loadIncidents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm classification review.");
    } finally {
      setReclassifying(false);
    }
  };

  // Request on-demand AI classification if automatic suggestion is pending
  const handleRequestAiClassification = async () => {
    if (!canManage || !modalIncident) return;
    setRequestingAi(true);
    try {
      const { error } = await getSupabase().functions.invoke("classify-incident", {
        body: { incidentId: modalIncident.id },
      });
      if (error) throw error;
      toast.success("AI suggestion recorded. Refreshing incident details…");
      await loadIncidents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unable to request AI classification.");
    } finally {
      setRequestingAi(false);
    }
  };

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      // Search
      const searchStr = `${inc.reference || ""} ${inc.description || ""} ${inc.location_label || ""}`.toLowerCase();
      if (searchTerm && !searchStr.includes(searchTerm.toLowerCase())) return false;

      // Category
      const cat = (inc.confirmed_category || inc.suggested_category || inc.category || "other").toLowerCase();
      if (categoryFilter !== "all") {
        if (!cat.includes(categoryFilter)) return false;
      }

      // Status
      const st = (inc.status || "pending").toLowerCase();
      if (statusFilter === "active") {
        if (st === "resolved" || st === "closed") return false;
      } else if (statusFilter !== "all") {
        if (st !== statusFilter.toLowerCase()) return false;
      }

      // Date
      if (dateFilter !== "all") {
        const incDate = new Date(inc.created_at);
        const now = new Date();
        if (dateFilter === "today") {
          if (incDate.toDateString() !== now.toDateString()) return false;
        } else if (dateFilter === "7d") {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (incDate < sevenDaysAgo) return false;
        } else if (dateFilter === "30d") {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (incDate < thirtyDaysAgo) return false;
        }
      }

      return true;
    });
  }, [incidents, searchTerm, categoryFilter, statusFilter, dateFilter]);

  // Statistics
  const stats = useMemo(() => {
    const pending = incidents.filter((i) => (i.status || "").toLowerCase() === "pending").length;
    const inProgress = incidents.filter((i) => (i.status || "").toLowerCase() === "in_progress").length;
    const resolved = incidents.filter((i) => {
      const s = (i.status || "").toLowerCase();
      return s === "resolved" || s === "closed";
    }).length;
    const total = incidents.length;
    return { pending, inProgress, resolved, total };
  }, [incidents]);

  const copyContactToClipboard = async () => {
    if (!contactInfo) return;
    try {
      await navigator.clipboard.writeText(contactInfo);
      setCopiedContact(true);
      toast.success("Contact number copied to clipboard");
      setTimeout(() => setCopiedContact(false), 2500);
    } catch (error: unknown) {
      console.error("Failed to copy incident contact number:", error);
      toast.error("Unable to copy the contact number. Check clipboard permissions.");
    }
  };

  const handleExportPDF = () => {
    if (filteredIncidents.length === 0) {
      toast.error("No incident records available to export");
      return;
    }
    downloadRecordsPdf({
      title: "MAPS AND REPORTS INCIDENT LOGS",
      filename: `KALASAG_INCIDENTS_${new Date().toISOString().slice(0, 10)}`,
      headers: ["Reference", "Category", "Status", "Location", "Date", "Description"],
      rows: filteredIncidents.map((i) => [
        i.reference,
        (i.confirmed_category || i.suggested_category || i.category || "Other").toUpperCase(),
        (i.status || "Pending").toUpperCase(),
        i.location_label || "Gumaca, Quezon",
        formatFullDate(i.created_at),
        i.description,
      ]),
    });
  };

  return (
    <div style={{ display: "contents" }}>
      {/* Top Header */}
      <header className="header" id="command-center-header">
        <div className="header-title-sec">
          <h2> Reports & Map</h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "nowrap" }}>
          {/* Local Time Clock */}
          <div className="header-clock">
            <ClockIcon size={16} color="var(--text-secondary)" />
            <span>Philippine time: {currentTime || "--:--:--"}</span>
          </div>

          <div className="header-stats" style={{ gap: "8px" }}>
            <div className="stat-chip" style={{ padding: "6px 10px", fontSize: "14px" }}>
              <span className="stat-indicator pending"></span>
              <span>{stats.pending} Pending reports</span>
            </div>
            <div className="stat-chip" style={{ padding: "6px 10px", fontSize: "14px" }}>
              <span className="stat-indicator active"></span>
              <span>{stats.inProgress} In progress</span>
            </div>
            <div className="stat-chip" style={{ padding: "6px 10px", fontSize: "14px" }}>
              <span className="stat-indicator resolved"></span>
              <span>{stats.resolved} Resolved</span>
            </div>
            <div className="stat-chip" style={{ padding: "6px 10px", fontSize: "14px" }}>
              <span
                className="stat-indicator closed"
                style={{ backgroundColor: "var(--text-muted)", boxShadow: "none" }}
              ></span>
              <span>{stats.total} Total reports</span>
            </div>
          </div>

          <details className="header-more-menu">
            <summary
              aria-label="More dashboard actions"
              className="btn btn-google header-more-summary"
              title="More dashboard actions"
            >
              <span>More</span>
              <svg aria-hidden="true" fill="currentColor" height="14" viewBox="0 0 24 24" width="14">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </summary>
            <div className="header-more-content">
              <button
                className="header-more-item"
                id="export-csv-btn"
                onClick={(event) => {
                  handleExportPDF();
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
                type="button"
              >
                <DownloadIcon size={14} />
                <span>Export PDF</span>
              </button>
            </div>
          </details>
        </div>
      </header>

      {/* Workspace: Map + Feed */}
      <div className="workspace" id="dashboard-workspace">
        {/* Interactive Map */}
        <div className="map-container" id="map-section">
          <IncidentMap
            incidents={filteredIncidents}
            selectedId={selectedId}
            onSelectIncident={(id: string) => {
              const match = incidents.find((i) => i.id === id);
              if (match) openIncidentModal(match);
            }}
          />
        </div>

        {/* Incident Feed */}
        <div className="feed-panel" id="incident-feed-panel">
          <div className="feed-header">
            <h3>Latest incident reports</h3>
            <p className="feed-header-help">
              AI suggests a category and priority. Personnel review it and manage report status separately.
            </p>

            <div className="feed-filter-container">
              <input
                type="text"
                className="feed-filter-select feed-search-input full-width"
                placeholder="Search reference, description, location…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search incidents"
              />
              <details className="feed-filters-disclosure">
                <summary className="feed-filters-summary">
                  <FilterIcon size={14} />
                  <span>Filters</span>
                  {activeFilterCount > 0 ? (
                    <span className="feed-filter-count">{activeFilterCount}</span>
                  ) : statusFilter === "active" ? (
                    <span className="feed-filter-default">Needs attention</span>
                  ) : null}
                </summary>
                <div className="feed-filter-panel">
                  <label className="feed-filter-field">
                    Category
                    <select
                      className="feed-filter-select"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      id="category-filter-select"
                      title="Filter incidents by emergency category"
                    >
                      <option value="all">All Categories ({incidents.length})</option>
                      <option value="flood">Flooding</option>
                      <option value="fire">Fire Incident</option>
                      <option value="road_obstruction">Road Obstruction</option>
                      <option value="road_accident">Road Accident</option>
                      <option value="medical_emergency">Medical Emergency</option>
                      <option value="other">Other Disasters</option>
                    </select>
                  </label>
                  <label className="feed-filter-field">
                    Status
                    <select
                      className="feed-filter-select"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      id="status-filter-select"
                      title="Filter incidents by operational status"
                    >
                      <option value="active">Needs attention (pending or in progress)</option>
                      <option value="all">All reports</option>
                      <option value="pending">Waiting to be reviewed</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  <label className="feed-filter-field">
                    Timeframe
                    <select
                      className="feed-filter-select"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      id="date-filter-select"
                      title="Filter incidents by timeframe"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                    </select>
                  </label>
                </div>
              </details>
            </div>
          </div>

          <div className="feed-list" id="incident-feed-list">
            {filteredIncidents.length === 0 ? (
              <div className="no-incidents">
                <InboxIcon size={32} color="var(--text-muted)" />
                <span>No reports found</span>
                <span style={{ fontSize: "14px" }}>Try another filter or check back after a report is submitted.</span>
              </div>
            ) : (
              filteredIncidents.map((inc) => {
                const rawCat = (inc.confirmed_category || inc.suggested_category || inc.category || "other").toLowerCase();
                const catInfo = CATEGORY_BADGES[rawCat] || CATEGORY_BADGES["other"];
                const st = (inc.status || "pending").toLowerCase();
                const isResolved = st === "resolved" || st === "closed";
                const isSelected = selectedId === inc.id;

                return (
                  <div
                    key={inc.id}
                    className={`incident-card ${isSelected ? "selected" : ""} ${isResolved ? "resolved-card" : ""}`}
                    onClick={() => openIncidentModal(inc)}
                    id={`incident-card-${inc.id}`}
                  >
                    <div className="card-top">
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <span className="badge-blotter-id">{inc.reference || inc.id.substring(0, 8)}</span>
                        <span className={`badge ${catInfo?.class || "badge-blue"}`}>{catInfo?.label || "Flooding"}</span>
                        <span className={`badge ${priorityBadgeClass(inc.priority_level)}`}>
                          {priorityLabel(inc.priority_level)} PRIORITY
                        </span>
                        {inc.confirmed_category && (
                          <span className="badge badge-green" style={{ fontSize: "11px", padding: "2px 6px" }}>
                            CONFIRMED
                          </span>
                        )}
                      </div>
                      <span className="card-time">{timeAgo(inc.created_at)}</span>
                    </div>
                    <p className="card-desc">
                      {inc.description || "No description available"}
                    </p>
                    <div className="card-meta-row">
                      <span className="card-meta-item">
                        <PinIcon size={12} color="var(--text-secondary)" />
                        {inc.location_label ||
                          (inc.latitude && inc.longitude
                            ? `${Number(inc.latitude).toFixed(4)}, ${Number(inc.longitude).toFixed(4)}`
                            : "Location N/A")}
                      </span>
                    </div>
                    <div className="card-footer">
                      <span className="reporter-name">
                        Status: <strong style={{ textTransform: "uppercase" }}>{st.replace("_", " ")}</strong>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Incident Detail Modal */}
      {modalOpen && modalIncident && (
        <div className="modal-overlay" onClick={closeIncidentModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "720px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  className={`badge ${
                    CATEGORY_BADGES[
                      (modalIncident.confirmed_category || modalIncident.suggested_category || modalIncident.category || "other").toLowerCase()
                    ]?.class || "badge-green"
                  }`}
                >
                  {modalIncident.reference}
                </span>
                <h3>Report details</h3>
              </div>
              <button className="btn-close" aria-label="Close report details" onClick={closeIncidentModal} type="button">
                <CloseIcon size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Section Grid: Category, Status, Date, Location */}
              <div className="modal-section-grid">
                <div className="detail-block">
                  <h4>Category</h4>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                    <span
                      className={`badge ${
                        CATEGORY_BADGES[
                          (modalIncident.confirmed_category || modalIncident.suggested_category || modalIncident.category || "other").toLowerCase()
                        ]?.class || "badge-blue"
                      }`}
                    >
                      {(modalIncident.confirmed_category || modalIncident.suggested_category || "Unclassified").toUpperCase()}
                    </span>
                    {modalIncident.confirmed_category && (
                      <span className="badge badge-green" style={{ fontSize: "11px", padding: "2px 6px" }}>
                        HUMAN CONFIRMED
                      </span>
                    )}
                  </div>
                </div>
                <div className="detail-block">
                  <h4>Current Status</h4>
                  <p className={STATUS_CLASSES[(modalIncident.status || "pending").toLowerCase()] || "status-pending"}>
                    {(modalIncident.status || "pending").replace("_", " ").toUpperCase()}
                  </p>
                </div>
                <div className="detail-block">
                  <h4>AI-suggested priority</h4>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                    <p style={{ margin: 0 }}>{priorityLabel(modalIncident.suggested_priority)}</p>
                    {canManage && !modalIncident.suggested_category && (
                      <button
                        type="button"
                        className="btn btn-google"
                        onClick={handleRequestAiClassification}
                        disabled={requestingAi}
                        style={{ width: "auto", padding: "2px 8px", fontSize: "11px", height: "auto" }}
                        title="Request AI classification for this incident"
                      >
                        {requestingAi ? "Classifying…" : "Try AI suggestion"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="detail-block">
                  <h4>Priority confirmed by personnel</h4>
                  <p>{priorityLabel(modalIncident.confirmed_priority)}</p>
                </div>
                <div className="detail-block">
                  <h4>Date Reported</h4>
                  <p>{formatFullDate(modalIncident.created_at)}</p>
                </div>
                <div className="detail-block">
                  <h4>Location</h4>
                  <p>{modalIncident.location_label || "Gumaca, Quezon"}</p>
                  {isMappedIncident(modalIncident) && (
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${modalIncident.latitude}&mlon=${modalIncident.longitude}#map=17/${modalIncident.latitude}/${modalIncident.longitude}`}
                        rel="noreferrer"
                        target="_blank"
                        style={{ color: "var(--color-blue)" }}
                      >
                        {modalIncident.latitude.toFixed(6)}, {modalIncident.longitude.toFixed(6)} · Open map ↗
                      </a>
                    </p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="detail-block">
                <h4>Incident Description</h4>
                <div className="description-text">
                  {modalIncident.description || "No description provided."}
                </div>
              </div>

              {/* Incident Location Map */}
              {isMappedIncident(modalIncident) && (
                <div className="detail-block" style={{ marginTop: "12px" }}>
                  <h4>Incident Location</h4>
                  <div style={{ marginTop: "8px" }}>
                    <IncidentLocationMap
                      latitude={modalIncident.latitude}
                      longitude={modalIncident.longitude}
                      reference={modalIncident.reference}
                      locationLabel={modalIncident.location_label || "Gumaca, Quezon"}
                    />
                  </div>
                </div>
              )}

              {/* Reporter Info with Reveal RPC */}
              <div className="modal-section-grid">
                <div className="detail-block">
                  <h4>Authorized Reporter</h4>
                  <p>{reporterName || modalIncident.reporter_name || modalIncident.profiles?.full_name || "Verified Citizen"}</p>
                </div>
                <div className="detail-block">
                  <h4>Reporter Contact</h4>
                  {contactInfo ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                      <strong style={{ fontSize: "15px", color: "var(--color-blue)" }}>{contactInfo}</strong>
                      <button
                        type="button"
                        className="btn btn-google"
                        onClick={copyContactToClipboard}
                        style={{ width: "auto", padding: "4px 8px", fontSize: "12px", gap: "4px" }}
                      >
                        {copiedContact ? <CheckIcon size={12} color="var(--color-green)" /> : <ClipboardIcon size={12} />}
                        <span>{copiedContact ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: "4px" }}>
                      <span style={{ fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic" }}>
                        {modalIncident.contact_number || "Contact number is private."}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Photo Evidence */}
              {photoUrl && (
                <div className="media-container">
                  <div className="detail-block">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h4>Photo evidence (private)</h4>
                      <span
                        style={{ fontSize: "12px", color: "var(--color-blue)", cursor: "pointer" }}
                        onClick={() => setZoomPhoto(true)}
                      >
                        Select to zoom in ↗
                      </span>
                    </div>
                  </div>
                  <Image
                    src={photoUrl}
                    alt="Incident photo evidence"
                    width={960}
                    height={720}
                    unoptimized
                    className="media-preview"
                    onClick={() => setZoomPhoto(true)}
                    style={{ cursor: "zoom-in" }}
                  />
                </div>
              )}
              {photoLoadError && (
                <p className="ops-alert" role="alert">
                  Incident evidence could not be loaded. Please try opening the report again.
                </p>
              )}

              {/* Classification Review */}
              {canManage && <div className="classification-details">
                <div className="detail-block">
                  <h4>Review the AI suggestion</h4>
                  <p>Check or correct the category and priority, then save your review.</p>
                  <div style={{ display: "flex", gap: "10px", marginTop: "8px", alignItems: "center" }}>
                    <select
                      className="select-status"
                      value={reviewCategory}
                      onChange={(e) => setReviewCategory(e.target.value as IncidentCategory)}
                      disabled={reclassifying}
                      style={{ flexGrow: 1 }}
                    >
                      <option value="fire">Fire Incident</option>
                      <option value="flooding">Flooding</option>
                      <option value="road_accident">Road Accident</option>
                      <option value="road_obstruction">Road Obstruction</option>
                      <option value="medical_emergency">Medical Emergency</option>
                      <option value="other">Other Hazards</option>
                    </select>
                    <select
                      className="select-status"
                      aria-label="Confirmed priority"
                      value={reviewPriority}
                      onChange={(e) => setReviewPriority(e.target.value as IncidentPriority | "")}
                      disabled={reclassifying}
                      style={{ flexGrow: 1 }}
                    >
                      <option value="">Select priority</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-google"
                      onClick={handleReviewClassification}
                      disabled={reclassifying || !reviewPriority || (
                        reviewCategory === modalIncident.confirmed_category &&
                        reviewPriority === modalIncident.confirmed_priority
                      )}
                      style={{ width: "auto", padding: "8px 14px", fontSize: "13px", whiteSpace: "nowrap" }}
                    >
                      <CheckIcon size={14} />
                      <span>{reclassifying ? "Saving…" : "Save review"}</span>
                    </button>
                  </div>
                </div>
              </div>}
            </div>

            {/* Footer with Operational Status Update & Blotter PDF */}
            <div className="modal-footer">
              <Link
                className="btn btn-google"
                href={`/dashboard/blotters/${modalIncident.id}`}
                style={{ width: "auto", padding: "8px 14px", fontSize: "13px" }}
              >
                Full report details
              </Link>
              <button
                type="button"
                className="btn btn-google"
                onClick={() => downloadSingleBlotterPdf(modalIncident)}
                style={{ width: "auto", padding: "8px 14px", fontSize: "13px", gap: "6px" }}
              >
                <DownloadIcon size={14} />
                <span>Download report PDF</span>
              </button>

              {canManage && modalIncident.status !== "closed" && <div className="status-controls">
                <select
                  className="select-status"
                  value={statusUpdate}
                  onChange={(e) => setStatusUpdate(e.target.value as IncidentStatus)}
                  disabled={updatingStatus}
                >
                  {(["pending", "in_progress", "resolved", "closed"] as const)
                      .filter(next => next === modalIncident.status || canTransitionIncidentStatus(modalIncident.status, next))
                      .map(next => <option key={next} value={next}>{next === "in_progress" ? "In Progress" : next[0].toUpperCase() + next.slice(1)}</option>)}
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUpdateStatus}
                  disabled={updatingStatus || statusUpdate === modalIncident.status}
                  style={{ width: "auto", padding: "8px 16px", fontSize: "13px" }}
                >
                  {updatingStatus ? "Updating…" : "Update Status"}
                </button>
              </div>}
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox Overlay */}
      {zoomPhoto && photoUrl && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(5, 7, 10, 0.92)",
            backdropFilter: "blur(8px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
          onClick={() => setZoomPhoto(false)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "92vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
                padding: "0 4px",
              }}
            >
              <span
                style={{
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                }}
              >
                INCIDENT EVIDENCE // {modalIncident?.reference || "KALASAG"}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setZoomPhoto(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  color: "#fff",
                  border: "1px solid rgba(255, 255, 255, 0.25)",
                  padding: "6px 14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <CloseIcon size={16} />
                <span>Close Zoom (Esc)</span>
              </button>
            </div>
            <Image
              src={photoUrl}
              alt="Expanded incident evidence"
              width={1200}
              height={900}
              unoptimized
              style={{
                maxWidth: "100%",
                maxHeight: "82vh",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                borderRadius: "10px",
                boxShadow: "0 24px 64px rgba(0, 0, 0, 0.75)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
