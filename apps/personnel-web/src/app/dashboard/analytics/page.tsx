"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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
import { Bar, Doughnut } from "react-chartjs-2";
import { fetchStaffIncidents } from "@/lib/incidents";
import { downloadRecordsPdf } from "@/lib/pdf-export";
import { DownloadIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/components/ThemeContext";
import { calculateAiAccuracy, getAnalyticsCategory } from "@/lib/analytics";
import type { IncidentRecord } from "@/lib/types";

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

type AnalyticsTimeframe = "24h" | "7d" | "30d" | "all";

type TrendBucket = {
  key: string;
  label: string;
  start: number;
  end: number;
  count: number;
};

const INCIDENT_STATUSES = [
  { value: "pending", label: "Pending", color: "#F9A825" },
  { value: "in_progress", label: "In Progress", color: "#E65100" },
  { value: "resolved", label: "Resolved", color: "#2E7D32" },
  { value: "closed", label: "Closed", color: "#64748B" },
] as const satisfies ReadonlyArray<{
  value: IncidentRecord["status"];
  label: string;
  color: string;
}>;

function createTrendBuckets(incidents: IncidentRecord[], timeframe: AnalyticsTimeframe): TrendBucket[] {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  let firstStart: number;
  let bucketDuration: number;
  let bucketCount: number;
  let getLabel: (date: Date) => string;

  if (timeframe === "24h") {
    firstStart = now - dayMs;
    bucketDuration = hourMs;
    bucketCount = 24;
    getLabel = (date) => date.toLocaleTimeString("en-PH", { hour: "numeric" });
  } else if (timeframe === "7d" || timeframe === "30d") {
    bucketCount = timeframe === "7d" ? 7 : 30;
    firstStart = now - bucketCount * dayMs;
    bucketDuration = dayMs;
    getLabel = (date) => date.toLocaleDateString("en-PH", {
      ...(timeframe === "7d" ? { weekday: "short" as const } : {}),
      month: "numeric",
      day: "numeric",
    });
  } else {
    const earliestIncident = incidents.reduce(
      (earliest, incident) => Math.min(earliest, new Date(incident.created_at).getTime()),
      now,
    );
    const firstMonth = new Date(earliestIncident);
    firstMonth.setDate(1);
    firstMonth.setHours(0, 0, 0, 0);
    firstStart = firstMonth.getTime();
    bucketDuration = 0;
    bucketCount = Math.max(
      1,
      (new Date(now).getFullYear() - firstMonth.getFullYear()) * 12 +
        new Date(now).getMonth() - firstMonth.getMonth() + 1,
    );
    getLabel = (date) => date.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
  }

  const buckets: TrendBucket[] = Array.from({ length: bucketCount }, (_, index) => {
    const startDate = new Date(firstStart);
    if (timeframe === "all") startDate.setMonth(startDate.getMonth() + index);
    const start = startDate.getTime();
    const end = timeframe === "all"
      ? new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1).getTime()
      : start + bucketDuration;
    return {
      key: String(start),
      label: getLabel(startDate),
      start,
      end,
      count: 0,
    };
  });

  incidents.forEach((incident) => {
    const createdAt = new Date(incident.created_at).getTime();
    const bucket = buckets.find((candidate) => createdAt >= candidate.start && createdAt < candidate.end);
    if (bucket) bucket.count++;
  });

  return buckets;
}

export default function AnalyticsPage() {
  const toast = useToast();
  const { theme } = useTheme();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [metricsState, setMetricsState] = useState<"loading" | "ready" | "error">("loading");
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<IncidentRecord["status"] | null>(null);
  const [selectedTrendBucketKey, setSelectedTrendBucketKey] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [reportSort, setReportSort] = useState<"newest" | "oldest">("newest");
  const [reportsModalOpen, setReportsModalOpen] = useState(false);

  useEffect(() => {
    void fetchStaffIncidents()
      .then((records) => {
        setIncidents(records);
        setMetricsState("ready");
      })
      .catch((err) => {
        setMetricsState("error");
        console.error("Failed to load analytics data:", err);
        toast.error("Could not load analytics metrics.");
      });
  }, [toast]);

  useEffect(() => {
    if (!reportsModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReportsModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reportsModalOpen]);

  // Filter by timeframe
  const filteredIncidents = useMemo(() => {
    if (timeframe === "all") return incidents;
    const now = new Date().getTime();
    const msMap = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    const cutoff = now - msMap[timeframe];
    return incidents.filter((i) => new Date(i.created_at).getTime() >= cutoff);
  }, [incidents, timeframe]);

  const timeframeBuckets = useMemo(
    () => createTrendBuckets(filteredIncidents, timeframe),
    [filteredIncidents, timeframe],
  );
  const selectedTrendBucket = timeframeBuckets.find((bucket) => bucket.key === selectedTrendBucketKey) ?? null;

  const activeIncidents = useMemo(() => filteredIncidents.filter((incident) => {
    if (selectedCategory && getAnalyticsCategory(incident) !== selectedCategory) return false;
    if (selectedStatus && incident.status !== selectedStatus) return false;
    if (selectedTrendBucket) {
      const createdAt = new Date(incident.created_at).getTime();
      if (createdAt < selectedTrendBucket.start || createdAt >= selectedTrendBucket.end) return false;
    }
    return true;
  }), [filteredIncidents, selectedCategory, selectedStatus, selectedTrendBucket]);

  const hasActiveFilters = Boolean(selectedCategory || selectedStatus || selectedTrendBucket);

  // KPIs reflect all active chart filters.
  const total = activeIncidents.length;
  const resolved = activeIncidents.filter((i) => i.status === "resolved" || i.status === "closed").length;
  const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) : "0";
  const aiAccuracy = calculateAiAccuracy(activeIncidents);
  const aiAccuracyLabel = aiAccuracy.accuracyPercent === null
    ? "Unavailable"
    : `${aiAccuracy.accuracyPercent.toFixed(1)}%`;

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Flooding: 0,
      Fire: 0,
      "Road Obstruction": 0,
      "Road Accident": 0,
      Unclassified: 0,
      Medical: 0,
      Other: 0,
    };
    activeIncidents.forEach((i) => {
      counts[getAnalyticsCategory(i)]++;
    });
    return counts;
  }, [activeIncidents]);

  const statusCounts = useMemo(() => {
    return INCIDENT_STATUSES.map((status) => ({
      ...status,
      count: activeIncidents.filter((incident) => incident.status === status.value).length,
    }));
  }, [activeIncidents]);

  const trendBuckets = useMemo(
    () => timeframeBuckets.map((bucket) => ({
      ...bucket,
      count: activeIncidents.filter((incident) => {
        const createdAt = new Date(incident.created_at).getTime();
        return createdAt >= bucket.start && createdAt < bucket.end;
      }).length,
    })),
    [activeIncidents, timeframeBuckets],
  );

  const drilldownIncidents = useMemo(() => {
    return [...activeIncidents].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activeIncidents]);

  const searchedDrilldownIncidents = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();
    return drilldownIncidents
      .filter((incident) => !query || [
        incident.reference,
        incident.id,
        getAnalyticsCategory(incident),
        incident.status.replaceAll("_", " "),
        incident.location_label,
        incident.description,
      ].some((value) => value.toLowerCase().includes(query)))
      .sort((a, b) => {
        const order = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return reportSort === "newest" ? -order : order;
      });
  }, [drilldownIncidents, reportSearch, reportSort]);

  // Doughnut Chart Data
  const doughnutData = {
    labels: Object.keys(categoryCounts),
    datasets: [
      {
        data: Object.values(categoryCounts),
        backgroundColor: ["#1565C0", "#C62828", "#E65100", "#A93F62", "#64748B", "#F9A825", "#7B1FA2"],
        borderColor: theme === "dark" ? "#11151A" : "#FFFFFF",
        borderWidth: 2,
        offset: Object.keys(categoryCounts).map((category) => category === selectedCategory ? 10 : 0),
      },
    ],
  };

  const lifecycleData = useMemo(() => {
    return {
      labels: statusCounts.map((status) => status.label),
      datasets: [
        {
          data: statusCounts.map((status) => status.count),
          backgroundColor: statusCounts.map((status) => status.color),
          borderColor: theme === "dark" ? "#11151A" : "#FFFFFF",
          borderWidth: 2,
        },
      ],
    };
  }, [statusCounts, theme]);

  const trendData = useMemo(() => ({
    labels: trendBuckets.map((bucket) => bucket.label),
    datasets: [
      {
        label: "Incidents Recorded",
        data: trendBuckets.map((bucket) => bucket.count),
        backgroundColor: "#0EA5E9",
        borderColor: "#0284C7",
        borderWidth: 1,
        borderRadius: 8,
        borderSkipped: false,
        categoryPercentage: 0.55,
        barPercentage: 0.7,
        maxBarThickness: 52,
      },
    ],
  }), [trendBuckets]);

  const trendTitle = timeframe === "24h"
    ? "Reports in the past 24 hours"
    : timeframe === "7d"
      ? "Reports in the past 7 days"
      : timeframe === "30d"
        ? "Reports in the past 30 days"
        : "Reports by month";
  const timeframeLabel = timeframe === "24h"
    ? "past 24 hours"
    : timeframe === "7d"
      ? "past 7 days"
      : timeframe === "30d"
        ? "past 30 days"
        : "all time";

  const openReportsModal = () => {
    setReportSearch("");
    setReportSort("newest");
    setReportsModalOpen(true);
  };

  const handleExportPdf = () => {
    downloadRecordsPdf({
      title: `MDRRMO ANALYTICS SUMMARY REPORT (${timeframe.toUpperCase()})`,
      filename: `KALASAG_ANALYTICS_${new Date().toISOString().slice(0, 10)}`,
      headers: ["Metric", "Value", "Notes"],
      rows: [
        ["Total Reports Recorded", total, `Period: ${timeframe}`],
        ["Incidents Resolved / Closed", resolved, `${resolutionRate}% Resolution Rate`],
        ...statusCounts.map((status) => [`${status.label} Incidents`, status.count, "Case lifecycle status"]),
        ["AI suggestion accuracy", aiAccuracyLabel, `${aiAccuracy.reviewedCount} personnel-reviewed suggestions`],
        ...Object.entries(categoryCounts).map(([label, count]) => [label, count, "Incident category"]),
      ],
    });
  };

  if (metricsState !== "ready") return <p role="status">{metricsState === "loading" ? "Loading report statistics…" : "Report statistics are unavailable. Refresh the page to try again."}</p>;

  return (
    <div style={{ display: "contents" }}>
      <header className="header" id="analytics-header">
        <div className="header-title-sec">
          <h2>Reports and trends</h2>
          <span style={{ fontSize: "14px", color: "var(--text-muted)", marginLeft: "12px" }}>
            See report trends, response status, and AI suggestion accuracy.
          </span>
        </div>

        <div className="analytics-header-actions">
          <div className="analytics-timeframe-group" role="group" aria-label="Timeframe filter">
            {([
              { id: "24h", label: "24 hours" },
              { id: "7d", label: "7 Days" },
              { id: "30d", label: "30 Days" },
              { id: "all", label: "All Time" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={timeframe === t.id}
                className={`timeframe-btn ${timeframe === t.id ? "active" : ""}`}
                onClick={() => {
                  setTimeframe(t.id);
                  setSelectedCategory(null);
                  setSelectedStatus(null);
                  setSelectedTrendBucketKey(null);
                  setReportSearch("");
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            className="btn btn-google"
            onClick={handleExportPdf}
            style={{ width: "auto", padding: "8px 16px", fontSize: "14px", gap: "6px" }}
            type="button"
          >
            <DownloadIcon size={14} />
            <span>Export report summary</span>
          </button>
        </div>
      </header>

      <div className="page-content" id="analytics-content">
        {hasActiveFilters && (
          <div className="analytics-active-filters" aria-live="polite">
            <span className="analytics-filter-label">Filtered by</span>
            {selectedCategory && (
              <button
                type="button"
                className="analytics-filter-chip"
                aria-label={`Remove ${selectedCategory} category filter`}
                onClick={() => setSelectedCategory(null)}
              >
                Category: {selectedCategory} <span aria-hidden="true">×</span>
              </button>
            )}
            {selectedStatus && (
              <button
                type="button"
                className="analytics-filter-chip"
                aria-label={`Remove ${INCIDENT_STATUSES.find((status) => status.value === selectedStatus)?.label} status filter`}
                onClick={() => setSelectedStatus(null)}
              >
                Status: {INCIDENT_STATUSES.find((status) => status.value === selectedStatus)?.label} <span aria-hidden="true">×</span>
              </button>
            )}
            {selectedTrendBucket && (
              <button
                type="button"
                className="analytics-filter-chip"
                aria-label={`Remove ${selectedTrendBucket.label} time filter`}
                onClick={() => setSelectedTrendBucketKey(null)}
              >
                Period: {selectedTrendBucket.label} <span aria-hidden="true">×</span>
              </button>
            )}
            <button
              type="button"
              className="analytics-filter-clear"
              onClick={() => {
                setSelectedCategory(null);
                setSelectedStatus(null);
                setSelectedTrendBucketKey(null);
                setReportSearch("");
              }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Interactive Metric Summary Cards */}
        <div className="analytics-metrics-row">
          <div className="analytics-metric-card">
            <span className="analytics-metric-label">Total Reports</span>
            <span className="analytics-metric-value">{total}</span>
            <span className="analytics-card-hint">{hasActiveFilters ? "Matching reports" : `Time period: ${timeframeLabel}`}</span>
          </div>

          <div className="analytics-metric-card accent-yellow">
            <span className="analytics-metric-label">Resolution rate</span>
            <span className="analytics-metric-value" style={{ color: "var(--color-yellow)" }}>
              {resolutionRate}%
            </span>
            <span className="analytics-card-hint">{resolved} reports resolved or closed</span>
          </div>

          <div className="analytics-metric-card">
            <span className="analytics-metric-label">AI suggestion accuracy</span>
            <span
              className="analytics-metric-value"
              style={{ color: aiAccuracy.accuracyPercent === null ? "var(--text-muted)" : "var(--color-green)" }}
            >
              {aiAccuracyLabel}
            </span>
            <span className="analytics-card-hint">
              {aiAccuracy.reviewedCount > 0
                ? `Compared with ${aiAccuracy.reviewedCount} staff reviews`
                : "Available after personnel review AI suggestions"}
            </span>
          </div>
        </div>

      <div className="analytics-charts-grid">
        <div className="chart-panel analytics-interactive-chart">
          <div className="analytics-chart-heading">
            <h2>Reports by incident type</h2>
            <span>Select a section to see matching reports</span>
          </div>
          <div style={{ height: "260px", display: "flex", justifyContent: "center", alignItems: "center" }}>
            {total === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No data available for timeframe.</p>
            ) : (
              <Doughnut
                data={doughnutData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: (_event, elements) => {
                    const category = Object.keys(categoryCounts)[elements[0]?.index ?? -1];
                    if (!category) return;
                    setSelectedCategory((current) => current === category ? null : category);
                    openReportsModal();
                  },
                  plugins: {
                    legend: {
                      position: "bottom",
                      labels: { color: theme === "dark" ? "#A3B4CC" : "#334155", font: { size: 14 } },
                    },
                  },
                }}
              />
            )}
          </div>
        </div>

        <div className="chart-panel analytics-interactive-chart">
          <div className="analytics-chart-heading">
            <h2>Reports by status</h2>
            <span>Select a section to see matching reports</span>
          </div>
          <div style={{ height: "260px", display: "flex", justifyContent: "center", alignItems: "center" }}>
            {total === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No data available for timeframe.</p>
            ) : (
              <Doughnut
                data={lifecycleData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: (_event, elements) => {
                    const status = statusCounts[elements[0]?.index ?? -1];
                    if (!status) return;
                    setSelectedStatus((current) => current === status.value ? null : status.value);
                    openReportsModal();
                  },
                  plugins: {
                    legend: {
                      position: "bottom",
                      labels: { color: theme === "dark" ? "#A3B4CC" : "#334155", font: { size: 14 } },
                    },
                  },
                }}
              />
            )}
          </div>
        </div>

        <div className="chart-panel analytics-interactive-chart analytics-volume-chart">
          <div className="analytics-chart-heading">
            <h2>{trendTitle}</h2>
            <span>Select a bar to see matching reports</span>
          </div>
          <div style={{ height: "260px" }}>
            <Bar
              data={trendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                onClick: (_event, elements) => {
                  const bucket = trendBuckets[elements[0]?.index ?? -1];
                  if (!bucket) return;
                  setSelectedTrendBucketKey((current) => current === bucket.key ? null : bucket.key);
                  openReportsModal();
                },
                interaction: { intersect: false, mode: "index" },
                scales: {
                  x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                      color: theme === "dark" ? "#A3B4CC" : "#334155",
                      font: { size: 14 },
                      maxRotation: 0,
                      minRotation: 0,
                      maxTicksLimit: timeframe === "24h" ? 8 : timeframe === "30d" ? 10 : 12,
                    },
                  },
                  y: {
                    beginAtZero: true,
                    suggestedMax: Math.max(2, Math.ceil(Math.max(...trendBuckets.map((bucket) => bucket.count), 0) * 1.2)),
                    grid: { color: theme === "dark" ? "rgba(163, 180, 204, 0.12)" : "rgba(51, 65, 85, 0.12)" },
                    border: { display: false },
                    title: {
                      display: true,
                      text: "Reports",
                      color: theme === "dark" ? "#A3B4CC" : "#334155",
                    },
                    ticks: {
                      color: theme === "dark" ? "#A3B4CC" : "#334155",
                      font: { size: 14 },
                      stepSize: 1,
                      maxTicksLimit: 6,
                    },
                  },
                },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (context) => `${context.parsed.y} ${context.parsed.y === 1 ? "report" : "reports"}`,
                    },
                  },
                },
              }}
            />
          </div>
        </div>
      </div>

      <p className="analytics-interaction-hint">
        Select a chart segment or bar to filter all analytics and open matching reports.
      </p>

      {reportsModalOpen && (
        <div
          className="modal-overlay analytics-report-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setReportsModalOpen(false);
          }}
        >
          <section
            className="modal-content analytics-report-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="analytics-reports-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <h3 id="analytics-reports-title">Related Incident Reports</h3>
                <p className="analytics-report-modal-summary">
                  {[
                    selectedCategory && `Category: ${selectedCategory}`,
                    selectedStatus && `Status: ${INCIDENT_STATUSES.find((status) => status.value === selectedStatus)?.label}`,
                    selectedTrendBucket && `Period: ${selectedTrendBucket.label}`,
                  ].filter(Boolean).join(" · ") || `All reports · ${timeframe.toUpperCase()}`}
                  {" · "}
                  {drilldownIncidents.length} {drilldownIncidents.length === 1 ? "report" : "reports"}
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Close related incident reports"
                onClick={() => setReportsModalOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="modal-body analytics-report-modal-body">
              <div className="analytics-report-toolbar">
                <input
                  type="search"
                  className="analytics-report-search"
                  value={reportSearch}
                  onChange={(event) => setReportSearch(event.target.value)}
                  placeholder="Search reports by ID, category, status, or location"
                  aria-label="Search matching incident reports"
                  autoFocus
                />
                <label className="analytics-report-sort">
                  <span>Sort</span>
                  <select
                    value={reportSort}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value === "newest" || value === "oldest") setReportSort(value);
                    }}
                    aria-label="Sort incident reports"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </label>
                <span className="analytics-report-count">
                  Showing {searchedDrilldownIncidents.length} of {drilldownIncidents.length}
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="analytics-filter-clear"
                    onClick={() => {
                      setSelectedCategory(null);
                      setSelectedStatus(null);
                      setSelectedTrendBucketKey(null);
                      setReportSearch("");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {searchedDrilldownIncidents.length === 0 ? (
                <p className="analytics-drilldown-empty">
                  {reportSearch ? "No reports match your search." : "No reports match these filters."}
                </p>
              ) : (
                <div className="analytics-report-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Reported</th>
                        <th>Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchedDrilldownIncidents.map((incident) => (
                        <tr key={incident.id}>
                          <td>
                            <Link className="analytics-report-link" href={`/dashboard/blotters/${incident.id}`}>
                              {incident.reference || incident.id.slice(0, 8)}
                            </Link>
                          </td>
                          <td>{getAnalyticsCategory(incident)}</td>
                          <td>{incident.status.replaceAll("_", " ")}</td>
                          <td>
                            {new Date(incident.created_at).toLocaleString("en-PH", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </td>
                          <td>{incident.location_label || "Location unavailable"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
    </div>
  );
}
