"use client";

import React, { useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import { useTheme } from "@/components/ThemeContext";

const GUMACA_CENTER: [number, number] = [13.922, 122.099];
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type LeafletContainer = HTMLDivElement & { _leaflet_id?: number | null };

export const IncidentLocationPicker = React.memo(function IncidentLocationPicker({
  location,
  onChoose,
}: {
  location: [number, number] | null;
  onChoose: (latitude: number, longitude: number) => void;
}) {
  const containerRef = useRef<LeafletContainer | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChooseRef = useRef(onChoose);
  onChooseRef.current = onChoose;

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50% 50% 50% 0;
            background: ${isDark ? "#E53935" : "#D32F2F"};
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
            border: 2px solid #FFFFFF;
          ">
            <span style="transform: rotate(45deg); display: flex;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.8">
                <circle cx="12" cy="12" r="4" fill="white" />
              </svg>
            </span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      }),
    [isDark],
  );

  // Initialize Map
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (el._leaflet_id && mapRef.current) {
      return;
    }

    el._leaflet_id = null;

    const initialCenter = location ?? GUMACA_CENTER;
    const map = L.map(el, {
      center: initialCenter,
      zoom: 14,
      scrollWheelZoom: true,
      zoomControl: true,
    });
    mapRef.current = map;

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      subdomains: ["a", "b", "c"],
      maxZoom: 19,
      className: isDark ? "dark-map-tiles" : "",
    }).addTo(map);

    map.on("click", (e) => {
      onChooseRef.current(e.latlng.lat, e.latlng.lng);
    });

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      try {
        map.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
      markerRef.current = null;
      if (el) {
        el._leaflet_id = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update theme on tiles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pane = map.getPane("tilePane");
    if (pane) {
      if (isDark) {
        pane.classList.add("dark-map-tiles");
      } else {
        pane.classList.remove("dark-map-tiles");
      }
    }
  }, [isDark]);

  // Update marker & position when location changes
  const prevLocRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!location) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const [lat, lng] = location;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setIcon(markerIcon);
    } else {
      const marker = L.marker([lat, lng], {
        icon: markerIcon,
        draggable: true,
      }).addTo(map);

      marker.on("dragend", () => {
        const pt = marker.getLatLng();
        onChooseRef.current(pt.lat, pt.lng);
      });
      markerRef.current = marker;
    }

    const prev = prevLocRef.current;
    if (!prev || Math.abs(prev[0] - lat) > 0.0001 || Math.abs(prev[1] - lng) > 0.0001) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      prevLocRef.current = location;
    }
  }, [location, markerIcon]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "260px",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid var(--glass-border)",
      }}
    >
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
        aria-label="Select incident location on map"
      />
    </div>
  );
});
