"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
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
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { hasPermission, useAuth } from "@/lib/auth-context";
import { useTheme } from "@/components/ThemeContext";
import { useToast } from "@/components/Toast";
import { logSystemAction } from "@/lib/logs";
import {
  DEFAULT_AI_CONTROLS,
  saveAiControls,
  subscribeAiControls,
} from "@/lib/ai-config";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  Filler
);

export default function AiVolumePage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("14d"); // "7d", "14d", "30d", "all"
  const toast = useToast();
  const { theme } = useTheme();
  const { role } = useAuth();
  const router = useRouter();
  const canManageAi = hasPermission(role, "manage:ai-controls");

  const [aiThreshold, setAiThreshold] = useState(DEFAULT_AI_CONTROLS.threshold);
  const [surgeMode, setSurgeMode] = useState(DEFAULT_AI_CONTROLS.surgeMode);
  const [controlsLoading, setControlsLoading] = useState(true);
  const [controlsError, setControlsError] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (role && !canManageAi) {
      router.replace("/dashboard");
    }
  }, [canManageAi, role, router]);

  useEffect(() => {
    if (!canManageAi) return undefined;

    return subscribeAiControls(
      (controls) => {
        setAiThreshold(controls.threshold);
        setSurgeMode(controls.surgeMode);
        setControlsLoading(false);
        setControlsError(false);
      },
      (error) => {
        console.error("Could not load shared AI controls:", error);
        setControlsLoading(false);
        setControlsError(true);
        toast.error("Could not load shared AI controls. Check your access and connection.");
      }
    );
  }, [canManageAi, toast]);

  // Firestore real-time listener
  useEffect(() => {
    if (!canManageAi) return undefined;

    const unsubscribe = onSnapshot(collection(db, "incident_reports"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setIncidents(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [canManageAi]);

  // Save AI Configuration
  const handleSaveAiSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await saveAiControls({ threshold: aiThreshold, surgeMode });
      await logSystemAction(
        "AI_VOLUME_CONFIG_UPDATED",
        `Updated AI Module settings: Threshold=${aiThreshold}%, SurgeMode=${surgeMode ? "ACTIVE" : "STANDBY"}`
      );
      toast.success("Shared AI controls updated successfully.");
    } catch (err) {
      console.error("Could not save shared AI controls:", err);
      toast.error("Could not save AI controls. Check your access and connection.");
    } finally {
      setSavingSettings(false);
    }
  };

  // Compute stats and daily volume data
  const stats = useMemo(() => {
    const now = new Date();
    let filterDays = 14;
    if (timeframe === "7d") filterDays = 7;
    if (timeframe === "14d") filterDays = 14;
    if (timeframe === "30d") filterDays = 30;
    if (timeframe === "all") filterDays = 365;

    const cutoff = new Date();
    cutoff.setDate(now.getDate() - filterDays);

    const relevant = incidents.filter((inc) => {
      if (timeframe === "all") return true;
      if (!inc.report_date) return true;
      const d = inc.report_date.seconds ? new Date(inc.report_date.seconds * 1000) : new Date(inc.report_date);
      return d >= cutoff;
    });

    const dailyMap = {};
    const categoryMap = {
      "flooding": 0,
      "fire incident": 0,
      "road obstruction": 0,
      "medical emergency": 0,
      "other disaster-related incidents": 0,
    };

    relevant.forEach((inc) => {
      // Category count
      const cat = (inc.category || "other disaster-related incidents").trim().toLowerCase();
      if (categoryMap[cat] !== undefined) categoryMap[cat]++;
      else categoryMap["other disaster-related incidents"]++;

      // Daily count
      if (inc.report_date) {
        const d = inc.report_date.seconds ? new Date(inc.report_date.seconds * 1000) : new Date(inc.report_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        dailyMap[key] = (dailyMap[key] || 0) + 1;
      }
    });

    const dailyValues = Object.values(dailyMap);
    const peakVolume = dailyValues.length > 0 ? Math.max(...dailyValues) : 0;
    const avgDailyVolume = dailyValues.length > 0 ? (relevant.length / Math.max(Object.keys(dailyMap).length, 1)).toFixed(1) : "0.0";
    const isSurge = surgeMode || peakVolume >= 10 || parseFloat(avgDailyVolume) >= 6;

    return {
      total: relevant.length,
      peakVolume,
      avgDailyVolume,
      isSurge,
      dailyMap,
      categoryMap,
    };
  }, [incidents, timeframe, surgeMode]);

  // Chart theme colors
  const isDark = theme === "dark";
  const textColor = isDark ? "#FFFFFF" : "#0F172A";
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.08)";

  if (!canManageAi) {
    return (
      <div className="login-container" id="ai-volume-access-check">
        <div className="loader"></div>
      </div>
    );
  }

  const dailyEntries = Object.entries(stats.dailyMap).sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
  const chartLabels = dailyEntries.map(([date]) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  }));
  const chartDataValues = dailyEntries.map(([, count]) => count);

  const volumeLineData = {
    labels: chartLabels.length > 0 ? chartLabels : ["Today"],
    datasets: [
      {
        label: "AI Incident Volume",
        data: chartDataValues.length > 0 ? chartDataValues : [0],
        borderColor: "#0284C7",
        backgroundColor: isDark ? "rgba(2, 132, 199, 0.15)" : "rgba(2, 132, 199, 0.1)",
        fill: true,
        tension: 0.35,
        pointBackgroundColor: "#0284C7",
        pointBorderColor: "#FFFFFF",
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };

  const volumeLineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y} Emergency Reports`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { size: 11, weight: "600" } },
      },
      y: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: {
          color: textColor,
          font: { size: 11 },
          stepSize: 1,
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="analytics-loading" style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        <div className="loader"></div>
        <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-secondary)" }}>
          Loading AI Volume &amp; Surge Module...
        </span>
      </div>
    );
  }

  return (
    <div className="ai-volume-page" id="ai-volume-module">
      {/* Module Header */}
      <header className="header ai-volume-header" id="ai-volume-header">
        <div className="header-title-sec">
          <div className="ai-volume-title">
            <div className="ai-volume-title-icon" aria-hidden="true">
              <span>AI</span>
            </div>
            <div className="ai-volume-heading">
              <h2>Incident Volume &amp; Surge</h2>
              <span className="analytics-subtitle">
                Monitor incoming reports and current response demand
              </span>
            </div>
          </div>
        </div>

        <div className="header-stats ai-volume-header-controls">
          {/* Timeframe selector */}
          <div className="timeframe-selector ai-volume-timeframes" role="group" aria-label="Report date range">
            {["7d", "14d", "30d", "all"].map((tf) => (
              <button
                key={tf}
                type="button"
                className={`btn-timeframe ${timeframe === tf ? "active" : ""}`}
                onClick={() => setTimeframe(tf)}
                aria-pressed={timeframe === tf}
              >
                {tf === "all" ? "All time" : `Last ${tf.replace("d", " days")}`}
              </button>
            ))}
          </div>

          <div className={`ai-volume-status ${stats.isSurge ? "is-surge" : "is-normal"}`} role="status">
            <span className="stat-indicator"></span>
            <span>{stats.isSurge ? "High report volume" : "Normal report volume"}</span>
          </div>
        </div>
      </header>

      {/* Scrollable Page Content */}
      <div className="page-content ai-volume-content" id="ai-volume-content">
        {/* KPI Cards Row */}
        <div className="ai-volume-kpis">
          <div className="analytics-metric-card ai-volume-kpi">
            <span className="analytics-metric-label">Reports received</span>
            <span className="analytics-metric-value ai-volume-total">
              {stats.total}
            </span>
            <span className="analytics-card-hint">{timeframe === "all" ? "All recorded reports" : `Within the last ${timeframe.replace("d", " days")}`}</span>
          </div>

          <div className="analytics-metric-card ai-volume-kpi">
            <span className="analytics-metric-label">Average per active day</span>
            <span className="analytics-metric-value">
              {stats.avgDailyVolume}
            </span>
            <span className="analytics-card-hint">Reports on days with at least one report</span>
          </div>

          <div className="analytics-metric-card ai-volume-kpi">
            <span className="analytics-metric-label">Busiest day</span>
            <span className={`analytics-metric-value ${stats.peakVolume >= 10 ? "ai-volume-peak" : ""}`}>
              {stats.peakVolume}
            </span>
            <span className="analytics-card-hint">Most reports received in one day</span>
          </div>
        </div>

      {/* Main Grid: Volume Chart + Controls */}
      <div className="ai-volume-grid">
        {/* Incident Volume Line Chart */}
        <div className="analytics-chart-card ai-volume-card">
          <div className="ai-volume-card-header">
            <div>
              <h3>Reports over time</h3>
              <p>Number of reports received each day</p>
            </div>
            <span>{timeframe === "all" ? "All time" : `Last ${timeframe.replace("d", " days")}`}</span>
          </div>
          <div className="ai-volume-chart">
            <Line data={volumeLineData} options={volumeLineOptions} />
          </div>
        </div>

        {/* Disaster Surge Protocol & Engine Controls Form */}
        <form onSubmit={handleSaveAiSettings} className="ai-volume-settings">
          {/* Disaster High-Volume Surge Mode Card */}
          <div className="admin-section-card ai-volume-card">
            <div className="ai-volume-setting-header">
              <div>
                <h3>Surge mode</h3>
                <p>Tag new reports while elevated incident demand is active.</p>
              </div>
              <label className="switch-toggle" title="Toggle surge mode">
                <input
                  type="checkbox"
                  checked={surgeMode}
                  onChange={(e) => setSurgeMode(e.target.checked)}
                  id="ai-surge-toggle"
                  aria-label="Enable surge mode"
                />
                <span className="switch-slider"></span>
              </label>
            </div>

            <div className={`ai-volume-rule ${surgeMode ? "manual-surge" : ""}`}>
              <span className="stat-indicator"></span>
              <span>
                {surgeMode
                  ? "Surge mode is on"
                  : stats.isSurge
                    ? "High volume detected from recent reports"
                    : "Report volume is within the normal range"}
              </span>
            </div>

            <p className="ai-volume-help">
              High volume is flagged at 10 or more reports in a day, or an average of 6 or more reports per active day. Manual surge mode is saved for all residents and tags reports submitted while it is active.
            </p>
          </div>

          {/* AI NLP Confidence Sensitivity Slider */}
          <div className="admin-section-card ai-volume-card">
            <div className="ai-volume-setting-header">
              <div>
                <h3>Review confidence threshold</h3>
                <p>Flag new reports for officer review when AI confidence is below this value.</p>
              </div>
              <span className="ai-volume-threshold">{aiThreshold}%</span>
            </div>

            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={aiThreshold}
              onChange={(e) => setAiThreshold(parseInt(e.target.value, 10))}
              className="ai-volume-threshold-slider"
              aria-label="AI review confidence threshold"
            />
            <div className="ai-volume-threshold-labels">
              <span>Lower threshold</span>
              <span>Higher threshold</span>
            </div>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            disabled={savingSettings || controlsLoading || controlsError}
            className="btn btn-primary ai-volume-save"
          >
            {controlsLoading ? "Loading shared settings..." : savingSettings ? "Saving settings..." : "Save settings"}
          </button>
          {controlsError && (
            <p className="ai-volume-help" role="alert">
              Shared settings could not be loaded, so saving is disabled until the connection is restored.
            </p>
          )}
        </form>
      </div>

      {/* Category Volume Breakdown */}
      <div className="admin-section-card ai-volume-card">
        <div className="ai-volume-card-header">
          <div>
            <h3>Reports by category</h3>
            <p>Share of received reports within the selected date range</p>
          </div>
        </div>
        <div className="ai-volume-categories">
          {[
            { label: "Flooding", count: stats.categoryMap["flooding"], color: "#1565C0", icon: "🌊" },
            { label: "Fire Incident", count: stats.categoryMap["fire incident"], color: "#C62828", icon: "🔥" },
            { label: "Road Obstruction", count: stats.categoryMap["road obstruction"], color: "#E65100", icon: "🚧" },
            { label: "Medical Emergency", count: stats.categoryMap["medical emergency"], color: "#F9A825", icon: "🏥" },
            { label: "Other Disasters", count: stats.categoryMap["other disaster-related incidents"], color: "#2E7D32", icon: "⚠️" },
          ].map((cat) => (
            <div
              key={cat.label}
              className="ai-volume-category"
              style={{ "--category-color": cat.color }}
            >
              <div className="ai-volume-category-name">
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </div>
              <div className="ai-volume-category-count">
                <strong>{cat.count}</strong>
                <span>{stats.total > 0 ? Math.round((cat.count / stats.total) * 100) : 0}%</span>
              </div>
              <div className="ai-volume-category-track" aria-hidden="true">
                <span style={{ width: `${stats.total > 0 ? Math.round((cat.count / stats.total) * 100) : 0}%` }}></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
  );
}
