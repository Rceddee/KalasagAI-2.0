"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";


import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import { Bar, Pie, Line, Doughnut } from "react-chartjs-2";
import { useAuth, hasPermission } from "@/lib/auth-context";
import { useTheme } from "@/components/ThemeContext";
import { useRouter } from "next/navigation";
import { downloadChartPdf, downloadRecordsPdf } from "@/lib/pdf-export";
import {
  DownloadIcon,
  FileIcon,
  SearchIcon,
  AlertIcon,
  CloseIcon,
  FilterIcon,
  ChartIcon,
} from "@/components/Icons";
import { formatBlotterId, matchIncidentId } from "@/lib/id-helper";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

const CATEGORY_LABELS = {
  "flooding": "Flooding",
  "fire incident": "Fire",
  "road obstruction": "Road Obstruction",
  "medical emergency": "Medical",
  "other disaster-related incidents": "Other",
};

const CATEGORY_COLORS = {
  "flooding": "#1565C0",
  "fire incident": "#C62828",
  "road obstruction": "#E65100",
  "medical emergency": "#F9A825",
  "other disaster-related incidents": "#2E7D32",
};

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

export default function AnalyticsPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Timeframe selector for AI Volume & Reports
  const [timeframe, setTimeframe] = useState("all"); // "24h", "7d", "30d", "all"

  // Interactive Data Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFilterTitle, setModalFilterTitle] = useState("All Incidents");
  const [modalIncidents, setModalIncidents] = useState([]);
  const [modalSearch, setModalSearch] = useState("");

  // Detailed single incident view from inside analytics modal
  const [selectedIncident, setSelectedIncident] = useState(null);

  // Chart canvas references for PNG export
  const categoryChartRef = useRef(null);
  const priorityChartRef = useRef(null);
  const lifecycleChartRef = useRef(null);
  const volumeChartRef = useRef(null);

  const { role } = useAuth();
  const router = useRouter();
  const [now] = useState(() => Date.now());

  const accessChecked = useMemo(() => {
    return !!(role && hasPermission(role, "view:analytics"));
  }, [role]);

  useEffect(() => {
    if (role && !hasPermission(role, "view:analytics")) {
      router.replace("/dashboard");
    }
  }, [role, router]);

  useEffect(() => {
    if (!accessChecked) return;
    const unsubscribe = onSnapshot(collection(db, "incident_reports"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort newest first
      data.sort((a, b) => {
        const timeA = a.report_date?.seconds
          ? a.report_date.seconds * 1000
          : (a.created_at ? new Date(a.created_at).getTime() : 0);
        const timeB = b.report_date?.seconds
          ? b.report_date.seconds * 1000
          : (b.created_at ? new Date(b.created_at).getTime() : 0);
        return timeB - timeA;
      });
      setIncidents(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [accessChecked]);



  // Filter incidents based on selected timeframe
  const timeframeIncidents = useMemo(() => {
    if (timeframe === "all") return incidents;
    const limits = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    const maxAge = limits[timeframe] || Infinity;

    return incidents.filter(inc => {
      const time = inc.report_date?.seconds
        ? inc.report_date.seconds * 1000
        : (inc.created_at ? new Date(inc.created_at).getTime() : 0);
      return now - time <= maxAge;
    });
  }, [incidents, timeframe, now]);

  // Compute advanced metrics
  const stats = useMemo(() => {
    const activeList = timeframeIncidents;
    const total = activeList.length;
    const pending = activeList.filter(i => i.status === "Pending").length;
    const active = activeList.filter(i => i.status === "In Progress").length;
    const resolved = activeList.filter(i => i.status === "Resolved" || i.status === "Closed").length;
    const flagged = activeList.filter(i => i.flagged).length;

    // Advanced rates
    const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) : "0.0";
    const verificationRate = total > 0 ? (((total - pending) / total) * 100).toFixed(1) : "0.0";
    const aiAccuracy = total > 0 ? (((total - flagged) / total) * 100).toFixed(1) : "100.0";

    const categoriesCount = {
      flooding: 0,
      "fire incident": 0,
      "road obstruction": 0,
      "medical emergency": 0,
      "other disaster-related incidents": 0,
    };
    const prioritiesCount = { High: 0, Medium: 0, Low: 0 };
    const dailyCount = {};

    activeList.forEach(inc => {
      const cat = inc.category || "other disaster-related incidents";
      if (categoriesCount[cat] !== undefined) categoriesCount[cat]++;
      else categoriesCount["other disaster-related incidents"]++;

      const prio = inc.priority_level || "Medium";
      if (prioritiesCount[prio] !== undefined) prioritiesCount[prio]++;
      
      if (inc.report_date) {
        const date = inc.report_date.seconds 
          ? new Date(inc.report_date.seconds * 1000) 
          : new Date(inc.report_date);
        const dayStr = date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
        dailyCount[dayStr] = (dailyCount[dayStr] || 0) + 1;
      }
    });

    // Peak volume & average calculation
    const dailyValues = Object.values(dailyCount);
    const peakVolume = dailyValues.length > 0 ? Math.max(...dailyValues) : 0;
    const daysCount = Math.max(dailyValues.length, 1);
    const avgDailyVolume = (total / daysCount).toFixed(1);
    const isSurge = peakVolume >= 10 || (daysCount > 0 && parseFloat(avgDailyVolume) >= 8);

    return {
      total,
      pending,
      active,
      resolved,
      flagged,
      resolutionRate,
      verificationRate,
      aiAccuracy,
      categoriesCount,
      prioritiesCount,
      dailyCount,
      peakVolume,
      avgDailyVolume,
      isSurge,
    };
  }, [timeframeIncidents]);

  // Open interactive breakdown modal with specific subset
  const openBreakdown = useCallback((title, filteredList) => {
    setModalFilterTitle(title);
    setModalIncidents(filteredList);
    setModalSearch("");
    setSelectedIncident(null);
    setModalOpen(true);
  }, []);

  // Helper for clicking category chart
  const handleCategoryClick = useCallback((categoryKey, categoryLabel) => {
    const matched = timeframeIncidents.filter(i => (i.category || "other disaster-related incidents") === categoryKey);
    openBreakdown(`Emergency Category: ${categoryLabel} (${matched.length})`, matched);
  }, [timeframeIncidents, openBreakdown]);

  // Helper for clicking priority chart
  const handlePriorityClick = useCallback((prio) => {
    const matched = timeframeIncidents.filter(i => (i.priority_level || "Medium") === prio);
    openBreakdown(`Priority Level: ${prio} (${matched.length})`, matched);
  }, [timeframeIncidents, openBreakdown]);

  // Helper for clicking lifecycle chart
  const handleLifecycleClick = useCallback((statusType) => {
    let matched = [];
    if (statusType === "Pending") matched = timeframeIncidents.filter(i => i.status === "Pending");
    else if (statusType === "Active") matched = timeframeIncidents.filter(i => i.status === "In Progress");
    else matched = timeframeIncidents.filter(i => i.status === "Resolved" || i.status === "Closed");
    openBreakdown(`Case Lifecycle: ${statusType} (${matched.length})`, matched);
  }, [timeframeIncidents, openBreakdown]);

  // Helper for clicking volume day
  const handleDateClick = useCallback((dayStr) => {
    const matched = timeframeIncidents.filter(inc => {
      if (!inc.report_date) return false;
      const d = inc.report_date.seconds ? new Date(inc.report_date.seconds * 1000) : new Date(inc.report_date);
      return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) === dayStr;
    });
    openBreakdown(`Reports on ${dayStr} (${matched.length})`, matched);
  }, [timeframeIncidents, openBreakdown]);

  // Chart data configurations
  const categoryChartData = {
    labels: Object.keys(stats.categoriesCount).map(k => CATEGORY_LABELS[k] || k),
    datasets: [
      {
        label: "Incidents Reported",
        data: Object.values(stats.categoriesCount),
        backgroundColor: Object.keys(stats.categoriesCount).map(k => CATEGORY_COLORS[k] || "#7B1FA2"),
        borderColor: "rgba(255,255,255,0.15)",
        borderWidth: 1,
        hoverBorderWidth: 2,
      },
    ],
  };

  const priorityChartData = {
    labels: ["High", "Medium", "Low"],
    datasets: [
      {
        data: [stats.prioritiesCount.High, stats.prioritiesCount.Medium, stats.prioritiesCount.Low],
        backgroundColor: ["#C62828", "#F9A825", "#2E7D32"],
        hoverBackgroundColor: ["#E53935", "#FBC02D", "#43A047"],
        borderWidth: 0,
      },
    ],
  };

  const statusDoughnutData = {
    labels: ["Pending Verification", "Active Dispatches", "Resolved / Closed"],
    datasets: [
      {
        data: [stats.pending, stats.active, stats.resolved],
        backgroundColor: ["#F9A825", "#E65100", "#2E7D32"],
        hoverBackgroundColor: ["#FBC02D", "#EF6C00", "#388E3C"],
        borderWidth: 0,
      },
    ],
  };

  // Volume chart with last 14 entries
  const volumeLabels = Object.keys(stats.dailyCount).reverse().slice(0, 14).reverse();
  const volumeValues = Object.values(stats.dailyCount).reverse().slice(0, 14).reverse();

  const lineChartData = {
    labels: volumeLabels.length > 0 ? volumeLabels : ["No Reports"],
    datasets: [
      {
        label: "AI Incident Volume",
        data: volumeValues.length > 0 ? volumeValues : [0],
        fill: true,
        borderColor: "#E65100",
        backgroundColor: "rgba(230, 81, 0, 0.18)",
        tension: 0.35,
        pointBackgroundColor: "#E65100",
        pointBorderColor: "#FFFFFF",
        pointHoverRadius: 7,
        pointRadius: 5,
      },
    ],
  };

  const { theme } = useTheme();
  const isLight = theme === "light";
  const textColor = isLight ? "#0F172A" : "#FFFFFF";
  const mutedTextColor = isLight ? "#475569" : "#8E9AA8";
  const gridColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";

  // Interactive chart options with clickable elements
  const barChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onHover: (event, elements) => {
      if (event.native && event.native.target) {
        event.native.target.style.cursor = elements.length > 0 ? "pointer" : "default";
      }
    },
    onClick: (event, elements) => {
      if (!elements || elements.length === 0) return;
      const index = elements[0].index;
      const keys = Object.keys(stats.categoriesCount);
      const catKey = keys[index];
      const catLabel = CATEGORY_LABELS[catKey] || catKey;
      handleCategoryClick(catKey, catLabel);
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          afterLabel: () => "💡 Click bar to view records",
        },
      },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: mutedTextColor } },
      y: { grid: { color: gridColor }, ticks: { color: mutedTextColor, stepSize: 1 } },
    },
  }), [stats.categoriesCount, gridColor, mutedTextColor, handleCategoryClick]);

  const priorityPieOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onHover: (event, elements) => {
      if (event.native && event.native.target) {
        event.native.target.style.cursor = elements.length > 0 ? "pointer" : "default";
      }
    },
    onClick: (event, elements) => {
      if (!elements || elements.length === 0) return;
      const labels = ["High", "Medium", "Low"];
      const prio = labels[elements[0].index];
      handlePriorityClick(prio);
    },
    plugins: {
      legend: {
        labels: { color: textColor, font: { family: "var(--font-family)" } },
        position: "bottom",
      },
      tooltip: {
        callbacks: {
          afterLabel: () => "💡 Click slice to view records",
        },
      },
    },
  }), [textColor, handlePriorityClick]);

  const lifecycleDoughnutOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onHover: (event, elements) => {
      if (event.native && event.native.target) {
        event.native.target.style.cursor = elements.length > 0 ? "pointer" : "default";
      }
    },
    onClick: (event, elements) => {
      if (!elements || elements.length === 0) return;
      const types = ["Pending", "Active", "Resolved"];
      handleLifecycleClick(types[elements[0].index]);
    },
    plugins: {
      legend: {
        labels: { color: textColor, font: { family: "var(--font-family)" } },
        position: "bottom",
      },
      tooltip: {
        callbacks: {
          afterLabel: () => "💡 Click segment to view records",
        },
      },
    },
  }), [textColor, handleLifecycleClick]);

  const volumeLineOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onHover: (event, elements) => {
      if (event.native && event.native.target) {
        event.native.target.style.cursor = elements.length > 0 ? "pointer" : "default";
      }
    },
    onClick: (event, elements) => {
      if (!elements || elements.length === 0) return;
      const idx = elements[0].index;
      const dayStr = volumeLabels[idx];
      if (dayStr && dayStr !== "No Reports") {
        handleDateClick(dayStr);
      }
    },
    plugins: {
      legend: {
        labels: { color: textColor, font: { family: "var(--font-family)" } },
      },
      tooltip: {
        callbacks: {
          afterLabel: () => "💡 Click data point to view date records",
        },
      },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: mutedTextColor } },
      y: { grid: { color: gridColor }, ticks: { color: mutedTextColor, stepSize: 1 } },
    },
  }), [textColor, mutedTextColor, gridColor, volumeLabels, handleDateClick]);

  // Export Analytics to PDF
  const handleDownloadPDFReport = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("MUNICIPALITY OF GUMACA — MDRRMO", 105, 18, { align: "center" });

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("KalasagAI Emergency Analytics & Statistical Summary", 105, 26, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Timeframe Scope: ${timeframe.toUpperCase()} | Generated: ${new Date().toLocaleString("en-PH")}`, 105, 33, { align: "center" });

    doc.setDrawColor(198, 40, 40);
    doc.setLineWidth(0.8);
    doc.line(20, 37, 190, 37);

    let y = 46;

    // KPI Summary Section
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("1. Operational KPI Metrics", 20, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const kpis = [
      ["Total Emergency Incidents Logged", `${stats.total} Reports`],
      ["Citizen Report Verification Rate", `${stats.verificationRate}%`],
      ["Incident Resolution & Closure Rate", `${stats.resolutionRate}%`],
      ["AI Zero-Shot Classification Accuracy", `${stats.aiAccuracy}%`],
      ["Misclassified Reports Flagged by Staff", `${stats.flagged} Incidents`],
      ["Peak Daily Incident Volume", `${stats.peakVolume} Reports/Day`],
    ];

    kpis.forEach(([label, val]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 25, y);
      doc.setFont("helvetica", "normal");
      doc.text(val, 150, y);
      y += 6;
    });

    y += 6;
    doc.line(20, y, 190, y);
    y += 10;

    // Category Distribution Section
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("2. Emergency Incidents by Category", 20, y);
    y += 8;

    doc.setFontSize(10);
    Object.entries(stats.categoriesCount).forEach(([catKey, count]) => {
      const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : "0.0";
      const catLabel = CATEGORY_LABELS[catKey] || catKey;
      doc.setFont("helvetica", "bold");
      doc.text(catLabel, 25, y);
      doc.setFont("helvetica", "normal");
      doc.text(`${count} (${pct}%)`, 150, y);
      y += 6;
    });

    y += 6;
    doc.line(20, y, 190, y);
    y += 10;

    // Priority Distribution Section
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("3. Priority Level Distribution", 20, y);
    y += 8;

    doc.setFontSize(10);
    ["High", "Medium", "Low"].forEach((prio) => {
      const count = stats.prioritiesCount[prio] || 0;
      const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : "0.0";
      doc.setFont("helvetica", "bold");
      doc.text(`${prio} Priority`, 25, y);
      doc.setFont("helvetica", "normal");
      doc.text(`${count} (${pct}%)`, 150, y);
      y += 6;
    });

    y += 14;
    doc.line(20, y, 80, y);
    doc.line(120, y, 180, y);
    doc.setFontSize(9);
    doc.text("Prepared by: KALASAG System", 20, y + 6);
    doc.text("Verified by: MDRRMO Officer", 120, y + 6);

    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text("KALASAG AI Emergency Platform — Gumaca, Quezon. Data Privacy Act of 2012 (RA 10173) Compliant.", 105, 285, { align: "center" });

    doc.save(`KALASAG_Analytics_Summary_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Export current timeframe or filtered modal records as PDF.
  const handleExportPDF = async (targetList = timeframeIncidents, filename = "KALASAG_Analytics_Export") => {
    const total = targetList.length;
    const headers = [
      "Blotter ID",
      "Date",
      "Category",
      "Priority",
      "Status",
      "Reporter Name",
      "Contact",
      "Latitude",
      "Longitude",
      "AI Confidence",
      "AI Reasoning",
      "Flagged Misclassified"
    ];

    const rows = targetList.map((inc) => {
      const bId = formatBlotterId(inc);
      const dateStr = inc.report_date?.seconds
        ? new Date(inc.report_date.seconds * 1000).toISOString()
        : (inc.created_at || "N/A");

      return [
        bId,
        dateStr,
        inc.category || 'N/A',
        inc.priority_level || 'Medium',
        inc.status || 'Pending',
        inc.reporter_name || 'Anonymous',
        inc.reporter_contact || 'N/A',
        inc.latitude ?? '',
        inc.longitude ?? '',
        inc.confidence_score ? `${(inc.confidence_score * 100).toFixed(1)}%` : 'N/A',
        inc.reasoning || '',
        inc.flagged ? 'Yes' : 'No'
      ];
    });
    await downloadRecordsPdf({
      title: "Analytics Incident Export",
      headers,
      rows,
      filename: `${filename}_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Save specific chart in a PDF document.
  const handleSaveChartPdf = async (chartRef, title) => {
    if (!chartRef.current) return;
    const base64 = chartRef.current.toBase64Image();
    await downloadChartPdf(
      base64,
      title.replace(/_/g, " "),
      `KALASAG_Chart_${title.replace(/\s+/g, "_")}.pdf`
    );
  };

  // Filtered incidents within the interactive breakdown modal
  const modalFilteredIncidents = useMemo(() => {
    if (!modalSearch.trim()) return modalIncidents;
    return modalIncidents.filter((inc) => {
      return (
        matchIncidentId(inc, modalSearch) ||
        (inc.reporter_name || "").toLowerCase().includes(modalSearch.toLowerCase()) ||
        (inc.incident_description || "").toLowerCase().includes(modalSearch.toLowerCase()) ||
        (inc.category || "").toLowerCase().includes(modalSearch.toLowerCase()) ||
        (inc.status || "").toLowerCase().includes(modalSearch.toLowerCase())
      );
    });
  }, [modalIncidents, modalSearch]);

  if (loading || !accessChecked) {
    return (
      <div className="login-container" id="analytics-loading">
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <>
      <header className="header" id="analytics-header">
        <div className="header-title-sec">
          <h2>System Analytics &amp; Statistics</h2>
          <span className="analytics-subtitle">Interactive Real-time Incident Intelligence</span>
        </div>

        <div className="analytics-header-actions">
          {/* Timeframe Scope Selector */}
          <div className="analytics-timeframe-group" role="group" aria-label="Timeframe filter">
            {[
              { id: "24h", label: "24h" },
              { id: "7d", label: "7 Days" },
              { id: "30d", label: "30 Days" },
              { id: "all", label: "All Time" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`timeframe-btn ${timeframe === t.id ? "active" : ""}`}
                onClick={() => setTimeframe(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Download Reports Buttons */}
          <div className="analytics-download-btns">
            <button
              type="button"
              className="btn btn-primary"
              id="analytics-download-pdf-btn"
              onClick={handleDownloadPDFReport}
              style={{ padding: "8px 14px", fontSize: "12px", gap: "6px", width: "auto" }}
            >
              <FileIcon size={14} /> Download PDF Report
            </button>
            <button
              type="button"
              className="btn btn-google"
              id="analytics-export-pdf-btn"
              onClick={() => handleExportPDF(timeframeIncidents, "KALASAG_Analytics_Data")}
              style={{ padding: "8px 14px", fontSize: "12px", gap: "6px", width: "auto" }}
            >
              <DownloadIcon size={14} /> Export PDF
            </button>
          </div>
        </div>
      </header>

      <div className="page-content" id="analytics-content">
        {/* Interactive Metric Summary Cards */}
        <div className="analytics-metrics-row">
          <div
            className="analytics-metric-card clickable"
            onClick={() => openBreakdown(`Total Incident Reports (${timeframeIncidents.length})`, timeframeIncidents)}
            title="Click to view all incidents in this timeframe"
          >
            <span className="analytics-metric-label">Total Reports</span>
            <span className="analytics-metric-value">{stats.total}</span>
            <span className="analytics-card-hint">👆 Click to show data</span>
          </div>

          <div
            className="analytics-metric-card accent-yellow clickable"
            onClick={() => {
              const matched = timeframeIncidents.filter(i => i.status === "Pending");
              openBreakdown(`Pending Verification Reports (${matched.length})`, matched);
            }}
            title="Click to view unverified pending reports"
          >
            <span className="analytics-metric-label">Verification Rate</span>
            <span className="analytics-metric-value" style={{ color: "var(--color-yellow)" }}>
              {stats.verificationRate}%
            </span>
            <span className="analytics-card-hint">👆 {stats.pending} pending review</span>
          </div>

          <div
            className="analytics-metric-card accent-orange clickable"
            onClick={() => {
              const matched = timeframeIncidents.filter(i => i.status === "Resolved" || i.status === "Closed");
              openBreakdown(`Resolved Incident Case Logs (${matched.length})`, matched);
            }}
            title="Click to view resolved and closed incidents"
          >
            <span className="analytics-metric-label">Resolution Rate</span>
            <span className="analytics-metric-value" style={{ color: "var(--color-orange)" }}>
              {stats.resolutionRate}%
            </span>
            <span className="analytics-card-hint">👆 {stats.resolved} resolved cases</span>
          </div>

          <div
            className="analytics-metric-card accent-green clickable"
            onClick={() => {
              const matched = timeframeIncidents.filter(i => !i.flagged);
              openBreakdown(`Verified AI Accurate Incidents (${matched.length})`, matched);
            }}
            title="Click to view verified AI classifications"
          >
            <span className="analytics-metric-label">AI Accuracy Rate</span>
            <span className="analytics-metric-value" style={{ color: "var(--color-green)" }}>
              {stats.aiAccuracy}%
            </span>
            <span className="analytics-card-hint">👆 Click to inspect</span>
          </div>

          <div
            className="analytics-metric-card accent-red clickable"
            onClick={() => {
              const matched = timeframeIncidents.filter(i => i.flagged);
              openBreakdown(`Flagged AI Classification Errors (${matched.length})`, matched);
            }}
            title="Click to view misclassified flagged incidents"
          >
            <span className="analytics-metric-label">Flagged AI Errors</span>
            <span className="analytics-metric-value" style={{ color: "var(--text-danger)" }}>
              {stats.flagged}
            </span>
            <span className="analytics-card-hint">👆 Click to inspect errors</span>
          </div>
        </div>

        {/* AI Incident Volume Tracker Card */}
        <div className="analytics-volume-section">
          <div className="analytics-volume-banner">
            <div className="volume-banner-left">
              <div className="volume-icon-badge">
                <ChartIcon size={20} color="var(--color-orange)" />
              </div>
              <div>
                <h3 className="volume-title">AI Incident Reporting Volume &amp; Surge Monitor</h3>
                <span className="volume-subtitle">
                  Throughput tracking across Gumaca Poblacion. Click any date or bar to inspect underlying records.
                </span>
              </div>
            </div>

            <div className="volume-banner-stats">
              <div className="volume-stat-pill">
                <span className="volume-pill-label">Daily Avg:</span>
                <span className="volume-pill-val">{stats.avgDailyVolume} reports</span>
              </div>
              <div className="volume-stat-pill">
                <span className="volume-pill-label">Peak Day:</span>
                <span className="volume-pill-val">{stats.peakVolume} reports</span>
              </div>
              <div className={`volume-surge-badge ${stats.isSurge ? "surge-active" : "surge-normal"}`}>
                <span className="surge-dot"></span>
                <span>{stats.isSurge ? "High Volume Surge Alert" : "Normal Incident Volume"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="analytics-charts-row">
          <div className="analytics-chart-card chart-tall">
            <div className="chart-card-header">
              <h3 className="analytics-chart-title">Case Lifecycle Ratio</h3>
              <button
                type="button"
                className="btn-chart-save"
                onClick={() => handleSaveChartPdf(lifecycleChartRef, "Lifecycle_Ratio")}
                title="Download Chart as PDF"
              >
                Save PDF
              </button>
            </div>
            <div className="analytics-chart-body">
              <Doughnut ref={lifecycleChartRef} data={statusDoughnutData} options={lifecycleDoughnutOptions} />
            </div>
            <span className="chart-footer-hint">👆 Click any segment to view matching incidents</span>
          </div>

          <div className="analytics-chart-card chart-tall">
            <div className="chart-card-header">
              <h3 className="analytics-chart-title">Priority Level Split</h3>
              <button
                type="button"
                className="btn-chart-save"
                onClick={() => handleSaveChartPdf(priorityChartRef, "Priority_Split")}
                title="Download Chart as PDF"
              >
                Save PDF
              </button>
            </div>
            <div className="analytics-chart-body">
              <Pie ref={priorityChartRef} data={priorityChartData} options={priorityPieOptions} />
            </div>
            <span className="chart-footer-hint">👆 Click any slice to view priority list</span>
          </div>

          <div className="analytics-chart-card chart-tall">
            <div className="chart-card-header">
              <h3 className="analytics-chart-title">Incidents by Emergency Category</h3>
              <button
                type="button"
                className="btn-chart-save"
                onClick={() => handleSaveChartPdf(categoryChartRef, "Category_Distribution")}
                title="Download Chart as PDF"
              >
                Save PDF
              </button>
            </div>
            <div className="analytics-chart-body">
              <Bar ref={categoryChartRef} data={categoryChartData} options={barChartOptions} />
            </div>
            <span className="chart-footer-hint">👆 Click any bar to view category incidents</span>
          </div>
        </div>

        {/* Line Chart — Volume & Frequency */}
        <div className="analytics-chart-card chart-wide">
          <div className="chart-card-header">
            <h3 className="analytics-chart-title">Report Volume &amp; Frequency Over Time</h3>
            <button
              type="button"
              className="btn-chart-save"
              onClick={() => handleSaveChartPdf(volumeChartRef, "Volume_Timeline")}
              title="Download Chart as PDF"
            >
              Save PDF
            </button>
          </div>
          <div className="analytics-chart-body">
            <Line ref={volumeChartRef} data={lineChartData} options={volumeLineOptions} />
          </div>
          <span className="chart-footer-hint">👆 Click any day point on the line to see all reports on that date</span>
        </div>

      </div>

      {/* Interactive Data Breakdown Modal */}
      {modalOpen && (
        <div className="modal-overlay" id="analytics-data-modal" onClick={() => setModalOpen(false)}>
          <div className="modal-content analytics-drilldown-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="drilldown-icon-badge">
                  <FilterIcon size={18} color="var(--color-blue)" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800" }}>{modalFilterTitle}</h3>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    Showing {modalFilteredIncidents.length} of {modalIncidents.length} matching records
                  </span>
                </div>
              </div>
              <button
                className="btn-close"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ padding: "16px 20px" }}>
              {/* Modal Toolbar: Search + CSV Export */}
              <div className="drilldown-toolbar">
                <div className="drilldown-search-bar">
                  <SearchIcon size={16} color="var(--text-muted)" />
                  <input
                    type="text"
                    placeholder="Search by Blotter ID, Report ID, reporter, description..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="drilldown-search-input"
                    autoFocus
                  />
                  {modalSearch && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => setModalSearch("")}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-google"
                  onClick={() => handleExportPDF(modalFilteredIncidents, `Filtered_${modalFilterTitle.replace(/[^a-zA-Z0-9]/g, "_")}`)}
                  style={{ width: "auto", padding: "8px 14px", fontSize: "12px", gap: "6px" }}
                >
                  <DownloadIcon size={14} /> Export This View (PDF)
                </button>
              </div>

              {/* Drilldown Incidents Table */}
              <div className="drilldown-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Blotter ID</th>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Priority</th>
                      <th>Reporter</th>
                      <th>Status</th>
                      <th>AI Confidence</th>
                      <th className="cell-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalFilteredIncidents.length === 0 ? (
                      <tr className="empty-row">
                        <td colSpan="8">No records match your search filter.</td>
                      </tr>
                    ) : (
                      modalFilteredIncidents.map((inc) => {
                        const blotterId = formatBlotterId(inc);
                        const badgeInfo = CATEGORY_BADGES[inc.category] || CATEGORY_BADGES["other disaster-related incidents"];
                        const statusClass = STATUS_CLASSES[inc.status] || "status-pending";

                        return (
                          <tr key={inc.id} className="drilldown-row">
                            <td>
                              <span className="badge-blotter-id">{blotterId}</span>
                            </td>
                            <td className="cell-muted" style={{ fontSize: "11px" }}>
                              {inc.report_date
                                ? new Date(inc.report_date.seconds ? inc.report_date.seconds * 1000 : inc.report_date).toLocaleDateString("en-PH")
                                : "N/A"}
                            </td>
                            <td>
                              <span className={`badge ${badgeInfo.class}`}>{badgeInfo.label}</span>
                            </td>
                            <td>
                              <span className={`badge ${inc.priority_level === "High" ? "badge-red" : inc.priority_level === "Medium" ? "badge-orange" : "badge-green"}`}>
                                {inc.priority_level || "Medium"}
                              </span>
                            </td>
                            <td style={{ fontSize: "12px" }}>{inc.reporter_name || "Anonymous"}</td>
                            <td>
                              <span className={`status-label ${statusClass}`} style={{ fontWeight: "700" }}>
                                {inc.status || "Pending"}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: "11px", fontWeight: "700", color: inc.flagged ? "var(--color-red)" : "var(--color-green)" }}>
                                {inc.confidence_score ? `${(inc.confidence_score * 100).toFixed(0)}%` : "N/A"}
                                {inc.flagged && " (Flagged)"}
                              </span>
                            </td>
                            <td className="cell-right">
                              <button
                                type="button"
                                className="btn btn-google btn-sm"
                                onClick={() => setSelectedIncident(inc)}
                                style={{ width: "auto", padding: "4px 8px", fontSize: "11px" }}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer" style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Click &ldquo;View&rdquo; on any entry to see complete details and AI reasoning.
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setModalOpen(false)}
                style={{ width: "auto", padding: "6px 18px", fontSize: "12px" }}
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nested Single Incident Detail Inspector */}
      {selectedIncident && (
        <div className="modal-overlay" id="analytics-incident-inspector" onClick={() => setSelectedIncident(null)} style={{ zIndex: 1001 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <h3>Incident Record Details</h3>
              <button className="btn-close" onClick={() => setSelectedIncident(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Identifiers Header Strip */}
              <div className="modal-id-row">
                <div className="modal-id-box blotter-id-box">
                  <span className="modal-id-label">BLOTTER ID</span>
                  <span className="modal-id-value">{formatBlotterId(selectedIncident)}</span>
                </div>
                <div className="modal-id-box system-id-box">
                  <span className="modal-id-label">FIRESTORE REF</span>
                  <span className="modal-id-value mono-small">{selectedIncident.id.substring(0, 10)}...</span>
                </div>
              </div>

              {selectedIncident.flagged && (
                <div className="error-message" style={{ margin: "0 0 16px 0", background: "var(--color-red-glow)", borderColor: "var(--color-red)" }}>
                  <AlertIcon size={16} color="var(--color-red)" />
                  <strong>Flagged as Misclassified:</strong> {selectedIncident.flag_reason}
                </div>
              )}

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
                  <p>{selectedIncident.priority_level || "Medium"}</p>
                </div>
                <div className="detail-block">
                  <h4>Status</h4>
                  <p className={STATUS_CLASSES[selectedIncident.status] || "status-pending"}>
                    {selectedIncident.status || "Pending"}
                  </p>
                </div>
                <div className="detail-block">
                  <h4>AI Confidence</h4>
                  <p>{selectedIncident.confidence_score ? `${(selectedIncident.confidence_score * 100).toFixed(1)}%` : "N/A"}</p>
                </div>
              </div>

              <div className="detail-block" style={{ marginTop: "12px" }}>
                <h4>Incident Description</h4>
                <div className="description-text">
                  {selectedIncident.incident_description || "No description provided."}
                </div>
              </div>

              {selectedIncident.reasoning && (
                <div className="detail-block" style={{ marginTop: "12px" }}>
                  <h4>AI NLP Classification Reasoning</h4>
                  <div className="description-text" style={{ fontStyle: "italic", color: "var(--text-secondary)" }}>
                    &ldquo;{selectedIncident.reasoning}&rdquo;
                  </div>
                </div>
              )}

              <div className="modal-section-grid" style={{ marginTop: "12px" }}>
                <div className="detail-block">
                  <h4>Reporter</h4>
                  <p>{selectedIncident.reporter_name || "Anonymous"}</p>
                </div>
                <div className="detail-block">
                  <h4>Contact</h4>
                  <p>{selectedIncident.reporter_contact || "Not provided"}</p>
                </div>
              </div>

              {/* Incident Pinpoint Map */}
              {selectedIncident.latitude && selectedIncident.longitude && (
                <div style={{ marginTop: "14px", borderRadius: "10px", overflow: "hidden", border: "1px solid var(--glass-border)", background: "var(--bg-secondary)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--glass-border)", background: "var(--surface-subtle)" }}>
                    <span style={{ fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                      📍 Location Pinpoint: [{Number(selectedIncident.latitude).toFixed(4)}, {Number(selectedIncident.longitude).toFixed(4)}]
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${selectedIncident.latitude},${selectedIncident.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ padding: "3px 8px", fontSize: "11px", textDecoration: "none" }}
                    >
                      Google Maps ↗
                    </a>
                  </div>
                  <div style={{ height: "180px", width: "100%" }}>
                    <iframe
                      title="Incident Pinpoint Map"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(selectedIncident.longitude) - 0.008},${Number(selectedIncident.latitude) - 0.006},${Number(selectedIncident.longitude) + 0.008},${Number(selectedIncident.latitude) + 0.006}&layer=mapnik&marker=${selectedIncident.latitude},${selectedIncident.longitude}`}
                      style={{ width: "100%", height: "100%", border: "none" }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setSelectedIncident(null)}
                style={{ width: "auto", padding: "6px 18px" }}
              >
                Back to Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
