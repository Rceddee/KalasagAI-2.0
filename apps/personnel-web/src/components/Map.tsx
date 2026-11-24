"use client";

import React, { useEffect, useRef, useState } from "react";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap, MarkerClusterGroup, TileLayer } from "leaflet";
import { validateIncidentLocation } from "@kalasag/shared-validation";
import { useTheme } from "@/components/ThemeContext";
import { GUMACA_CENTER, gumacaBoundary } from "@/lib/boundary-helper";
import type { IncidentMapRecord } from "@/lib/types";

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
  "road accident": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  "road_accident": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  "medical emergency": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  "medical_emergency": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  "other disaster-related incidents": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  "other": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

const CATEGORY_LABELS: Record<string, string> = {
  "flooding": "Flooding",
  "fire incident": "Fire",
  "fire": "Fire",
  "road obstruction": "Road Obstruction",
  "road_obstruction": "Road Obstruction",
  "road accident": "Road Accident",
  "road_accident": "Road Accident",
  "medical emergency": "Medical Emergency",
  "medical_emergency": "Medical Emergency",
  "other disaster-related incidents": "Other Incidents",
  "other": "Other Incidents",
};

function timeAgo(dateValue: string | undefined) {
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

interface IncidentMapProps {
  incidents?: IncidentMapRecord[];
  selectedId?: string | null;
  onSelectIncident?: (id: string) => void;
}

export default function IncidentMap({ incidents = [], selectedId, onSelectIncident }: IncidentMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const clusterGroupRef = useRef<MarkerClusterGroup | null>(null);
  const onSelectIncidentRef = useRef(onSelectIncident);
  const tileLayerRef = useRef<TileLayer | null>(null);
  const [leafletLib, setLeafletLib] = useState<typeof import("leaflet") | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const boundaryLayerRef = useRef<LeafletGeoJSON | null>(null);
  const { theme } = useTheme();

  const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  useEffect(() => {
    onSelectIncidentRef.current = onSelectIncident;
  }, [onSelectIncident]);

  useEffect(() => {
    if (mapInstanceRef.current) return;
    const container = mapRef.current;
    if (!container) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame: number | null = null;
    let createdMap: LeafletMap | null = null;

    const initMap = async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
      await import("leaflet.markercluster");

      if (disposed || !container.isConnected) return;
      if ((container as HTMLDivElement & { _leaflet_id?: number })._leaflet_id) return;

      const map = L.map(container, {
        center: GUMACA_CENTER,
        zoom: 14,
        zoomControl: false,
      });
      createdMap = map;
      mapInstanceRef.current = map;

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Add boundary polygon
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

      const tileLayer = L.tileLayer(TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        subdomains: ["a", "b", "c"],
        maxZoom: 19,
      }).addTo(map);

      tileLayerRef.current = tileLayer;

      // Apply dark class to tile-pane directly if dark
      if (isDark) {
        const pane = map.getPane("tilePane");
        pane?.classList.add("dark-map-tiles");
      }

      const clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          let sizeClass = "cluster-sm";
          if (count >= 10) sizeClass = "cluster-lg";
          else if (count >= 5) sizeClass = "cluster-md";

          return L.divIcon({
            html: `<div class="cluster-icon ${sizeClass}"><span>${count}</span></div>`,
            className: "",
            iconSize: L.point(40, 40),
          });
        },
      });

      map.addLayer(clusterGroup);
      clusterGroupRef.current = clusterGroup;
      setLeafletLib(L);

      const invalidateMapSize = () => {
        if (disposed || !container.isConnected || resizeFrame !== null) return;
        resizeFrame = window.requestAnimationFrame(() => {
          resizeFrame = null;
          if (disposed || !container.isConnected) return;
          map.invalidateSize({ pan: false, debounceMoveend: true });
        });
      };

      map.whenReady(() => {
        if (disposed) return;
        invalidateMapSize();
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(invalidateMapSize);
          resizeObserver.observe(container);
        }
      });
    };

    void initMap();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      if (createdMap) {
        createdMap.remove();
        if (mapInstanceRef.current === createdMap) {
          mapInstanceRef.current = null;
        }
        clusterGroupRef.current = null;
        tileLayerRef.current = null;
        boundaryLayerRef.current = null;
      }
    };
  }, []);

  // Instant theme update without reloading tiles
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

  useEffect(() => {
    if (!mapInstanceRef.current || !leafletLib || !clusterGroupRef.current) return;

    const L = leafletLib;
    const clusterGroup = clusterGroupRef.current;
    clusterGroup.clearLayers();

    const activeIncidents = incidents.filter(
      (inc) => inc.status !== "resolved" && inc.status !== "closed"
    );

    activeIncidents.forEach((incident) => {
      const lat = Number(incident.latitude);
      const lng = Number(incident.longitude);
      if (!validateIncidentLocation(lat, lng)) return;

      const rawCat = (incident.confirmed_category || incident.suggested_category || incident.category || "other").toLowerCase();
      const color = CATEGORY_COLORS[rawCat] || "#7B1FA2";
      const iconSvg = CATEGORY_VECTOR_SVGS[rawCat] || CATEGORY_VECTOR_SVGS["other"];
      const isSelected = incident.id === selectedId;
      const isPending = (incident.status || "").toLowerCase() === "pending";

      const divIcon = L.divIcon({
        className: "",
        html: `
          <div class="map-marker-wrapper ${isPending ? "marker-pulse" : ""}">
            ${isPending ? `<div class="pulse-ring" style="border-color: ${color};"></div>` : ""}
            <div class="custom-pin marker-drop" style="background:${color}; ${isSelected ? "transform: rotate(-45deg) scale(1.3); box-shadow: 0 0 16px " + color + ";" : ""}">
              <span style="display:flex; align-items:center; justify-content:center;">${iconSvg}</span>
            </div>
          </div>
        `,
        iconSize: [40, 48],
        iconAnchor: [20, 48],
        popupAnchor: [0, -48],
      });

      const marker = L.marker([lat, lng], { icon: divIcon });

      const normStatus = incident.status === "in_progress" ? "In Progress" : incident.status?.charAt(0).toUpperCase() + incident.status?.slice(1) || "Pending";
      const statusColor = normStatus === "Pending" ? "#F9A825" : "#1E88E5";
      const priorityColor = incident.priority_level === "high" ? "#C62828" : incident.priority_level === "low" ? "#2E7D32" : incident.priority_level === "medium" ? "#E65100" : "#64748B";
      const desc = incident.incident_description || incident.description || "No description provided";
      const displayDesc = desc.length > 120 ? desc.substring(0, 120) + "..." : desc;
      const refId = incident.reference || incident.report_id || incident.id?.substring(0, 8);

      marker.bindPopup(`
        <div class="map-popup">
          <div class="map-popup-header" style="border-left: 3px solid ${color};">
            <strong>${(CATEGORY_LABELS[rawCat] || rawCat).toUpperCase()}</strong>
            <span class="map-popup-badge" style="background: ${statusColor}20; color: ${statusColor}; border: 1px solid ${statusColor};">${normStatus}</span>
          </div>
          <div style="margin: 4px 0 6px 0;">
            <span class="map-popup-limit-badge" style="background: rgba(2, 132, 199, 0.12); color: var(--color-blue); border: 1px solid rgba(2, 132, 199, 0.3);">📍 ${refId} [${lat.toFixed(4)}, ${lng.toFixed(4)}]</span>
          </div>
          <p class="map-popup-desc">${displayDesc}</p>
          <div class="map-popup-meta">
            <span style="color: ${priorityColor}; font-weight: 600;">${incident.priority_level?.toUpperCase() || "PENDING"} Priority</span>
            <span>${timeAgo(incident.report_date || incident.created_at)}</span>
          </div>
          <div class="map-popup-meta">
            <span>Reporter: ${incident.reporter_name || incident.location_label || "Citizen"}</span>
          </div>
          <button class="map-popup-btn" onclick="document.dispatchEvent(new CustomEvent('map-view-details', {detail:'${incident.id}'}))">View Full Details</button>
        </div>
      `, { maxWidth: 300, className: "dark-popup" });

      marker.on("click", () => {
        onSelectIncidentRef.current?.(incident.id);
      });

      clusterGroup.addLayer(marker);
    });
  }, [incidents, selectedId, leafletLib]);

  useEffect(() => {
    if (!mapInstanceRef.current || !selectedId) return;
    const selected = incidents.find((i) => i.id === selectedId);
    if (!selected) return;
    const latitude = Number(selected.latitude);
    const longitude = Number(selected.longitude);
    if (validateIncidentLocation(latitude, longitude)) {
      mapInstanceRef.current.flyTo([latitude, longitude], 16, {
        duration: 0.8,
      });
    }
  }, [selectedId, incidents]);

  useEffect(() => {
    const handler = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        onSelectIncidentRef.current?.(event.detail);
      }
    };
    document.addEventListener("map-view-details", handler);
    return () => document.removeEventListener("map-view-details", handler);
  }, []);

  const resetView = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(GUMACA_CENTER, 14, { duration: 0.8 });
    }
  };

  const activeCount = incidents.filter(
    (inc) => {
      const s = (inc.status || "").toLowerCase();
      return s !== "resolved" && s !== "closed" && Number.isFinite(Number(inc.latitude)) && Number.isFinite(Number(inc.longitude));
    }
  ).length;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "450px" }}>
      <div ref={mapRef} id="incident-map" style={{ width: "100%", height: "100%", minHeight: "450px" }} />

      <div className="map-controls">
        <button
          aria-label="Recenter map to Gumaca Poblacion"
          className="map-control-btn map-control-icon"
          onClick={resetView}
          title="Recenter Map to Gumaca Poblacion"
          id="btn-recenter-map"
          type="button"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>

      <div className="map-hud-container">
        <div className="map-active-count">
          <span className="map-active-dot"></span>
          <span>{activeCount} open reports</span>
        </div>
      </div>

      <div className={`map-legend${legendOpen ? "" : " collapsed"}`}>
        <button
          aria-expanded={legendOpen}
          className="map-legend-title"
          onClick={() => setLegendOpen((open) => !open)}
          type="button"
        >
          <span>Map key</span>
          <svg
            aria-hidden="true"
            className={legendOpen ? "" : "collapsed"}
            fill="none"
            height="14"
            viewBox="0 0 24 24"
            width="14"
          >
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
        {legendOpen && (
          <>
            {Object.entries({
              "flooding": "#1565C0",
              "fire incident": "#C62828",
              "road obstruction": "#E65100",
              "medical emergency": "#F9A825",
              "other disaster-related incidents": "#7B1FA2",
            }).map(([key, color]) => (
              <div key={key} className="map-legend-item">
                <span
                  className="map-legend-color"
                  style={{
                    background: color,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "4px",
                    width: "18px",
                    height: "18px",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: CATEGORY_VECTOR_SVGS[key]
                      ? CATEGORY_VECTOR_SVGS[key].replace('width="16" height="16"', 'width="12" height="12"')
                      : "",
                  }}
                />
                <span>{CATEGORY_LABELS[key] || key}</span>
              </div>
            ))}
            <div className="map-legend-divider"></div>
            <div className="map-legend-item">
              <span className="map-legend-pulse"></span>
              <span>Pending (needs action)</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
