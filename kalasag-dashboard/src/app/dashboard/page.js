"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { logSystemAction } from "@/lib/logs";
import { downloadRecordsPdf } from "@/lib/pdf-export";
import { classifyWithSmartNLP } from "@/lib/classifier";
import {
  DownloadIcon,
  RefreshIcon,
  FlagIcon,
  FileIcon,
  PinIcon,
  AlertIcon,
  ClockIcon,
  InboxIcon,
} from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { useAuth, hasPermission } from "@/lib/auth-context";
import { formatBlotterId, matchIncidentId } from "@/lib/id-helper";

// Dynamically import Map (Leaflet needs window)
const IncidentMap = dynamic(() => import("@/components/Map"), { ssr: false });

// Category styling helpers (Clean professional layout - no emojis)
const CATEGORY_BADGES = {
  "flooding": { class: "badge-blue", label: "Flooding" },
  "fire incident": { class: "badge-red", label: "Fire" },
  "road obstruction": { class: "badge-orange", label: "Road Obstruction" },
  "medical emergency": { class: "badge-yellow", label: "Medical" },
  "other disaster-related incidents": { class: "badge-green", label: "Other" },
};

const CATEGORY_DOTS = {
  "flooding": "#1565C0",
  "fire incident": "#C62828",
  "road obstruction": "#E65100",
  "medical emergency": "#F9A825",
  "other disaster-related incidents": "#2E7D32",
};

const STATUS_CLASSES = {
  Pending: "status-pending",
  "In Progress": "status-inprogress",
  Resolved: "status-resolved",
  Closed: "status-closed",
};

function formatFullDate(dateValue) {
  if (!dateValue) return "Unknown";
  const d = dateValue.seconds ? new Date(dateValue.seconds * 1000) : new Date(dateValue);
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

function timeAgo(dateValue) {
  if (!dateValue) return "Unknown";
  const d = dateValue.seconds ? new Date(dateValue.seconds * 1000) : new Date(dateValue);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active"); // "active", "all", "Pending", "In Progress", "Resolved"
  const [dateFilter, setDateFilter] = useState("all"); // "all", "today", "7d", "30d"
  const [statusUpdate, setStatusUpdate] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [newIncidentIds, setNewIncidentIds] = useState(new Set());

  const isInitialLoad = useRef(true);
  const toast = useToast();
  const toastRef = useRef(toast);
  const { role } = useAuth();

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  // Play Web Audio oscillator tones
  const playAlertSound = useCallback((priority) => {
    if (typeof window === "undefined") return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const vol = parseFloat(localStorage.getItem("kalasag_alert_volume") ?? "0.8");
      const muted = localStorage.getItem("kalasag_alert_muted") === "true";
      if (muted || vol === 0) return;
      if (priority === "High") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        gain.gain.setValueAtTime(0.2 * vol, ctx.currentTime);
        osc.start();
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.01 * vol, ctx.currentTime + 0.4);
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        gain.gain.setValueAtTime(0.15 * vol, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01 * vol, ctx.currentTime + 0.2);
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (err) {
      console.error("Audio Context playback error:", err);
    }
  }, []);


  // PH Time Clock
  useEffect(() => {
    const updateClock = () => {
      const phTime = new Date().toLocaleTimeString("en-PH", {
        timeZone: "Asia/Manila",
        hour: "numeric",
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

  // Request notification permissions
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  }, []);

  // Real-time Firestore listener
  useEffect(() => {
    const q = collection(db, "incident_reports");

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      // Sort newest first
      data.sort((a, b) => {
        const timeA = a.report_date?.seconds
          ? a.report_date.seconds * 1000
          : (a.created_at ? new Date(a.created_at).getTime() : Date.now());
        const timeB = b.report_date?.seconds
          ? b.report_date.seconds * 1000
          : (b.created_at ? new Date(b.created_at).getTime() : Date.now());
        return timeB - timeA;
      });

      // Trigger notifications and play sounds
      const addedIds = [];
      let incomingHighPriority = false;
      let incomingNormalPriority = false;

      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" && !isInitialLoad.current) {
          const newInc = change.doc.data();
          const incidentId = change.doc.id;
          addedIds.push(incidentId);

          if (newInc.priority_level === "High") {
            incomingHighPriority = true;
          } else {
            incomingNormalPriority = true;
          }

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification(`New Incident Reported: ${(newInc.category || "Emergency").toUpperCase()}`, {
              body: newInc.incident_description || "A new report has been submitted in Poblacion, Gumaca.",
              tag: incidentId,
            });
          }
        }
      });

      if (addedIds.length > 0) {
        setNewIncidentIds((prev) => {
          const next = new Set(prev);
          addedIds.forEach(id => next.add(id));
          return next;
        });

        // Trigger in-app alerts and sounds
        if (incomingHighPriority) {
          playAlertSound("High");
          toastRef.current?.warning("CRITICAL HIGH-PRIORITY REPORT RECEIVED");
        } else if (incomingNormalPriority) {
          playAlertSound("Normal");
          toastRef.current?.info("New incident report received");
        }

        // Clean up animation flags after 5 seconds
        setTimeout(() => {
          setNewIncidentIds((prev) => {
            const next = new Set(prev);
            addedIds.forEach(id => next.delete(id));
            return next;
          });
        }, 5000);
      }

      isInitialLoad.current = false;
      setIncidents(data);
    });

    return () => unsubscribe();
  }, [playAlertSound]);

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- Date.now() is inside useMemo, not called during render
    const now = Date.now();
    return incidents.filter((inc) => {
      // 1. Category Filter
      const matchesCategory = categoryFilter === "all" || inc.category === categoryFilter;

      // 2. Status Filter
      let matchesStatus = true;
      if (statusFilter === "active") {
        matchesStatus = inc.status !== "Resolved" && inc.status !== "Closed";
      } else if (statusFilter !== "all") {
        matchesStatus = inc.status === statusFilter;
      }

      // 3. Date Filter
      let matchesDate = true;
      if (dateFilter !== "all") {
        const incTime = inc.report_date?.seconds
          ? inc.report_date.seconds * 1000
          : (inc.created_at ? new Date(inc.created_at).getTime() : 0);
        if (dateFilter === "today") {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);
          matchesDate = incTime >= startOfDay.getTime();
        } else if (dateFilter === "7d") {
          matchesDate = incTime >= now - 7 * 24 * 60 * 60 * 1000;
        } else if (dateFilter === "30d") {
          matchesDate = incTime >= now - 30 * 24 * 60 * 60 * 1000;
        }
      }

      return matchesCategory && matchesStatus && matchesDate;
    });
  }, [incidents, categoryFilter, statusFilter, dateFilter]);

  // Stats
  const stats = useMemo(() => {
    const pending = incidents.filter((i) => i.status === "Pending").length;
    const active = incidents.filter((i) => i.status === "In Progress").length;
    const resolved = incidents.filter((i) => i.status === "Resolved").length;
    const closed = incidents.filter((i) => i.status === "Closed").length;
    return { pending, active, resolved, closed, total: incidents.length };
  }, [incidents]);

  // Selected incident
  const selectedIncident = useMemo(() => {
    return incidents.find((i) => i.id === selectedId) || null;
  }, [incidents, selectedId]);

  const handleSelectIncident = useCallback((id) => {
    setSelectedId(id);
    setModalOpen(true);
    const inc = incidents.find((i) => i.id === id);
    if (inc) {
      setStatusUpdate(inc.status || "Pending");
    }
  }, [incidents]);

  const handleCloseModal = () => {
    setModalOpen(false);
  };

  // Keyboard navigation listener (ArrowUp/ArrowDown to select, Escape to close)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (filteredIncidents.length === 0) return;

      if (e.key === "Escape") {
        setModalOpen(false);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); // Prevents page scrolling
        const currentIndex = filteredIncidents.findIndex((inc) => inc.id === selectedId);
        let nextIndex = 0;

        if (e.key === "ArrowDown") {
          nextIndex = currentIndex === -1 || currentIndex === filteredIncidents.length - 1 ? 0 : currentIndex + 1;
        } else {
          nextIndex = currentIndex <= 0 ? filteredIncidents.length - 1 : currentIndex - 1;
        }

        const nextInc = filteredIncidents[nextIndex];
        if (nextInc) {
          handleSelectIncident(nextInc.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredIncidents, selectedId, handleSelectIncident]);

  // Update incident status in Firestore
  const handleUpdateStatus = async () => {
    if (!selectedId || !statusUpdate) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "incident_reports", selectedId), {
        status: statusUpdate,
        updated_at: Timestamp.now(),
      });
      batch.update(doc(db, "public_incidents", selectedId), { status: statusUpdate });
      await batch.commit();
      
      await logSystemAction("STATUS_UPDATE", `Updated incident ${selectedId.substring(0, 8)} status to: ${statusUpdate}`);
      toast.success("Incident status successfully updated");
      setModalOpen(false);
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Failed to update status");
    }
  };


  // Flag AI classification as incorrect
  const handleFlagIncident = async () => {
    if (!selectedId) return;
    const reason = prompt("Enter the reason for flagging this AI classification (e.g., misclassified fire as flood):");
    if (reason === null) return; // User cancelled
    
    try {
      const docRef = doc(db, "incident_reports", selectedId);
      await updateDoc(docRef, {
        flagged: true,
        flag_reason: reason || "Incorrect classification flagged by personnel",
        updated_at: Timestamp.now(),
      });

      await logSystemAction("INCIDENT_FLAGGED", `Flagged classification for incident ${selectedId.substring(0, 8)}. Reason: ${reason}`);
      toast.warning("AI classification flagged for review");
      setModalOpen(false);
    } catch (err) {
      console.error("Failed to flag classification:", err);
      toast.error("Failed to flag classification");
    }
  };

  // Re-classify incident using updated Multi-Hazard NLP Engine
  const handleReclassify = async () => {
    if (!selectedId || !selectedIncident) return;
    const desc = selectedIncident.incident_description;
    if (!desc) {
      toast.error("No description available to re-classify");
      return;
    }

    try {
      const result = classifyWithSmartNLP(desc);
      const batch = writeBatch(db);
      batch.update(doc(db, "incident_reports", selectedId), {
        category: result.category,
        priority_level: result.priority_level,
        confidence_score: result.confidence_score,
        reasoning: result.reasoning,
        secondary_category: result.secondary_category || null,
        compound_hazard: result.compound_hazard || false,
        compound_hazards: result.compound_hazards || [],
        recommended_units: result.recommended_units || [],
        flagged: false,
        flag_reason: null,
        reclassified_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      });
      batch.update(doc(db, "public_incidents", selectedId), {
        category: result.category,
        secondary_category: result.secondary_category || null,
        priority_level: result.priority_level,
      });
      await batch.commit();

      await logSystemAction(
        "AI_RECLASSIFICATION",
        `Re-classified incident ${selectedId.substring(0, 8)} → ${result.category.toUpperCase()} / ${result.priority_level}${result.compound_hazard ? ` [COMPOUND: ${result.compound_hazards.join(' + ')}]` : ''}`
      );
      toast.success(`Re-classified → ${result.category.toUpperCase()} / ${result.priority_level}${result.compound_hazard ? ' ⚠ COMPOUND EMERGENCY' : ''}`);
    } catch (err) {
      console.error("Failed to re-classify incident:", err);
      toast.error("Failed to re-classify incident");
    }
  };

  // Generate official blotter: route to blotters module with this incident selected
  const handleGenerateBlotter = () => {
    if (!selectedId) return;
    setModalOpen(false);
    router.push(`/dashboard/blotters?select=${selectedId}`);
  };

  // Export filtered incidents as a paginated PDF report.
  const handleExportPDF = async () => {
    if (filteredIncidents.length === 0) {
      toast.error("No data available to export");
      return;
    }


    const headers = [
      "Report ID",
      "Date Reported",
      "Category",
      "Priority Level",
      "AI Confidence",
      "Status",
      "Reporter Name",
      "Contact Info",
      "Latitude",
      "Longitude",
      "Description",
      "Flagged Incorrect?"
    ];

    const rows = filteredIncidents.map((inc) => [
      inc.id,
      inc.report_date ? new Date(inc.report_date.seconds ? inc.report_date.seconds * 1000 : inc.report_date).toLocaleString("en-PH") : "",
      inc.category || "unclassified",
      inc.priority_level || "N/A",
      inc.confidence_score ? `${(inc.confidence_score * 100).toFixed(1)}%` : "N/A",
      inc.status || "Pending",
      inc.reporter_name || "Anonymous",
      inc.reporter_contact || "N/A",
      inc.latitude || "",
      inc.longitude || "",
      inc.incident_description || "",
      inc.flagged ? "Yes" : "No"
    ]);
    await downloadRecordsPdf({
      title: "Filtered Incident Reports",
      headers,
      rows,
      filename: `KALASAG_Incidents_Export_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };




  return (
    <>
      {/* Header Bar */}
      <header className="header" id="dashboard-header">
        <div className="header-title-sec">
          <h2>Command Center</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          {/* PH Time Clock */}
          <div className="header-clock">
            <ClockIcon size={16} color="var(--text-secondary)" />
            <span>PH Time: {currentTime || "--:--:--"}</span>
          </div>

          <div className="header-stats">
            <div className="stat-chip">
              <span className="stat-indicator pending"></span>
              <span>{stats.pending} Pending</span>
            </div>
            <div className="stat-chip">
              <span className="stat-indicator active"></span>
              <span>{stats.active} Active</span>
            </div>
            <div className="stat-chip">
              <span className="stat-indicator resolved"></span>
              <span>{stats.resolved} Resolved</span>
            </div>
            <div className="stat-chip">
              <span className="stat-indicator closed" style={{ backgroundColor: "var(--text-muted)", boxShadow: "none" }}></span>
              <span>{stats.closed} Closed</span>
            </div>
          </div>


          {hasPermission(role, "export:pdf") && (
            <button
              className="btn btn-google"
              id="export-csv-btn"
              onClick={handleExportPDF}
              style={{ width: "auto", padding: "8px 16px", fontSize: "12px", gap: "6px" }}
            >
              <DownloadIcon size={14} /> Download PDF
            </button>
          )}
        </div>
      </header>

      {/* Workspace: Map + Feed */}
      <div className="workspace" id="dashboard-workspace">
        {/* Interactive Map */}
        <div className="map-container" id="map-section">
          <IncidentMap
            incidents={incidents}
            selectedId={selectedId}
            onSelectIncident={handleSelectIncident}
          />
        </div>

        {/* Incident Feed */}
        <div className="feed-panel" id="incident-feed-panel">
          <div className="feed-header">
            <h3>Live Incident Feed</h3>
            
            {/* Filter Dropdowns */}
            <div className="feed-filter-container">
              <div className="feed-filter-group" style={{ marginBottom: "8px" }}>
                <select
                  className="feed-filter-select full-width"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  id="category-filter-select"
                  title="Filter incidents by emergency category"
                >
                  <option value="all">All Categories ({incidents.length})</option>
                  <option value="flooding">🌊 Flooding</option>
                  <option value="fire incident">🔥 Fire Incident</option>
                  <option value="road obstruction">🚧 Road Obstruction</option>
                  <option value="medical emergency">🏥 Medical Emergency</option>
                  <option value="other disaster-related incidents">⚠️ Other Disasters</option>
                </select>
              </div>

              <div className="feed-filter-subgrid">
                <select
                  className="feed-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  id="status-filter-select"
                  title="Filter incidents by operational status"
                >
                  <option value="active">Active Only</option>
                  <option value="all">All Statuses</option>
                  <option value="Pending">Pending Only</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved Cases</option>
                  <option value="Closed">Closed Cases</option>
                </select>

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
              </div>
            </div>
          </div>

          <div className="feed-list" id="incident-feed-list">
            {filteredIncidents.length === 0 ? (
              <div className="no-incidents">
                <InboxIcon size={32} color="var(--text-muted)" />
                <span>No incidents reported</span>
                <span style={{ fontSize: "11px" }}>Reports from the mobile app will appear here in real-time</span>
              </div>
            ) : (
              filteredIncidents.map((inc) => {
                const catInfo = CATEGORY_BADGES[inc.category] || CATEGORY_BADGES["other disaster-related incidents"];
                const statusClass = STATUS_CLASSES[inc.status] || "status-pending";
                const isResolved = inc.status === "Resolved" || inc.status === "Closed";
                const isNew = newIncidentIds.has(inc.id);

                return (
                  <div
                    key={inc.id}
                    className={`incident-card ${selectedId === inc.id ? "selected" : ""} ${isResolved ? "resolved-card" : ""} ${isNew ? "new-card" : ""}`}
                    onClick={() => handleSelectIncident(inc.id)}
                    id={`incident-card-${inc.id}`}
                  >
                    <div className="card-top">
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        <span className="badge-blotter-id">{formatBlotterId(inc, incidents.indexOf(inc), incidents.length)}</span>
                        <span className={`badge ${catInfo.class}`}>{catInfo.label}</span>
                        {(inc.secondary_category || (inc.incident_description && inc.incident_description.toLowerCase().includes('debris') && inc.category === 'fire incident')) && (
                          <span className={`badge ${inc.secondary_category && CATEGORY_BADGES[inc.secondary_category] ? CATEGORY_BADGES[inc.secondary_category].class : 'badge-orange'}`} style={{ fontSize: "10px", padding: "2px 6px" }}>
                            + {inc.secondary_category ? (CATEGORY_BADGES[inc.secondary_category]?.label?.toUpperCase() || inc.secondary_category.toUpperCase()) : 'DEBRIS'} (COMPOUND)
                          </span>
                        )}
                        {inc.flagged && <span className="badge badge-red" style={{ padding: "2px 6px" }}>FLAGGED</span>}
                        {inc.surge_mode && <span className="badge badge-orange" style={{ padding: "2px 6px" }}>SURGE</span>}
                      </div>
                      <span className="card-time">{timeAgo(inc.report_date)}</span>
                    </div>
                    <p className="card-desc">
                      {inc.incident_description || "No description available"}
                    </p>
                    <div className="card-meta-row">
                      <span className="card-meta-item">
                        <PinIcon size={12} color="var(--text-secondary)" />
                        {inc.latitude && inc.longitude ? `${Number(inc.latitude).toFixed(4)}, ${Number(inc.longitude).toFixed(4)}` : "Location N/A"}
                      </span>
                    </div>
                    <div className="card-footer">
                      <span className="reporter-name">
                        Reporter: {inc.reporter_name || "Anonymous"}
                      </span>
                      <span className={`status-label ${statusClass}`}>
                        {inc.status || "Pending"}
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
      {modalOpen && selectedIncident && (
        <div className="modal-overlay" id="incident-detail-modal" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Incident Report Details</h3>
              <button className="btn-close" onClick={handleCloseModal} id="modal-close-btn">
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Identifiers Header Strip */}
              <div className="modal-id-row">
                <div className="modal-id-box blotter-id-box">
                  <span className="modal-id-label">BLOTTER ID</span>
                  <span className="modal-id-value">{formatBlotterId(selectedIncident, incidents.indexOf(selectedIncident), incidents.length)}</span>
                </div>
                <div className="modal-id-box system-id-box">
                  <span className="modal-id-label">FIRESTORE REF</span>
                  <span className="modal-id-value mono-small">{selectedIncident.id.substring(0, 10)}...</span>
                </div>
              </div>

              {/* Flagged Status Banner */}
              {selectedIncident.flagged && (
                <div className="error-message" style={{ margin: "0 0 20px 0", background: "var(--color-red-glow)", borderColor: "var(--color-red)" }} role="alert">
                  <AlertIcon size={16} color="var(--color-red)" style={{ display: "inline", verticalAlign: "text-bottom", marginRight: "6px" }} />
                  <strong>Flagged for Review:</strong> {selectedIncident.flag_reason}
                </div>
              )}
              {selectedIncident.surge_mode && (
                <div className="ai-volume-rule manual-surge" role="status">
                  This report was submitted while surge mode was active.
                </div>
              )}


              {/* Classification & Priority */}
              <div className="modal-section-grid">
                <div className="detail-block">
                  <h4>Category</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                    <span className={`badge ${(CATEGORY_BADGES[selectedIncident.category] || CATEGORY_BADGES["other disaster-related incidents"]).class}`}>
                      {(selectedIncident.category || "unclassified").toUpperCase()}
                    </span>
                    {(selectedIncident.secondary_category || (selectedIncident.incident_description && selectedIncident.incident_description.toLowerCase().includes('debris') && selectedIncident.category === 'fire incident')) && (
                      <span className={`badge ${selectedIncident.secondary_category && CATEGORY_BADGES[selectedIncident.secondary_category] ? CATEGORY_BADGES[selectedIncident.secondary_category].class : 'badge-orange'}`} style={{ fontSize: "10px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        + {(selectedIncident.secondary_category ? (CATEGORY_BADGES[selectedIncident.secondary_category]?.label?.toUpperCase() || selectedIncident.secondary_category.toUpperCase()) : "ROAD OBSTRUCTION")} (COMPOUND)
                      </span>
                    )}
                  </div>
                </div>
                <div className="detail-block">
                  <h4>Priority Level</h4>
                  <p style={{ marginTop: "4px" }}>
                    <span className={`badge ${selectedIncident.priority_level === "High" ? "badge-red" : selectedIncident.priority_level === "Low" ? "badge-green" : "badge-orange"}`}>
                      {selectedIncident.priority_level || "Medium"}
                    </span>
                  </p>
                </div>
                <div className="detail-block">
                  <h4>Date Reported</h4>
                  <p>{formatFullDate(selectedIncident.report_date)}</p>
                </div>
                <div className="detail-block">
                  <h4>Current Status</h4>
                  <p className={STATUS_CLASSES[selectedIncident.status] || "status-pending"}>
                    {selectedIncident.status || "Pending"}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div className="detail-block">
                <h4>Incident Description</h4>
                <div className="description-text">
                  {selectedIncident.incident_description || "No description provided."}
                </div>
              </div>

              {/* Reporter Info */}
              <div className="modal-section-grid">
                <div className="detail-block">
                  <h4>Reporter</h4>
                  <p>{selectedIncident.reporter_name || "Anonymous"}</p>
                </div>
                <div className="detail-block">
                  <h4>Contact</h4>
                  <p>{selectedIncident.reporter_contact || "N/A"}</p>
                </div>
                <div className="detail-block">
                  <h4>GPS Coordinates</h4>
                  <p>
                    {selectedIncident.latitude && selectedIncident.longitude
                      ? `${selectedIncident.latitude}, ${selectedIncident.longitude}`
                      : "Not available"}
                  </p>
                </div>
                <div className="detail-block">
                  <h4>AI Confidence</h4>
                  <p>
                    {selectedIncident.confidence_score
                      ? `${(selectedIncident.confidence_score * 100).toFixed(1)}%`
                      : "N/A"}
                  </p>
                </div>
              </div>

              {/* Incident Location Pinpoint Map */}
              {selectedIncident.latitude && selectedIncident.longitude && (
                <div className="detail-block" style={{ marginTop: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4>Incident Location Pinpoint</h4>
                    <a
                      href={`https://www.google.com/maps?q=${selectedIncident.latitude},${selectedIncident.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "11px", gap: "6px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                    >
                      <PinIcon size={12} color="var(--color-blue)" />
                      <span>Open in Google Maps ↗</span>
                    </a>
                  </div>
                  <div style={{
                    height: "240px",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid var(--glass-border)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                    position: "relative"
                  }}>
                    <iframe
                      title="Incident Pinpoint Map"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(selectedIncident.longitude) - 0.008},${Number(selectedIncident.latitude) - 0.006},${Number(selectedIncident.longitude) + 0.008},${Number(selectedIncident.latitude) + 0.006}&layer=mapnik&marker=${selectedIncident.latitude},${selectedIncident.longitude}`}
                      style={{ width: "100%", height: "100%", border: "none" }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px", fontSize: "11px", color: "var(--text-secondary)" }}>
                    <span>📍 GPS Coordinates: {Number(selectedIncident.latitude).toFixed(5)}, {Number(selectedIncident.longitude).toFixed(5)}</span>
                    <span>Gumaca, Quezon Sector</span>
                  </div>
                </div>
              )}

              {/* AI Reasoning */}
              {selectedIncident.reasoning && (
                <div className="classification-details">
                  <div className="detail-block">
                    <h4>AI Classification Reasoning</h4>
                    <p className="reasoning-text">&ldquo;{selectedIncident.reasoning}&rdquo;</p>
                  </div>
                </div>
              )}

              {/* Recommended Response Units */}
              {selectedIncident.recommended_units && selectedIncident.recommended_units.length > 0 && (
                <div className="classification-details" style={{ marginTop: "10px" }}>
                  <div className="detail-block">
                    <h4>Recommended Response Units (Coordinated Dispatch)</h4>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "6px" }}>
                      {selectedIncident.recommended_units.map((unit, idx) => (
                        <span key={idx} className="badge badge-blue" style={{ fontSize: "11px", padding: "4px 10px" }}>
                          🛡️ {unit}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Media Attachments (Photos & Videos) */}
              {(selectedIncident.incident_image || selectedIncident.incident_video) && (
                <div className="media-container">
                  <div className="detail-block">
                    <h4>Attached Media Evidence</h4>
                  </div>
                  {selectedIncident.incident_image && (
                    <Image
                      className="media-preview"
                      src={selectedIncident.incident_image}
                      alt="Incident photo evidence"
                      width={1200}
                      height={800}
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                  )}
                  {selectedIncident.incident_video && (
                    <video
                      className="media-preview"
                      src={selectedIncident.incident_video}
                      controls
                      preload="metadata"
                      style={{ backgroundColor: "#000" }}
                    >
                      Your browser does not support video playback.
                    </video>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="modal-footer" style={{ flexDirection: "column", gap: "16px", alignItems: "stretch" }}>
              {hasPermission(role, "update:incident-status") && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                  {/* Status Update */}
                  <div className="status-controls" style={{ flexGrow: 1, minWidth: "200px" }}>
                    <select
                      className="select-status"
                      id="status-update-select"
                      value={statusUpdate}
                      onChange={(e) => setStatusUpdate(e.target.value)}
                      style={{ flexGrow: 1 }}
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Closed">Closed</option>
                    </select>
                    <button
                      className="btn btn-primary"
                      id="update-status-btn"
                      onClick={handleUpdateStatus}
                      style={{ width: "auto", padding: "10px 20px", fontSize: "13px" }}
                    >
                      Update Status
                    </button>
                  </div>


                </div>
              )}

              {hasPermission(role, "update:incident-status") && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderTop: "1px solid var(--glass-border)", paddingTop: "12px", flexWrap: "wrap" }}>
                  <button
                    className="btn btn-google"
                    id="reclassify-ai-btn"
                    onClick={handleReclassify}
                    style={{ width: "auto", padding: "10px 20px", fontSize: "13px", color: "var(--color-blue)", borderColor: "var(--color-blue)", gap: "6px" }}
                  >
                    <RefreshIcon size={14} color="var(--color-blue)" /> Re-classify AI
                  </button>
                  <button
                    className="btn btn-google"
                    id="flag-misclassification-btn"
                    onClick={handleFlagIncident}
                    style={{ width: "auto", padding: "10px 20px", fontSize: "13px", color: "var(--text-danger)", borderColor: "var(--color-red)", gap: "6px" }}
                  >
                    <FlagIcon size={14} color="var(--text-danger)" /> Flag Misclassified
                  </button>
                  <button
                    className="btn btn-google"
                    id="generate-blotter-btn"
                    onClick={handleGenerateBlotter}
                    style={{ width: "auto", padding: "10px 20px", fontSize: "13px", gap: "6px" }}
                  >
                    <FileIcon size={14} /> Generate Blotter
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
