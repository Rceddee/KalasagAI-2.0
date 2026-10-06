"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeContext";
import {
  GUMACA_CENTER,
} from "@/lib/boundary-helper";

// Category-to-color mapping
const CATEGORY_COLORS = {
  "flooding": "#1565C0",
  "fire incident": "#C62828",
  "road obstruction": "#E65100",
  "medical emergency": "#F9A825",
  "other disaster-related incidents": "#7B1FA2",
};

const CATEGORY_VECTOR_SVGS = {
  "flooding": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>',
  "fire incident": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  "road obstruction": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  "medical emergency": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  "other disaster-related incidents": '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

const CATEGORY_LABELS = {
  "flooding": "Flooding",
  "fire incident": "Fire",
  "road obstruction": "Road Obstruction",
  "medical emergency": "Medical Emergency",
  "other disaster-related incidents": "Other Incidents",
};

function timeAgo(dateValue) {
  if (!dateValue) return "";
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

export default function IncidentMap({ incidents = [], selectedId, onSelectIncident }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const clusterGroupRef = useRef(null);
  const onSelectIncidentRef = useRef(onSelectIncident);
  const heatLayerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [leafletLib, setLeafletLib] = useState(null);
  const { theme } = useTheme();

  useEffect(() => {
    onSelectIncidentRef.current = onSelectIncident;
  }, [onSelectIncident]);

  // Initialize the map
  useEffect(() => {
    if (mapInstanceRef.current) return;
    if (!mapRef.current) return;

    const initMap = async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
      await import("leaflet.markercluster");

      // Guard against double-initialization
      if (mapRef.current._leaflet_id) return;

      // Center on Poblacion, Gumaca, Quezon (unrestricted pan enabled)
      const map = L.map(mapRef.current, {
        center: GUMACA_CENTER,
        zoom: 14,
        zoomControl: false,
      });

      // Zoom control bottom-right
      L.control.zoom({ position: "bottomright" }).addTo(map);

      const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

      const tileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: ["a", "b", "c"],
        maxZoom: 19,
        className: theme === "dark" ? "dark-map-tiles" : "",
      }).addTo(map);

      tileLayerRef.current = tileLayer;

      // Create marker cluster group
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
      mapInstanceRef.current = map;
      setLeafletLib(L);
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        clusterGroupRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, [theme]);

  // Update map tile layer styling when theme changes
  useEffect(() => {
    if (!tileLayerRef.current) return;
    const tileContainer = mapInstanceRef.current?.getContainer();
    if (tileContainer) {
      const tilePane = tileContainer.querySelector(".leaflet-tile-pane");
      if (tilePane) {
        if (theme === "dark") {
          tilePane.classList.add("dark-map-tiles");
        } else {
          tilePane.classList.remove("dark-map-tiles");
        }
      }
    }
  }, [theme]);

  // Update markers when incidents change — only show active (non-resolved/closed)
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletLib || !clusterGroupRef.current) return;

    const L = leafletLib;
    const clusterGroup = clusterGroupRef.current;

    // Clear existing markers
    clusterGroup.clearLayers();

    // Filter: only show Pending and In Progress on map
    const activeIncidents = incidents.filter(
      (inc) => inc.status !== "Resolved" && inc.status !== "Closed"
    );

    activeIncidents.forEach((incident) => {
      if (!incident.latitude || !incident.longitude) return;

      const cat = incident.category || "other disaster-related incidents";
      const color = CATEGORY_COLORS[cat] || "#7B1FA2";
      const iconSvg = CATEGORY_VECTOR_SVGS[cat] || CATEGORY_VECTOR_SVGS["other disaster-related incidents"];
      const isSelected = incident.id === selectedId;
      const isPending = incident.status === "Pending";

      // Create custom div icon with optional pulse for pending
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

      const marker = L.marker([incident.latitude, incident.longitude], {
        icon: divIcon,
      });

      // Enhanced popup with Jurisdiction Limit badge
      const statusColor = incident.status === "Pending" ? "#F9A825" : "#E65100";
      const priorityColor = incident.priority_level === "High" ? "#C62828" : incident.priority_level === "Low" ? "#2E7D32" : "#E65100";

      const locationBadgeHtml = `<span class="map-popup-limit-badge" style="background: rgba(2, 132, 199, 0.12); color: var(--color-blue); border: 1px solid rgba(2, 132, 199, 0.3);">📍 GPS: [${Number(incident.latitude).toFixed(4)}, ${Number(incident.longitude).toFixed(4)}]</span>`;

      marker.bindPopup(`
        <div class="map-popup">
          <div class="map-popup-header" style="border-left: 3px solid ${color};">
            <strong>${(CATEGORY_LABELS[cat] || cat).toUpperCase()}</strong>
            <span class="map-popup-badge" style="background: ${statusColor}20; color: ${statusColor}; border: 1px solid ${statusColor};">${incident.status || "Pending"}</span>
          </div>
          <div style="margin: 4px 0 6px 0;">
            ${locationBadgeHtml}
          </div>
          <p class="map-popup-desc">${incident.incident_description ? incident.incident_description.substring(0, 120) + (incident.incident_description.length > 120 ? "..." : "") : "No description"}</p>
          <div class="map-popup-meta">
            <span style="color: ${priorityColor}; font-weight: 600;">${incident.priority_level || "Medium"} Priority</span>
            <span>${timeAgo(incident.report_date)}</span>
          </div>
          <div class="map-popup-meta">
            <span>Reporter: ${incident.reporter_name || "Anonymous"}</span>
          </div>
          <button class="map-popup-btn" onclick="document.dispatchEvent(new CustomEvent('map-view-details', {detail:'${incident.id}'}))">View Full Details</button>
        </div>
      `, { maxWidth: 300, className: "dark-popup" });

      marker.on("click", () => {
        onSelectIncidentRef.current?.(incident.id);
      });

      clusterGroup.addLayer(marker);
    });

    // Update heatmap data
    if (heatLayerRef.current) {
      mapInstanceRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (showHeatmap && activeIncidents.length > 0) {
      import("leaflet.heat").then(() => {
        const heatData = activeIncidents
          .filter((inc) => inc.latitude && inc.longitude)
          .map((inc) => [inc.latitude, inc.longitude, 0.8]);

        if (heatData.length > 0) {
          heatLayerRef.current = L.heatLayer(heatData, {
            radius: 30,
            blur: 20,
            maxZoom: 17,
            gradient: {
              0.2: "#1565C0",
              0.4: "#E65100",
              0.6: "#F9A825",
              0.8: "#C62828",
              1.0: "#FF1744",
            },
          }).addTo(mapInstanceRef.current);
        }
      });
    }
  }, [incidents, selectedId, leafletLib, showHeatmap]);

  // Pan to selected incident
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedId) return;

    const selected = incidents.find((i) => i.id === selectedId);
    if (selected && selected.latitude && selected.longitude) {
      mapInstanceRef.current.flyTo([selected.latitude, selected.longitude], 16, {
        duration: 0.8,
      });
    }
  }, [selectedId, incidents]);

  // Listen for popup "View Full Details" click
  useEffect(() => {
    const handler = (e) => {
      onSelectIncidentRef.current?.(e.detail);
    };
    document.addEventListener("map-view-details", handler);
    return () => document.removeEventListener("map-view-details", handler);
  }, []);

  const toggleHeatmap = () => setShowHeatmap((prev) => !prev);

  const resetView = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(GUMACA_CENTER, 14, { duration: 0.8 });
    }
  };

  // Count active markers
  const activeCount = incidents.filter(
    (inc) => inc.status !== "Resolved" && inc.status !== "Closed" && inc.latitude && inc.longitude
  ).length;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapRef} id="incident-map" style={{ width: "100%", height: "100%" }} />

      {/* Map Controls Overlay (Top Right) */}
      <div className="map-controls">
        {/* Recenter Map Button */}
        <button
          className="map-control-btn"
          onClick={resetView}
          title="Recenter Map to Gumaca Poblacion"
          id="btn-recenter-map"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>Recenter</span>
        </button>

        {/* Toggle Heatmap Button */}
        <button
          className={`map-control-btn ${showHeatmap ? "active" : ""}`}
          onClick={toggleHeatmap}
          title={showHeatmap ? "Hide Heatmap" : "Show Heatmap"}
          id="btn-toggle-heatmap"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span>Heatmap</span>
        </button>
      </div>

      {/* Top Left HUD: Active Incidents count only */}
      <div className="map-hud-container">
        <div className="map-active-count">
          <span className="map-active-dot"></span>
          <span>{activeCount} Active Incidents</span>
        </div>
      </div>

      {/* Map Legend Overlay */}
      <div className="map-legend">
        <div className="map-legend-title">Coverage &amp; Types</div>

        {Object.entries(CATEGORY_COLORS).map(([key, color]) => (
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
      </div>
    </div>
  );
}
