"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { useTheme } from "@/components/ThemeContext";
import { validateIncidentLocation } from "@kalasag/shared-validation";

interface IncidentLocationMapProps {
  latitude: number;
  longitude: number;
  reference: string;
  locationLabel: string;
}

export default function IncidentLocationMap({
  latitude,
  longitude,
  reference,
  locationLabel,
}: IncidentLocationMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [loadError, setLoadError] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    const element = mapElementRef.current;
    if (
      !element ||
      !validateIncidentLocation(latitude, longitude)
    ) {
      return;
    }

    setLoadError(false);
    let disposed = false;
    let map: LeafletMap | null = null;

    const initializeMap = async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");

        if (disposed || !element.isConnected) return;

        const createdMap = L.map(element, {
          center: [latitude, longitude],
          zoom: 16,
          scrollWheelZoom: false,
        });
        map = createdMap;
        mapRef.current = createdMap;

        const tileLayer = L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            subdomains: ["a", "b", "c"],
          },
        ).addTo(createdMap);
        tileLayer.on("tileerror", () => {
          if (!disposed) setLoadError(true);
        });

        const marker = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: "",
            html: '<span class="incident-location-pin"></span>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        }).addTo(createdMap);

        const popup = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = reference;
        const location = document.createElement("p");
        location.textContent = locationLabel;
        popup.append(title, location);
        marker.bindPopup(popup);

        if (document.documentElement.getAttribute("data-theme") !== "light") {
          createdMap.getPane("tilePane")?.classList.add("dark-map-tiles");
        }

        createdMap.whenReady(() => {
          if (!disposed) createdMap.invalidateSize();
        });
      } catch (error) {
        if (disposed) return;
        console.error("Incident location map failed to load", error);
        setLoadError(true);
      }
    };

    void initializeMap();

    return () => {
      disposed = true;
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [latitude, locationLabel, longitude, reference]);

  useEffect(() => {
    const tilePane = mapRef.current?.getPane("tilePane");
    if (!tilePane) return;
    tilePane.classList.toggle("dark-map-tiles", theme === "dark");
  }, [theme]);

  return (
    <>
      <div
        aria-label={`Map showing incident ${reference}`}
        className="incident-location-map"
        ref={mapElementRef}
        role="region"
      />
      {loadError && (
        <p className="incident-location-map-notice" role="status">
          The map could not be fully loaded. Use the Open map link above to view this location.
        </p>
      )}
    </>
  );
}
