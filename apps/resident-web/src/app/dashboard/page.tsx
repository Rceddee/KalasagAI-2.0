"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ResidentShell } from "@/components/ResidentShell";
import { useResidentAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";
import { GUMACA_CENTER, gumacaBoundary } from "@/lib/boundary-helper";
import { PinIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/components/ThemeContext";
import type { IncidentStatus } from "@kalasag/shared-validation";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap, MarkerClusterGroup } from "leaflet";

interface ActiveIncidentRow {
  id: string;
  reference: string;
  description: string;
  location_label: string;
  latitude: number;
  longitude: number;
  status: IncidentStatus;
  created_at: string;
}

interface IncidentAssessmentRow {
  incident_id: string;
  suggested_category: string;
}

interface ResidentIncident extends ActiveIncidentRow {
  category: string;
}

type LeafletContainer = HTMLDivElement & { _leaflet_id?: number };

const CATEGORIES = ["ALL", "FLOODING", "FIRE INCIDENT", "MEDICAL EMERGENCY", "ROAD ACCIDENT", "ROAD OBSTRUCTION", "OTHER DISASTER"];

const CATEGORY_COLORS: Record<string, string> = {
  "flooding": "#1565C0",
  "fire incident": "#C62828",
  "fire": "#C62828",
  "road obstruction": "#E65100",
  "road_obstruction": "#E65100",
  "road accident": "#E65100",
  "road_accident": "#E65100",
  "medical emergency": "#F9A825",
  "medical_emergency": "#F9A825",
  "other disaster-related incidents": "#7B1FA2",
  "other": "#7B1FA2",
};

const CATEGORY_VECTOR_SVGS: Record<string, string> = {
  "flooding": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>',
  "fire incident": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  "fire": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  "road obstruction": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  "road_obstruction": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  "medical emergency": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  "medical_emergency": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  "other disaster-related incidents": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  "other": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

function timeAgo(dateValue: string) {
  if (!dateValue) return "";
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

export default function ResidentDashboard() {
  const toast = useToast();
  const { theme } = useTheme();
  const { user, loading: authLoading, error: authError } = useResidentAuth();

  const [incidents, setIncidents] = useState<ResidentIncident[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedIncident, setSelectedIncident] = useState<ResidentIncident | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const clusterGroupRef = useRef<MarkerClusterGroup | null>(null);
  const boundaryLayerRef = useRef<LeafletGeoJSON | null>(null);
  const [leafletLib, setLeafletLib] = useState<typeof import("leaflet") | null>(null);

  const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const fetchActiveIncidents = useCallback(async () => {
    if (!user || authError) {
      setIncidents([]);
      return;
    }

    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("incidents")
        .select("id, reference, description, location_label, latitude, longitude, status, created_at")
        .neq("status", "resolved")
        .neq("status", "closed")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Also get assessments if any
      const incidentRows = (data || []) as ActiveIncidentRow[];
      const incidentIds = incidentRows.map((i) => i.id);
      const catMap: Record<string, string> = {};
      if (incidentIds.length > 0) {
        const { data: assessments, error: assessmentError } = await supabase.rpc(
          "my_ai_assessments",
          { p_incident_ids: incidentIds },
        );
        if (assessmentError) throw assessmentError;
        (assessments as IncidentAssessmentRow[] | null)?.forEach((a) => {
          catMap[a.incident_id] = a.suggested_category;
        });
      }

      const formatted = incidentRows.map((i) => ({
        ...i,
        category: catMap[i.id] || "other",
      }));

      setIncidents(formatted);
    } catch (err) {
      console.error("Failed to load active incidents:", err);
      toast.error("Could not load active incidents map.");
    }
  }, [authError, toast, user]);

  useEffect(() => {
    if (authLoading || authError || !user) {
      return;
    }

    queueMicrotask(() => {
      void fetchActiveIncidents();
    });

    const channel = getSupabase()
      .channel(`resident-incidents-map-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "incidents",
        filter: `resident_id=eq.${user.id}`,
      }, () => void fetchActiveIncidents())
      .subscribe();

    return () => {
      void getSupabase().removeChannel(channel);
    };
  }, [authError, authLoading, fetchActiveIncidents, user]);

  // Initialize Map
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;

    const initMap = async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
      await import("leaflet.markercluster");

      if ((mapRef.current as LeafletContainer | null)?._leaflet_id) return;

      const map = L.map(mapRef.current!, {
        center: GUMACA_CENTER,
        zoom: 14,
        zoomControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Boundary outline
      const isDark = document.documentElement.getAttribute("data-theme") !== "light";
      try {
        const boundaryLayer = L.geoJSON(gumacaBoundary as Parameters<typeof L.geoJSON>[0], {
          style: {
            color: isDark ? "#00e5ff" : "#0284C7",
            weight: 2,
            opacity: isDark ? 0.5 : 0.7,
            fillColor: isDark ? "#00e5ff" : "#0284C7",
            fillOpacity: isDark ? 0.03 : 0.06,
            dashArray: "6 4",
          },
        }).addTo(map);
        boundaryLayerRef.current = boundaryLayer;
      } catch (err) {
        console.warn("Boundary load:", err);
      }

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTR,
        subdomains: ["a", "b", "c"],
        maxZoom: 19,
        className: isDark ? "dark-map-tiles" : "",
      }).addTo(map);

      if (isDark) {
        const pane = map.getPane("tilePane");
        pane?.classList.add("dark-map-tiles");
      }

      const clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        spiderfyDistanceMultiplier: 1.8,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          const isLarge = count >= 10;
          const size = isLarge ? 48 : 42;

          return L.divIcon({
            className: `resident-marker-cluster${isLarge ? " is-large" : ""}`,
            html: `<span>${count}</span>`,
            iconSize: [size, size],
          });
        },
      });

      map.addLayer(clusterGroup);
      clusterGroupRef.current = clusterGroup;
      mapInstanceRef.current = map;
      setLeafletLib(L);

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    };

    void initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        clusterGroupRef.current = null;
        boundaryLayerRef.current = null;
      }
    };
  }, []);

  // Switch tiles when theme changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const isDark = theme === "dark";
    const pane = mapInstanceRef.current.getPane("tilePane");
    if (pane) {
      if (isDark) {
        pane.classList.add("dark-map-tiles");
      } else {
        pane.classList.remove("dark-map-tiles");
      }
    }

    if (boundaryLayerRef.current) {
      boundaryLayerRef.current.setStyle({
        color: isDark ? "#00e5ff" : "#0284C7",
        opacity: isDark ? 0.5 : 0.7,
        fillColor: isDark ? "#00e5ff" : "#0284C7",
        fillOpacity: isDark ? 0.03 : 0.06,
      });
    }
  }, [theme]);

  // Filter incidents by category
  const filteredIncidents = useMemo(() => {
    if (selectedCategory === "ALL") return incidents;
    const category = selectedCategory.toLowerCase().replace(" incident", "").replace(" disaster", "").replaceAll(" ", "_");
    return incidents.filter(i => i.category === category);
  }, [incidents, selectedCategory]);

  // Update map markers
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletLib || !clusterGroupRef.current) return;

    const L = leafletLib;
    const cluster = clusterGroupRef.current;
    cluster.clearLayers();

    filteredIncidents.forEach((inc) => {
      const lat = Number(inc.latitude);
      const lng = Number(inc.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const cat = (inc.category || "other").toLowerCase();
      const color = CATEGORY_COLORS[cat] || "#7B1FA2";
      const iconSvg = CATEGORY_VECTOR_SVGS[cat] || CATEGORY_VECTOR_SVGS["other"];

      const divIcon = L.divIcon({
        className: "",
        html: `
          <div class="map-marker-wrapper marker-pulse">
            <div class="pulse-ring" style="border-color: ${color};"></div>
            <div class="custom-pin" style="background:${color};">
              <span style="display:flex; align-items:center; justify-content:center;">${iconSvg}</span>
            </div>
          </div>
        `,
        iconSize: [36, 42],
        iconAnchor: [18, 42],
      });

      const marker = L.marker([lat, lng], { icon: divIcon });
      marker.on("click", () => {
        setSelectedIncident(inc);
      });

      cluster.addLayer(marker);
    });
  }, [filteredIncidents, leafletLib]);

  const recenterMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(GUMACA_CENTER, 14, { duration: 0.8 });
    }
  };

  return (
    <ResidentShell>
      {/* Top Map HUD Bar */}
      <div style={{ padding: "12px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--color-blue)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Public Safety Map
          </span>
          <h1 style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-primary)", margin: "2px 0 0" }}>
            Active Hazards in Gumaca
          </h1>
        </div>

        <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-info)", background: "rgba(30, 136, 229, 0.15)", padding: "4px 10px", borderRadius: "999px", border: "1px solid rgba(30, 136, 229, 0.3)" }}>
          {filteredIncidents.length} Active
        </span>
      </div>

      <label className="resident-map-filter">
        <span>Incident type</span>
        <select
          value={selectedCategory}
          onChange={(event) => {
            setSelectedCategory(event.target.value);
            setSelectedIncident(null);
          }}
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category === "ALL"
                ? "All categories"
                : category.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}
            </option>
          ))}
        </select>
      </label>

      {/* Map Container */}
      <div className="resident-map-canvas" style={{ position: "relative", width: "100%", height: "calc(100vh - 225px)", minHeight: "380px" }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

        {/* Recenter Button */}
        <button
          onClick={recenterMap}
          type="button"
          style={{
            position: "absolute",
            top: "14px",
            right: "14px",
            zIndex: 800,
            background: "var(--bg-secondary)",
            border: "1px solid var(--glass-border)",
            borderRadius: "10px",
            padding: "8px 12px",
            color: "var(--text-primary)",
            fontSize: "12px",
            fontWeight: "700",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "var(--shadow-md)",
            cursor: "pointer",
          }}
        >
          <PinIcon size={14} color="var(--color-blue)" />
          <span>Recenter</span>
        </button>

      </div>

      <section className="resident-map-incidents" aria-labelledby="resident-map-incidents-heading">
        <div className="resident-map-incidents-heading">
          <h2 id="resident-map-incidents-heading">Active incidents</h2>
          <span>{filteredIncidents.length} shown</span>
        </div>

        {filteredIncidents.length === 0 ? (
          <p className="resident-map-empty">No active incidents match this category.</p>
        ) : (
          <div className="resident-map-incident-list">
            {filteredIncidents.map((incident) => (
              <button
                key={incident.id}
                type="button"
                className={`resident-map-incident-card ${selectedIncident?.id === incident.id ? "selected" : ""}`}
                aria-pressed={selectedIncident?.id === incident.id}
                onClick={() => {
                  setSelectedIncident(incident);
                  const map = mapInstanceRef.current;
                  if (map) {
                    map.flyTo(
                      [incident.latitude, incident.longitude],
                      Math.max(map.getZoom(), 15),
                      { duration: 0.6 },
                    );
                  }
                }}
              >
                <span className="resident-map-incident-heading">
                  <span className="status-tag-responding">
                    {(incident.status || "PENDING").replace("_", " ").toUpperCase()}
                  </span>
                  <strong>{incident.reference}</strong>
                </span>
                <span className="resident-map-incident-category">{incident.category}</span>
                <span className="resident-map-incident-description">{incident.description}</span>
                <span className="resident-map-incident-meta">
                  <span>{incident.location_label || "Gumaca, Quezon"}</span>
                  <time dateTime={incident.created_at}>{timeAgo(incident.created_at)}</time>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </ResidentShell>
  );
}
