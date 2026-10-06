import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Platform,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn, FadeInRight } from 'react-native-reanimated';
import { collection, query, onSnapshot, getDocs } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PinIcon, AlertIcon, ShieldIcon } from '@/components/Icons';
import { NativeIncidentMap, NativeMapIncident } from '@/components/NativeIncidentMap';
import { useTheme } from '@/lib/theme-context';
import { ThemeToggle } from '@/components/ThemeToggle';

interface IncidentReport {
  id: string;
  category: string;
  secondary_category?: string | null;
  priority_level: string;
  incident_description: string;
  latitude: number;
  longitude: number;
  status: string;
  report_date?: any;
  report_id?: string;
  blotter_id?: string;
  surge_mode: boolean;
}

const CATEGORIES = ['ALL', 'FLOODING', 'FIRE INCIDENT', 'MEDICAL EMERGENCY', 'ROAD OBSTRUCTION', 'OTHER DISASTER'];

// Category-to-color mapping (EXACT match with dashboard Map.js)
const CATEGORY_COLORS: Record<string, string> = {
  'flooding': '#1565C0',
  'fire incident': '#C62828',
  'road obstruction': '#E65100',
  'medical emergency': '#F9A825',
  'other disaster-related incidents': '#7B1FA2',
};

const CATEGORY_VECTOR_SVGS: Record<string, string> = {
  'flooding': '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>',
  'fire incident': '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  'road obstruction': '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  'medical emergency': '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  'other disaster-related incidents': '<svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

const CATEGORY_LABELS: Record<string, string> = {
  'flooding': 'Flooding',
  'fire incident': 'Fire',
  'road obstruction': 'Road Obstruction',
  'medical emergency': 'Medical Emergency',
  'other disaster-related incidents': 'Other Incidents',
};

function getActiveIncidents(snapshot: any): IncidentReport[] {
  const reports: IncidentReport[] = [];
  snapshot.forEach((doc: any) => {
    const data = doc.data();
    const status = data.status || 'Pending';
    if (Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude)) && status !== 'Resolved' && status !== 'Closed') {
      const indexNum = reports.length + 1;
      reports.push({
        id: doc.id,
        category: (data.category || 'other disaster-related incidents').toLowerCase(),
        secondary_category: data.secondary_category || null,
        priority_level: data.priority_level || 'Medium',
        incident_description: data.incident_description || 'Incident details unavailable.',
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        status,
        report_date: data.report_date,
        report_id: data.report_id || `REPORT ${indexNum.toString().padStart(2, '0')}`,
        blotter_id: data.blotter_id || `BLOTTER ${indexNum.toString().padStart(2, '0')}`,
        surge_mode: data.surge_mode === true,
      });
    }
  });
  return reports;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function formatReportDate(value: any) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function'
    ? value.toDate()
    : value?.seconds
      ? new Date(value.seconds * 1000)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export default function DedicatedMapScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const mapHeight = Platform.OS === 'web'
    ? 320
    : Math.min(360, Math.max(180, Math.round(windowHeight * (windowHeight <= 700 ? 0.34 : 0.4))));
  const dynamicBottomPadding = Math.max(insets.bottom + 115, 140);

  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedIncident, setSelectedIncident] = useState<IncidentReport | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<{ id: string; marker: any }[]>([]);

  // Subscribe to live incident reports from Firestore — ACTIVE INCIDENTS ONLY (Filter out Resolved and Closed)
  useEffect(() => {
    const q = query(collection(db, 'public_incidents'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = getActiveIncidents(snapshot);

      setIncidents(docs);
      setSelectedIncident((prev) => (prev && docs.some(d => d.id === prev.id) ? prev : docs[0] ?? null));
      setLoading(false);
    }, (err) => {
      console.warn('Firestore read restricted for mobile map:', err.message);
      setIncidents([]);
      setSelectedIncident(null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshIncidents = async () => {
    setRefreshing(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'public_incidents')));
      const reports = getActiveIncidents(snapshot);
      setIncidents(reports);
      setSelectedIncident((prev) => (prev && reports.some((report) => report.id === prev.id) ? prev : reports[0] ?? null));
    } catch (err: any) {
      console.warn('Could not refresh mobile map reports:', err.message);
    } finally {
      setRefreshing(false);
    }
  };

  // Initialize Leaflet map (web only) with EXACT Dashboard styling & markers
  useEffect(() => {
    if (Platform.OS !== 'web' || loading) return;

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      const initLeaflet = async () => {
        // Inject Leaflet CSS CDN link
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        const L = (await import('leaflet')).default;
        leafletRef.current = L;

        if ((mapContainerRef.current as any)._leaflet_id) {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize();
          }
          return;
        }

        // Standard OpenStreetMap tiles — 100% free, no API key required
        const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

        const map = L.map(mapContainerRef.current!, {
          center: [13.9220, 122.0990],
          zoom: 14,
          zoomControl: false,
        });

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        L.tileLayer(tileUrl, {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          subdomains: ['a', 'b', 'c'],
          maxZoom: 19,
          className: isDark ? 'dark-map-tiles' : '',
        }).addTo(map);

        mapInstanceRef.current = map;
        setTimeout(() => map.invalidateSize(), 300);

        // Inject Dashboard-Identical Marker, Popup & Dark Map CSS
        let style = document.getElementById('mobile-map-styles') as HTMLStyleElement | null;
        if (!style) {
          style = document.createElement('style');
          style.id = 'mobile-map-styles';
          document.head.appendChild(style);
        }

        style.textContent = `
            :root {
              --mobile-map-popup-bg: rgba(17, 21, 26, 0.9);
              --mobile-map-popup-text: #FFFFFF;
              --mobile-map-popup-muted: #8E9AA8;
              --mobile-map-popup-subtle: #536271;
              --mobile-map-popup-border: rgba(255, 255, 255, 0.1);
              --mobile-map-popup-divider: rgba(255, 255, 255, 0.08);
              --mobile-map-popup-shadow: rgba(0, 0, 0, 0.6);
            }
            [data-theme="light"] {
              --mobile-map-popup-bg: rgba(255, 255, 255, 0.92);
              --mobile-map-popup-text: #0F172A;
              --mobile-map-popup-muted: #475569;
              --mobile-map-popup-subtle: #64748B;
              --mobile-map-popup-border: rgba(0, 0, 0, 0.12);
              --mobile-map-popup-divider: rgba(15, 23, 42, 0.1);
              --mobile-map-popup-shadow: rgba(0, 0, 0, 0.15);
            }
            .map-marker-wrapper { position: relative; width: 40px; height: 48px; display: flex; align-items: center; justify-content: center; }
            .custom-pin {
              width: 36px; height: 36px; border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg); display: flex; align-items: center;
              justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
              transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
            }
            .custom-pin span { transform: rotate(45deg); font-size: 16px; }
            .marker-drop { animation: markerDrop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
            @keyframes markerDrop {
              0% { transform: rotate(-45deg) translateY(-30px); opacity: 0; }
              60% { transform: rotate(-45deg) translateY(2px); }
              100% { transform: rotate(-45deg) translateY(0); opacity: 1; }
            }
            .pulse-ring {
              position: absolute; top: -4px; left: -4px; width: 44px; height: 44px;
              border-radius: 50%; border: 2px solid #C62828; animation: pulseGlow 2s infinite; pointer-events: none;
            }
            @keyframes pulseGlow {
              0% { transform: scale(0.8); opacity: 0.9; }
              100% { transform: scale(2.0); opacity: 0; }
            }
            .dark-map-tiles .leaflet-tile,
            .dark-map-tiles.leaflet-tile {
              filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
            }
            .dark-popup .leaflet-popup-content-wrapper {
              background: var(--mobile-map-popup-bg); color: var(--mobile-map-popup-text); border-radius: 12px;
              border: 1px solid var(--mobile-map-popup-border);
              box-shadow: 0 12px 32px var(--mobile-map-popup-shadow); padding: 4px;
              backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
              font-family: var(--font-family, system-ui, -apple-system, sans-serif);
            }
            .dark-popup .leaflet-popup-tip { background: var(--mobile-map-popup-bg); border: 1px solid var(--mobile-map-popup-border); }
            .map-popup-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid var(--mobile-map-popup-divider); }
            .map-popup-header strong { font-size: 11px; letter-spacing: 0.5px; font-weight: 800; color: var(--mobile-map-popup-text); }
            .map-popup-badge { font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase; }
            .map-popup-desc { font-size: 12px; line-height: 1.4; margin: 6px 0; color: var(--mobile-map-popup-muted); white-space: pre-wrap; overflow-wrap: anywhere; }
            .map-popup-meta { display: flex; justify-content: space-between; font-size: 10px; color: var(--mobile-map-popup-subtle); margin-top: 4px; }
          `;
      };

      initLeaflet();
    }, 100);

    return () => {
      clearTimeout(timer);
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      leafletRef.current = null;
      markersRef.current = [];
    };
  }, [isDark, loading, mapHeight]);

  // Update markers when active incidents change
  useEffect(() => {
    const L = leafletRef.current;
    if (!mapInstanceRef.current || !L) return;
    const map = mapInstanceRef.current;

    // Clear old markers
    markersRef.current.forEach(({ marker }) => map.removeLayer(marker));
    markersRef.current = [];

    const filtered = incidents.filter((inc) => {
      if (selectedCategory === 'ALL') return true;
      return (inc.category || '').toUpperCase().includes(selectedCategory);
    });

    filtered.forEach((inc) => {
      const cat = (inc.category || 'other disaster-related incidents').toLowerCase();
      const color = CATEGORY_COLORS[cat] || '#7B1FA2';
      const iconSvg = CATEGORY_VECTOR_SVGS[cat] || CATEGORY_VECTOR_SVGS['other disaster-related incidents'];
      const isPending = inc.status === 'Pending';
      const isSelected = selectedIncident?.id === inc.id;

      const divIcon = L.divIcon({
        className: '',
        html: `
          <div class="map-marker-wrapper">
            ${isPending ? `<div class="pulse-ring" style="border-color: ${color};"></div>` : ''}
            <div class="custom-pin marker-drop" style="background:${color}; ${isSelected ? `transform: rotate(-45deg) scale(1.3); box-shadow: 0 0 16px ${color};` : ''}">
              <span style="display:flex; align-items:center; justify-content:center;">${iconSvg}</span>
            </div>
          </div>
        `,
        iconSize: [40, 48],
        iconAnchor: [20, 48],
        popupAnchor: [0, -48],
      });

      const marker = L.marker([inc.latitude, inc.longitude], { icon: divIcon });

      const statusColor = inc.status === 'Pending' ? '#F9A825' : inc.status === 'In Progress' ? '#E65100' : '#2E7D32';
      const priorityColor = inc.priority_level === 'High' ? '#C62828' : inc.priority_level === 'Low' ? '#2E7D32' : '#E65100';

      const limitBadgeHtml = `<div style="font-size: 10px; font-weight: 800; color: #0284C7; margin: 2px 0 4px 0;">📍 GPS Tagged: [${Number(inc.latitude).toFixed(4)}, ${Number(inc.longitude).toFixed(4)}]</div>`;

      marker.bindPopup(`
        <div style="min-width: 220px; padding: 4px;">
          <div class="map-popup-header" style="border-left: 3px solid ${color}; padding-left: 8px;">
            <strong>${(CATEGORY_LABELS[cat] || cat).toUpperCase()}</strong>
            <span class="map-popup-badge" style="background:${statusColor}20; color:${statusColor}; border:1px solid ${statusColor};">${inc.status}</span>
          </div>
          ${limitBadgeHtml}
          <p class="map-popup-desc">${escapeHtml(inc.incident_description)}</p>
          <div class="map-popup-meta">
            <span style="color:${priorityColor}; font-weight:600;">${inc.priority_level} Priority${inc.secondary_category ? ` · ${escapeHtml(inc.secondary_category)}` : ''}${inc.surge_mode ? ' · SURGE' : ''}</span>
          </div>
        </div>
      `, { maxWidth: 280, className: 'dark-popup' });

      marker.on('click', () => {
        setSelectedIncident(inc);
      });

      marker.addTo(map);
      markersRef.current.push({ id: inc.id, marker });
    });
  }, [incidents, selectedCategory, selectedIncident?.id]);

  // Fly to selected incident
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedIncident) return;
    mapInstanceRef.current.flyTo([selectedIncident.latitude, selectedIncident.longitude], 16, { duration: 0.6 });
    markersRef.current.find(({ id }) => id === selectedIncident.id)?.marker.openPopup();
  }, [selectedIncident]);

  const filteredIncidents = incidents.filter((inc) => {
    if (selectedCategory === 'ALL') return true;
    return (inc.category || '').toUpperCase().includes(selectedCategory);
  });

  const getMarkerColor = (cat: string) => CATEGORY_COLORS[(cat || '').toLowerCase()] || '#7B1FA2';

  const getPriorityBadgeColor = (priority: string) => {
    switch ((priority || '').toLowerCase()) {
      case 'high': return { bg: colors.accentRedGlow, text: colors.badgeRedText, border: colors.accentRed };
      case 'medium': return { bg: colors.accentOrangeGlow, text: colors.badgeOrangeText, border: colors.accentOrange };
      case 'low': return { bg: colors.accentBlueGlow, text: colors.badgeBlueText, border: colors.accentBlue };
      default: return { bg: colors.glassBg, text: colors.textSecondary, border: colors.glassBorder };
    }
  };

  const getStatusColor = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'pending': return { bg: colors.accentYellowGlow, text: colors.badgeYellowText, border: colors.accentYellow };
      case 'in progress': return { bg: colors.accentOrangeGlow, text: colors.badgeOrangeText, border: colors.accentOrange };
      case 'resolved': return { bg: colors.accentGreenGlow, text: colors.badgeGreenText, border: colors.accentGreen };
      default: return { bg: colors.glassBg, text: colors.textMuted, border: colors.glassBorder };
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        
        {/* Header — dashboard-aligned */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
          <View style={[styles.header, { borderBottomColor: colors.glassBorder }]}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerTitleRow}>
                <ShieldIcon size={20} color={colors.accentRed} />
                <ThemedText style={styles.headerTitle}>COMMUNITY INCIDENT MAP</ThemedText>
              </View>
              <ThemeToggle compact />
            </View>
            <ThemedText style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Live MDRRMO Hazard & Emergency Reports — Gumaca, Quezon
            </ThemedText>
          </View>
        </Animated.View>

        {/* Category Filter Scroll — dashboard filter-btn style */}
        <Animated.View entering={FadeInDown.duration(400).delay(200)}>
          <View style={styles.filterWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              {CATEGORIES.map((cat, idx) => {
                const isSelected = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: isSelected ? colors.accentRedGlow : colors.glassBg,
                        borderColor: isSelected ? colors.accentRed : colors.glassBorder,
                      }
                    ]}
                    onPress={() => {
                      setSelectedCategory(cat);
                      const visibleIncidents = incidents.filter((incident) =>
                        cat === 'ALL' || incident.category.toUpperCase().includes(cat)
                      );
                      setSelectedIncident((current) =>
                        current && visibleIncidents.some((incident) => incident.id === current.id)
                          ? current
                          : visibleIncidents[0] ?? null
                      );
                    }}
                  >
                    <ThemedText
                      style={[
                        styles.filterChipText,
                        { color: isSelected ? colors.badgeRedText : colors.textSecondary }
                      ]}
                    >
                      {cat}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Animated.View>

        {/* Main Map View Container */}
        <ScrollView
          style={styles.mainContent}
          contentContainerStyle={[styles.mainContentContent, { paddingBottom: dynamicBottomPadding }]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshIncidents}
              tintColor={colors.accentBlue}
              colors={[colors.accentBlue, colors.accentRed]}
              progressBackgroundColor={colors.backgroundElement}
            />
          )}
        >
          {loading ? (
            <View style={[styles.loaderBox, { height: mapHeight }]}>
              <ActivityIndicator size="large" color={colors.accentRed} />
              <ThemedText style={[styles.loaderText, { color: colors.textSecondary }]}>Loading live incident map...</ThemedText>
            </View>
          ) : (
            <Animated.View entering={FadeIn.duration(600)}>
              <View style={[styles.mapCard, { height: mapHeight, borderColor: colors.glassBorder, backgroundColor: colors.backgroundElement }, Shadows.sm]}>
                
                {Platform.OS === 'web' ? (
                  <div
                    ref={mapContainerRef as any}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      width: '100%',
                      height: '100%',
                      borderRadius: 12,
                      zIndex: 1,
                    }}
                  />
                ) : (
                  <NativeIncidentMap
                    incidents={filteredIncidents.map((incident): NativeMapIncident => ({
                      id: incident.id,
                      category: CATEGORY_LABELS[incident.category] || incident.category,
                      description: incident.incident_description,
                      latitude: incident.latitude,
                      longitude: incident.longitude,
                      priority: incident.priority_level,
                      status: incident.status,
                      reportId: incident.report_id || 'REPORT',
                      color: getMarkerColor(incident.category),
                    }))}
                    selectedIncidentId={selectedIncident?.id ?? null}
                    onSelectIncident={(id) => {
                      const incident = filteredIncidents.find((item) => item.id === id);
                      if (incident) setSelectedIncident(incident);
                    }}
                  />
                )}

                {/* Top Status Floating Badge */}
                <View style={[styles.floatingStatusBadge, { backgroundColor: colors.backgroundElement, borderColor: colors.glassBorder }, Shadows.sm]}>
                  <View style={[styles.pulseDot, { backgroundColor: colors.accentRed }]} />
                  <ThemedText style={[styles.floatingStatusText, { color: colors.text }]}>
                    {filteredIncidents.length} ACTIVE {filteredIncidents.length === 1 ? 'REPORT' : 'REPORTS'}
                  </ThemedText>
                </View>

                <View style={[styles.mapLegend, { backgroundColor: colors.backgroundElement, borderColor: colors.glassBorder }, Shadows.sm]}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mapLegendScroll}>
                    {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                      <View key={category} style={styles.mapLegendItem}>
                        <View style={[styles.mapLegendSwatch, { backgroundColor: CATEGORY_COLORS[category] }]} />
                        <ThemedText numberOfLines={1} style={[styles.mapLegendLabel, { color: colors.textSecondary }]}>{label}</ThemedText>
                      </View>
                    ))}
                    <View style={styles.mapLegendItem}>
                      <View style={[styles.mapLegendPending, { backgroundColor: colors.accentYellow }]} />
                      <ThemedText numberOfLines={1} style={[styles.mapLegendLabel, { color: colors.textSecondary }]}>Pending (needs action)</ThemedText>
                    </View>
                  </ScrollView>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Incident Pins Selector List */}
          <View style={styles.incidentsListWrapper}>
            <ThemedText style={[styles.listHeader, { color: colors.textMuted }]}>TAP REPORT TO FOCUS MAP:</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.incidentsScroll}>
              {filteredIncidents.length === 0 && (
                <ThemedText style={[styles.emptyListText, { color: colors.textSecondary }]}>No active incident reports.</ThemedText>
              )}
              {filteredIncidents.map((inc, index) => {
                const isSelected = selectedIncident?.id === inc.id;
                const catColor = getMarkerColor(inc.category);
                const priorityColors = getPriorityBadgeColor(inc.priority_level);

                return (
                  <Animated.View key={inc.id} entering={FadeInRight.duration(400).delay(index * 80)}>
                    <TouchableOpacity
                      style={[
                        styles.incidentChipCard,
                        {
                          backgroundColor: colors.glassBg,
                          borderColor: isSelected ? colors.accentRed : colors.glassBorder,
                          borderLeftColor: catColor,
                          borderLeftWidth: 3,
                        },
                        isSelected && Shadows.sm,
                      ]}
                      onPress={() => setSelectedIncident(inc)}
                    >
                      <View style={styles.incidentChipTop}>
                        <View style={[styles.catBadge, { backgroundColor: `${catColor}20`, borderColor: `${catColor}40`, borderWidth: 1 }]}>
                          <ThemedText style={[styles.catBadgeText, { color: catColor }]}>
                            {(CATEGORY_LABELS[inc.category] || inc.category).toUpperCase()}
                          </ThemedText>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={[styles.reportIdPill, { backgroundColor: colors.accentRedGlow, borderColor: colors.accentRed }]}>
                            <ThemedText style={[styles.reportIdPillText, { color: colors.badgeRedText }]}>
                              {inc.report_id || 'REPORT 01'}
                            </ThemedText>
                          </View>
                          <View style={[styles.priorityPill, { backgroundColor: priorityColors.bg, borderColor: priorityColors.border, borderWidth: 1 }]}>
                            <ThemedText style={[styles.priorityText, { color: priorityColors.text }]}>
                              {inc.priority_level}
                            </ThemedText>
                          </View>
                        </View>
                      </View>
                      <ThemedText style={[styles.incidentChipDesc, { color: colors.text }]} numberOfLines={1}>
                        {inc.incident_description}
                      </ThemedText>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </ScrollView>
          </View>

          {/* Selected Incident Details Bottom Card */}
          {selectedIncident && (
            <Animated.View entering={FadeInDown.duration(500)}>
              <View style={[styles.detailsCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }, Shadows.sm]}>
                <View style={styles.detailsHeader}>
                  <View style={styles.detailsHeaderLeft}>
                    <AlertIcon size={16} color={getMarkerColor(selectedIncident.category)} />
                    <ThemedText style={[styles.detailsCategory, { color: colors.text }]}>{selectedIncident.category.toUpperCase()}</ThemedText>
                    <View style={[styles.reportIdPill, { backgroundColor: colors.accentRedGlow, borderColor: colors.accentRed }]}>
                      <ThemedText style={[styles.reportIdPillText, { color: colors.badgeRedText }]}>
                        {selectedIncident.report_id || 'REPORT 01'}
                      </ThemedText>
                    </View>
                  </View>

                  {(() => {
                    const statusColors = getStatusColor(selectedIncident.status);
                    return (
                      <View style={[styles.statusPill, { backgroundColor: statusColors.bg, borderColor: statusColors.border, borderWidth: 1 }]}>
                        <ThemedText style={[styles.statusPillText, { color: statusColors.text }]}>
                          {selectedIncident.status.toUpperCase()}
                        </ThemedText>
                      </View>
                    );
                  })()}
                </View>

                <ThemedText style={[styles.detailsDesc, { color: colors.textSecondary }]}>
                  {selectedIncident.incident_description}
                </ThemedText>

                {(selectedIncident.secondary_category || selectedIncident.surge_mode) && (
                  <ThemedText style={[styles.detailsMeta, { color: colors.accentBlue }]}>
                    {[
                      selectedIncident.secondary_category,
                      selectedIncident.surge_mode ? 'Surge response' : null,
                    ].filter(Boolean).join(' · ')}
                  </ThemedText>
                )}

                <View style={styles.detailsInfoRow}>
                  <ThemedText style={[styles.detailsMeta, { color: colors.textMuted }]}>
                    {selectedIncident.priority_level} priority
                  </ThemedText>
                  {formatReportDate(selectedIncident.report_date) ? (
                    <ThemedText style={[styles.detailsMeta, { color: colors.textMuted }]}>
                      {formatReportDate(selectedIncident.report_date)}
                    </ThemedText>
                  ) : null}
                </View>

                <View style={[styles.detailsFooter, { borderTopColor: colors.glassBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <PinIcon size={12} color={colors.textMuted} />
                    <ThemedText style={[styles.detailsCoords, { color: colors.textMuted }]}>
                      {selectedIncident.latitude.toFixed(4)}, {selectedIncident.longitude.toFixed(4)}
                    </ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <ShieldIcon size={12} color={colors.accentBlue} />
                    <ThemedText style={{ fontSize: 10, fontWeight: '800', color: colors.accentBlue }}>
                      GPS Tagged
                    </ThemedText>
                  </View>
                </View>
              </View>
            </Animated.View>
          )}

        </ScrollView>

      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    alignItems: 'stretch',
    borderBottomWidth: 1,
    maxWidth: 620,
    alignSelf: 'center',
    width: '100%',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  filterWrapper: {
    marginVertical: 10,
    maxWidth: 620,
    alignSelf: 'center',
    width: '100%',
  },
  jurisdictionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
    maxWidth: 620,
    alignSelf: 'center',
    width: '100%',
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  mainContent: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  mainContentContent: {
    paddingHorizontal: 16,
    maxWidth: 620,
    alignSelf: 'center',
    width: '100%',
    gap: 14,
  },
  loaderBox: {
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mapCard: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  fallbackIconBg: {
    padding: 16,
    borderRadius: BorderRadius.full,
    marginBottom: 4,
  },
  fallbackTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  fallbackSubtext: {
    fontSize: 11,
    fontWeight: '500',
  },
  floatingStatusBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    zIndex: 10,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  floatingStatusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  mapLegend: {
    position: 'absolute',
    left: 8,
    right: 52,
    bottom: 8,
    zIndex: 10,
    borderWidth: 1,
    borderRadius: 7,
    overflow: 'hidden',
  },
  mapLegendScroll: {
    minHeight: 30,
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
  },
  mapLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mapLegendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    flexShrink: 0,
  },
  mapLegendPending: {
    width: 9,
    height: 9,
    borderRadius: 5,
    flexShrink: 0,
  },
  mapLegendLabel: {
    fontSize: 9,
    fontWeight: '600',
  },
  incidentsListWrapper: {
    gap: 8,
  },
  listHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  incidentsScroll: {
    gap: 10,
    paddingVertical: 2,
  },
  emptyListText: {
    paddingVertical: Spacing.two,
    fontSize: 13,
  },
  incidentChipCard: {
    width: 240,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  incidentChipTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  catBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  catBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  priorityPill: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  incidentChipDesc: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  detailsCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  detailsHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailsHeaderLeft: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  detailsCategory: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  statusPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailsDesc: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  detailsMeta: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 6,
  },
  detailsInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  detailsFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  detailsCoords: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  detailsReporter: {
    fontSize: 10,
    fontWeight: '600',
  },
  reportIdPill: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  reportIdPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
