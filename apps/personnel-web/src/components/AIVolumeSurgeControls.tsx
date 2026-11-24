"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { getSupabase } from "@/lib/supabase";
import { fetchStaffIncidents } from "@/lib/incidents";
import { AlertIcon, ShieldIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/components/ThemeContext";
import type { IncidentRecord } from "@/lib/types";

interface SystemSettingRecord {
  key: string;
  value: unknown;
}

type SystemSettingKey = "surge_threshold" | "surge_mode" | "gemini_enabled";
type SystemSettingValue = string | number | boolean;

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function AIVolumeSurgeControls() {
  const toast = useToast();
  const { theme } = useTheme();

  const [surgeThreshold, setSurgeThreshold] = useState<number>(75);
  const [surgeMode, setSurgeMode] = useState<boolean>(false);
  const [geminiEnabled, setGeminiEnabled] = useState<boolean>(false);
  const [settingsState, setSettingsState] = useState<"loading" | "ready" | "error">("loading");
  const [volumeState, setVolumeState] = useState<"loading" | "ready" | "error">("loading");
  const [volumeAsOf, setVolumeAsOf] = useState(0);
  const [saving, setSaving] = useState(false);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const thresholdSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thresholdDirty = useRef(false);

  // Load system settings from Supabase
  const loadSettings = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value");

      if (error) throw error;

      if (!["surge_threshold", "surge_mode", "gemini_enabled"].every(key => data?.some(row => row.key === key))) {
        throw new Error("Settings are unavailable for this account.");
      }
      setSettingsState("ready");
      (data as SystemSettingRecord[] | null)?.forEach((row) => {
        if (row.key === "surge_threshold") {
          setSurgeThreshold(Number(row.value) || 75);
        } else if (row.key === "surge_mode") {
          setSurgeMode(row.value === true || row.value === "true");
        } else if (row.key === "gemini_enabled") {
          setGeminiEnabled(row.value === true || row.value === "true");
        }
      });
    } catch (err) {
      setSettingsState("error");
      console.error("Failed to load settings:", err);
      toast.error("Could not load AI controls.");
    }
  }, [toast]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadSettings(); });
    void fetchStaffIncidents()
      .then((records) => {
        if (active) {
          setVolumeAsOf(Date.now());
          setIncidents(records);
          setVolumeState("ready");
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setVolumeState("error");
        console.error("Failed to load surge incident data:", err);
        toast.error("Could not load incident trend data.");
      });
    return () => {
      active = false;
    };
  }, [loadSettings, toast]);

  useEffect(() => () => {
    if (thresholdSaveTimer.current !== null) clearTimeout(thresholdSaveTimer.current);
  }, []);

  const handleSaveSetting = async (key: SystemSettingKey, value: SystemSettingValue) => {
    setSaving(true);
    try {
      const { error } = await getSupabase().rpc("set_system_setting", {
        p_key: key,
        p_value: value,
      });

      if (error) throw error;
      if (key === "gemini_enabled" && typeof value === "boolean") {
        setGeminiEnabled(value);
        toast.success(`Automatic AI classification ${value ? "enabled" : "disabled"}.`);
      } else {
        toast.success("Settings updated successfully.");
      }
      void loadSettings();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update setting.");
    } finally {
      setSaving(false);
    }
  };

  const scheduleThresholdSave = (value: number) => {
    thresholdDirty.current = true;
    if (thresholdSaveTimer.current !== null) clearTimeout(thresholdSaveTimer.current);
    thresholdSaveTimer.current = setTimeout(() => {
      thresholdSaveTimer.current = null;
      thresholdDirty.current = false;
      void handleSaveSetting("surge_threshold", value);
    }, 500);
  };

  const commitThresholdSave = (value: number) => {
    if (!thresholdDirty.current) return;
    if (thresholdSaveTimer.current !== null) clearTimeout(thresholdSaveTimer.current);
    thresholdSaveTimer.current = null;
    thresholdDirty.current = false;
    void handleSaveSetting("surge_threshold", value);
  };

  // 14-day volume chart
  const lineData = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    });
    const days = new Map<string, number>();
    const now = volumeAsOf;
    for (let i = 13; i >= 0; i--) {
      days.set(formatter.format(now - i * 86_400_000), 0);
    }
    for (const incident of incidents) {
      const day = formatter.format(new Date(incident.created_at));
      const count = days.get(day);
      if (count !== undefined) days.set(day, count + 1);
    }
    return {
      labels: [...days.keys()],
      datasets: [
        {
          label: "Reports",
          data: [...days.values()],
          borderColor: surgeMode ? "#E53935" : "#0284C7",
          backgroundColor: surgeMode ? "rgba(229, 57, 53, 0.15)" : "rgba(2, 132, 199, 0.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: surgeMode ? "#E53935" : "#0284C7",
        },
      ],
    };
  }, [incidents, surgeMode, volumeAsOf]);

  if (settingsState !== "ready") return <p role="status">{settingsState === "loading" ? "Loading AI and report activity settings…" : "These settings are unavailable. Refresh the page to try again."}</p>;

  return (
    <div style={{ display: "contents" }}>
      <header className="header" id="surge-header">
        <div className="header-title-sec">
          <h2>AI and report activity</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div className="header-stats">
            <div className="stat-chip">
              <span>Surge monitoring: {surgeMode ? "On" : "Off"}</span>
            </div>
          </div>
        </div>
      </header>

      <div id="surge-content" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Surge Alert Banner if Active */}
      {surgeMode && (
        <div
          style={{
            background: "rgba(198, 40, 40, 0.15)",
            border: "1px solid var(--color-red)",
            borderRadius: "10px",
            padding: "16px 20px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <AlertIcon size={28} color="var(--color-red)" />
          <div>
            <strong style={{ color: "var(--color-red)", fontSize: "15px", display: "block" }}>
              SURGE MONITORING IS ON
            </strong>
            <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
              Surge mode is an administrative status indicator. It does not automatically flag reports for review or dispatch response agencies.
            </span>
          </div>
        </div>
      )}

      {/* Control Panels Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
        {/* Surge Mode Toggle */}
        <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--glass-border)", borderRadius: "12px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 style={{ fontSize: "18px", color: "var(--text-primary)" }}>Surge monitoring</h2>
            <button
              className={`btn btn-sm ${surgeMode ? "btn-danger" : "btn-secondary"}`}
              onClick={() => handleSaveSetting("surge_mode", !surgeMode)}
              disabled={saving}
              type="button"
            >
              {surgeMode ? "Turn off surge monitoring" : "Turn on surge monitoring"}
            </button>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "15px", lineHeight: "1.6" }}>
            Use this setting to record that municipal surge conditions are being monitored. It does not initiate a response protocol or dispatch responders.
          </p>
        </div>

        {/* AI Confidence Threshold Slider */}
        <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--glass-border)", borderRadius: "12px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h2 style={{ fontSize: "18px", color: "var(--text-primary)" }}>Reference report volume</h2>
            <strong style={{ color: "var(--color-blue)", fontSize: "18px" }}>{surgeThreshold} reports</strong>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "14px" }}>
            This value is stored for reference. It does not automatically flag reports or change personnel review requirements.
          </p>
          <input
            type="range"
            min="1"
            max="1000"
            step="1"
            value={surgeThreshold}
            aria-label="Surge reference threshold in reports"
            disabled={saving}
            onChange={(e) => {
              const value = Number(e.target.value);
              setSurgeThreshold(value);
              scheduleThresholdSave(value);
            }}
            onPointerUp={(e) => commitThresholdSave(Number(e.currentTarget.value))}
            onBlur={(e) => commitThresholdSave(Number(e.currentTarget.value))}
            style={{ width: "100%", accentColor: "var(--color-blue)", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "var(--text-muted)", marginTop: "4px" }}>
            <span>1 report</span>
            <span>1,000 reports</span>
          </div>
        </div>
      </div>

      <section
        aria-labelledby="gemini-classification-heading"
        className={`gemini-classification-card ${geminiEnabled ? "is-enabled" : "is-disabled"}`}
      >
        <div className="gemini-classification-copy">
          <div className="gemini-classification-title">
            <ShieldIcon size={18} color="var(--color-blue)" />
            <h2 id="gemini-classification-heading">Automatic AI classification</h2>
          </div>
          <p>
            This setting controls whether new reports are sent to Gemini for a suggested category and priority.
            Personnel still review every suggestion. AI does not change incident status or dispatch responders.
          </p>
          <p className="gemini-classification-privacy">
            When enabled, report descriptions and attached photos are sent to Gemini; usage charges may apply.
          </p>
        </div>
        <div className="gemini-classification-actions">
          <div
            aria-live="polite"
            className={`gemini-classification-status ${geminiEnabled ? "is-enabled" : "is-disabled"}`}
            role="status"
          >
            <span aria-hidden="true" className="gemini-classification-status-dot" />
            <div>
              <strong>
                {geminiEnabled
                  ? "ON — Automatic suggestions enabled"
                  : "OFF — New reports will not get a Gemini suggestion"}
              </strong>
              <span>
                {geminiEnabled
                  ? "New reports are submitted for AI classification."
                  : "Reports still submit normally and can be reviewed by personnel."}
              </span>
            </div>
          </div>
          <button
            aria-busy={saving}
            className="gemini-classification-toggle"
            disabled={saving}
            onClick={() => void handleSaveSetting("gemini_enabled", !geminiEnabled)}
            type="button"
          >
            {saving
              ? "Saving setting…"
              : geminiEnabled
                ? "Turn off automatic AI classification"
                : "Enable automatic AI classification"}
          </button>
        </div>
      </section>

      {/* 14-Day Volume Chart */}
      <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--glass-border)", borderRadius: "12px", padding: "20px" }}>
        <h2 style={{ fontSize: "18px", marginBottom: "16px", color: "var(--text-primary)" }}>
          Reports over the last 14 days
        </h2>
        <div style={{ height: "260px" }}>
          {volumeState === "ready" ? <Line
            data={lineData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: { ticks: { color: theme === "dark" ? "#A3B4CC" : "#334155", font: { size: 14 } } },
                y: { ticks: { color: theme === "dark" ? "#A3B4CC" : "#334155", font: { size: 14 }, stepSize: 1 } },
              },
              plugins: {
                legend: { display: false },
              },
            }}
          /> : <p role="status">{volumeState === "loading" ? "Loading report totals…" : "Report totals are unavailable. Refresh the page to try again."}</p>}
        </div>
      </div>
      </div>
    </div>
  );
}
