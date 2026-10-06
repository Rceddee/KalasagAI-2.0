"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, writeBatch, Timestamp } from "firebase/firestore";
import { logSystemAction } from "@/lib/logs";
import {
  FileIcon,
  SearchIcon,
  AlertIcon,
  PinIcon,
  FlagIcon,
} from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { useAuth, hasPermission } from "@/lib/auth-context";
import { formatBlotterId, matchIncidentId, compareByIdNumber, extractIdNumber } from "@/lib/id-helper";

const CATEGORY_BADGES = {
  "flooding": { class: "badge-blue", label: "Flooding" },
  "fire incident": { class: "badge-red", label: "Fire" },
  "road obstruction": { class: "badge-orange", label: "Road Obstruction" },
  "medical emergency": { class: "badge-yellow", label: "Medical" },
  "other disaster-related incidents": { class: "badge-green", label: "Other" },
};

const STATUS_CLASSES = {
  Pending: "status-pending",
  "In Progress": "status-inprogress",
  Resolved: "status-resolved",
  Closed: "status-closed",
};

export default function BlottersPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { role } = useAuth();
  
  // Sorting states
  const [sortField, setSortField] = useState("report_date");
  const [sortAsc, setSortAsc] = useState(false);

  // Detail Modal states
  const [selectedId, setSelectedId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState("");

  const toast = useToast();

  useEffect(() => {
    const q = collection(db, "incident_reports");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => {
        const timeA = a.report_date?.seconds ? a.report_date.seconds * 1000 : (a.created_at ? new Date(a.created_at).getTime() : Date.now());
        const timeB = b.report_date?.seconds ? b.report_date.seconds * 1000 : (b.created_at ? new Date(b.created_at).getTime() : Date.now());
        return timeB - timeA;
      });
      setIncidents(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Handle ?select=<incident_id> query param from Command Center
  useEffect(() => {
    if (typeof window === "undefined" || incidents.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const selectParam = params.get("select");
    if (selectParam) {
      const match = incidents.find((i) => i.id === selectParam);
      if (match) {
        // Defer to next tick to avoid synchronous setState inside effect
        setTimeout(() => {
          setSelectedId(match.id);
          setStatusUpdate(match.status || "Pending");
          setModalOpen(true);
        }, 0);
      }
    }
  }, [incidents]);

  // Keyboard Escape listener to close details modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle click on table headers for sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(prev => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Filtered & Sorted incidents
  const filteredAndSorted = useMemo(() => {
    const filtered = incidents.filter((inc) => {
      const matchesSearch = 
        matchIncidentId(inc, searchTerm) ||
        (inc.reporter_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inc.incident_description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inc.category || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || inc.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    // Sort
    return [...filtered].sort((a, b) => {
      if (sortField === "blotter_id") {
        // Numeric comparison on the ID number so BLOTTER 2 < BLOTTER 10
        return compareByIdNumber(a, b, sortAsc);
      }

      // Handle firebase Timestamp object comparison
      if (sortField === "report_date") {
        const timeA = a.report_date?.seconds ? a.report_date.seconds * 1000 : (a.created_at ? new Date(a.created_at).getTime() : 0);
        const timeB = b.report_date?.seconds ? b.report_date.seconds * 1000 : (b.created_at ? new Date(b.created_at).getTime() : 0);
        return sortAsc ? timeA - timeB : timeB - timeA;
      }

      let valA = a[sortField];
      let valB = b[sortField];

      // Convert to string safely
      valA = String(valA || "").toLowerCase();
      valB = String(valB || "").toLowerCase();

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [incidents, searchTerm, statusFilter, sortField, sortAsc]);


  const selectedIncident = useMemo(() => {
    return incidents.find(i => i.id === selectedId) || null;
  }, [incidents, selectedId]);

  const handleOpenDetails = (inc) => {
    setSelectedId(inc.id);
    setStatusUpdate(inc.status || "Pending");
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
  };

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
      
      await logSystemAction("STATUS_UPDATE", `Updated incident ${selectedId.substring(0, 8)} status to: ${statusUpdate} (from Blotter)`);
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

  const handleDownloadPDF = async (inc) => {
    const { jsPDF } = await import("jspdf");
    const pdfDoc = new jsPDF();

    const cat = inc.category || "Unclassified";
    const priority = inc.priority_level || "N/A";
    const date = inc.report_date ? new Date(inc.report_date.seconds ? inc.report_date.seconds * 1000 : inc.report_date).toLocaleString("en-PH") : "N/A";
    const desc = inc.incident_description || "No description provided.";
    const reporter = inc.reporter_name || "Anonymous";
    const contact = inc.reporter_contact || "N/A";
    const lat = inc.latitude || "N/A";
    const lng = inc.longitude || "N/A";
    const status = inc.status || "Pending";
    const confidence = inc.confidence_score ? (inc.confidence_score * 100).toFixed(1) + "%" : "N/A";

    const blotterId = formatBlotterId(inc);

    pdfDoc.setFontSize(18);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text("KALASAG MDRRMO — INCIDENT BLOTTER", 105, 20, { align: "center" });

    pdfDoc.setFontSize(10);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.text("Municipality of Gumaca, Quezon", 105, 27, { align: "center" });
    pdfDoc.text(`Generated: ${new Date().toLocaleString("en-PH")}`, 105, 33, { align: "center" });

    pdfDoc.setDrawColor(198, 40, 40);
    pdfDoc.setLineWidth(0.8);
    pdfDoc.line(20, 37, 190, 37);

    let y = 48;
    const lineH = 8;
    const addField = (label, value) => {
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text(`${label}:`, 20, y);
      pdfDoc.setFont("helvetica", "normal");
      pdfDoc.text(`${value}`, 75, y);
      y += lineH;
    };

    addField("Blotter Entry ID", blotterId);
    addField("Date & Time", date);
    addField("Category", cat.toUpperCase());
    addField("Priority Level", priority);
    addField("AI Confidence", confidence);

    addField("Status", status);

    y += 4;
    pdfDoc.setDrawColor(200, 200, 200);
    pdfDoc.line(20, y, 190, y);
    y += 8;

    addField("Reporter Name", reporter);
    addField("Contact Number", contact);
    addField("GPS Coordinates", `${lat}, ${lng}`);

    y += 4;
    pdfDoc.setDrawColor(200, 200, 200);
    pdfDoc.line(20, y, 190, y);
    y += 8;

    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text("Incident Description:", 20, y);
    y += lineH;

    pdfDoc.setFont("helvetica", "normal");
    const splitDesc = pdfDoc.splitTextToSize(desc, 165);
    pdfDoc.text(splitDesc, 20, y);
    y += splitDesc.length * 6 + 10;

    if (y > 240) y = 240;
    y += 20;
    pdfDoc.setDrawColor(0, 0, 0);
    pdfDoc.line(20, y, 80, y);
    pdfDoc.text("Verified by: KALASAG Personnel", 20, y + 6);
    pdfDoc.line(120, y, 180, y);
    pdfDoc.text("Date Signed", 120, y + 6);

    pdfDoc.setFontSize(8);
    pdfDoc.setTextColor(128, 128, 128);
    pdfDoc.save(`KALASAG_${blotterId.replace(/\s+/g, "_")}.pdf`);
  };


  if (loading) {
    return (
      <div className="login-container" id="blotters-loading">
        <div className="loader"></div>
      </div>
    );
  }

  const renderSortIndicator = (field) => {
    if (sortField !== field) return null;
    return sortAsc ? " ▴" : " ▾";
  };

  return (
    <>
      <header className="header" id="blotters-header">
        <div className="header-title-sec">
          <h2>Official Incident Blotters</h2>
        </div>
        <div className="header-stats">
          <div className="stat-chip">
            <span>{filteredAndSorted.length} of {incidents.length} records</span>
          </div>
        </div>
      </header>

      <div className="page-content" id="blotters-content">
        {/* Search and Filters */}
        <div className="page-toolbar">
          <div className="page-search-wrapper">
            <span className="page-search-icon">
              <SearchIcon size={18} />
            </span>
            <input
              type="text"
              className="page-search-input"
              placeholder="Search by ID, reporter, description, category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              id="blotter-search-field"
            />
          </div>

          <select
            className="page-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            id="blotter-status-filter"
          >
            <option value="all">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
        </div>

        {/* Blotters Table */}
        <div className="data-table-card">
          <div className="data-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => handleSort("blotter_id")}>
                    Blotter ID{renderSortIndicator("blotter_id")}
                  </th>
                  <th className="sortable" onClick={() => handleSort("report_date")}>
                    Date{renderSortIndicator("report_date")}
                  </th>
                  <th className="sortable" onClick={() => handleSort("category")}>
                    Category{renderSortIndicator("category")}
                  </th>
                  <th className="sortable" onClick={() => handleSort("priority_level")}>
                    Priority{renderSortIndicator("priority_level")}
                  </th>
                  <th className="sortable" onClick={() => handleSort("reporter_name")}>
                    Reporter{renderSortIndicator("reporter_name")}
                  </th>
                  <th className="sortable" onClick={() => handleSort("status")}>
                    Status{renderSortIndicator("status")}
                  </th>
                  <th className="cell-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan="7">No incident records found.</td>
                  </tr>
                ) : (
                  filteredAndSorted.map((inc) => {
                    const blotterId = formatBlotterId(inc);

                    const badgeClass = CATEGORY_BADGES[inc.category]?.class || "badge-green";
                    const badgeLabel = CATEGORY_BADGES[inc.category]?.label || "Other";
                    const statusClass = STATUS_CLASSES[inc.status] || "status-pending";

                    return (
                      <tr 
                        key={inc.id} 
                        className="clickable"
                        onClick={() => handleOpenDetails(inc)}
                      >
                        <td>
                          <span className="badge-blotter-id">{blotterId}</span>
                        </td>
                        <td className="cell-muted">
                          {inc.report_date ? new Date(inc.report_date.seconds ? inc.report_date.seconds * 1000 : inc.report_date).toLocaleDateString("en-PH") : "N/A"}
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
                        </td>
                        <td>
                          <span className={`badge ${inc.priority_level === "High" ? "badge-red" : inc.priority_level === "Medium" ? "badge-orange" : "badge-green"}`}>
                            {inc.priority_level || "Medium"}
                          </span>
                        </td>
                        <td>{inc.reporter_name || "Anonymous"}</td>
                        <td>
                          <span className={`status-label ${statusClass}`} style={{ fontWeight: "700" }}>
                            {inc.status || "Pending"}
                          </span>
                        </td>
                        <td className="cell-right" onClick={(e) => e.stopPropagation()}>
                          {hasPermission(role, "export:pdf") && (
                            <button
                              className="btn btn-google"
                              onClick={() => handleDownloadPDF(inc)}
                              style={{ width: "auto", padding: "6px 12px", fontSize: "11px", gap: "6px" }}
                            >
                              <FileIcon size={12} /> Get Blotter
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Interactive Detail Modal inside Blotter Page */}
      {modalOpen && selectedIncident && (
        <div className="modal-overlay" id="incident-detail-modal" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Blotter Record Details</h3>
              <button className="btn-close" onClick={handleCloseModal} id="modal-close-btn">
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Identifiers Header Strip */}
              <div className="modal-id-row">
                <div className="modal-id-box blotter-id-box">
                  <span className="modal-id-label">BLOTTER ENTRY ID</span>
                  <span className="modal-id-value">{formatBlotterId(selectedIncident)}</span>
                </div>
                <div className="modal-id-box system-id-box">
                  <span className="modal-id-label">FIRESTORE REF</span>
                  <span className="modal-id-value mono-small">{selectedIncident.id.substring(0, 10)}...</span>
                </div>
              </div>

              {/* Flagged Banner */}
              {selectedIncident.flagged && (
                <div className="error-message" style={{ margin: "0 0 20px 0", background: "var(--color-red-glow)", borderColor: "var(--color-red)" }} role="alert">
                  <AlertIcon size={16} color="var(--color-red)" style={{ display: "inline", verticalAlign: "text-bottom", marginRight: "6px" }} />
                  <strong>Flagged for Review:</strong> {selectedIncident.flag_reason}
                </div>
              )}


              {/* Classification Grid */}
              <div className="modal-section-grid">
                <div className="detail-block">
                  <h4>Category</h4>
                  <p>
                    <span className={`badge ${(CATEGORY_BADGES[selectedIncident.category] || CATEGORY_BADGES["other disaster-related incidents"]).class}`}>
                      {(selectedIncident.category || "unclassified").toUpperCase()}
                    </span>
                  </p>
                </div>
                <div className="detail-block">
                  <h4>Priority</h4>
                  <p>{selectedIncident.priority_level || "N/A"}</p>
                </div>
                <div className="detail-block">
                  <h4>Date Reported</h4>
                  <p>
                    {selectedIncident.report_date 
                      ? new Date(selectedIncident.report_date.seconds ? selectedIncident.report_date.seconds * 1000 : selectedIncident.report_date).toLocaleString("en-PH", {
                          year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true
                        })
                      : "Unknown"}
                  </p>
                </div>
                <div className="detail-block">
                  <h4>Status</h4>
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

              {/* Media Evidence */}
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

            {/* Footer actions */}
            <div className="modal-footer" style={{ flexDirection: "column", gap: "16px", alignItems: "stretch" }}>
              {hasPermission(role, "update:incident-status") && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  {/* Status Assignment */}
                  <div className="status-controls" style={{ flexGrow: 1, minWidth: "200px" }}>
                    <select
                      className="select-status"
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
                      onClick={handleUpdateStatus}
                      style={{ width: "auto", padding: "10px 20px", fontSize: "13px" }}
                    >
                      Update Status
                    </button>
                  </div>

                </div>
              )}

              {(hasPermission(role, "update:incident-status") || hasPermission(role, "export:pdf")) && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderTop: "1px solid var(--glass-border)", paddingTop: "12px" }}>
                  {hasPermission(role, "update:incident-status") ? (
                    <button
                      className="btn btn-google"
                      onClick={handleFlagIncident}
                      style={{ width: "auto", padding: "10px 20px", fontSize: "13px", color: "var(--text-danger)", borderColor: "var(--color-red)", gap: "6px" }}
                    >
                      <FlagIcon size={14} color="var(--text-danger)" /> Flag Misclassified
                    </button>
                  ) : <div />}
                  {hasPermission(role, "export:pdf") && (
                    <button
                      className="btn btn-google"
                      onClick={() => handleDownloadPDF(selectedIncident)}
                      style={{ width: "auto", padding: "10px 20px", fontSize: "13px", gap: "6px" }}
                    >
                      <FileIcon size={14} /> Generate Blotter
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
