import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/lib/theme-context';

export interface NativeMapIncident {
  id: string;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  priority: string;
  status: string;
  reportId: string;
  color: string;
}

interface NativeIncidentMapProps {
  incidents: NativeMapIncident[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
}

const MAP_HTML = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <style>
      html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #e8edf2; }
      .leaflet-control-attribution { font-size: 9px; }
      .popup-title { margin: 0 0 5px; font: 700 13px system-ui, sans-serif; }
      .popup-description { margin: 0 0 5px; font: 12px/1.4 system-ui, sans-serif; }
      .popup-meta { margin: 0; color: #526170; font: 11px system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      (function () {
        if (!window.L) {
          document.body.innerHTML = '<div style="padding:20px;font:14px system-ui">Map tiles are unavailable. Check your internet connection.</div>';
          return;
        }
        var map = L.map('map', { zoomControl: true }).setView([13.922, 122.099], 12);
        var markers = L.layerGroup().addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          subdomains: ['a', 'b', 'c']
        }).addTo(map);
        function escapeHtml(value) {
          return String(value).replace(/[&<>"']/g, function (character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
          });
        }
        function receiveMessage(event) {
          var payload;
          try { payload = JSON.parse(event.data); } catch (_) { return; }
          if (payload.type !== 'update') return;
          markers.clearLayers();
          var bounds = [];
          (payload.incidents || []).forEach(function (incident) {
            var point = [incident.latitude, incident.longitude];
            bounds.push(point);
            var marker = L.circleMarker(point, {
              radius: incident.id === payload.selectedIncidentId ? 10 : 7,
              color: '#ffffff',
              weight: 2,
              fillColor: incident.color,
              fillOpacity: 0.95
            });
            marker.options.incidentId = incident.id;
            marker.bindPopup(
              '<h3 class="popup-title">' + escapeHtml(incident.category) + ' · ' + escapeHtml(incident.reportId) + '</h3>' +
              '<p class="popup-description">' + escapeHtml(incident.description) + '</p>' +
              '<p class="popup-meta">' + escapeHtml(incident.status) + ' · ' + escapeHtml(incident.priority) + ' priority</p>'
            );
            marker.on('click', function () {
              if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(incident.id);
            });
            markers.addLayer(marker);
          });
          if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
          else if (bounds.length === 1) map.setView(bounds[0], 15);
          else map.setView([13.922, 122.099], 12);
          if (payload.selectedIncidentId) {
            markers.eachLayer(function (marker) {
              if (marker.getPopup() && marker.getLatLng() && marker.options.incidentId === payload.selectedIncidentId) marker.openPopup();
            });
          }
        }
        window.addEventListener('message', receiveMessage);
        document.addEventListener('message', receiveMessage);
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('__map_ready__');
      })();
    </script>
  </body>
</html>`;

export function NativeIncidentMap({ incidents, selectedIncidentId, onSelectIncident }: NativeIncidentMapProps) {
  const { colors } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);

  const sendMapData = useCallback(() => {
    if (!loaded) return;
    const message = JSON.stringify({ type: 'update', incidents, selectedIncidentId });
    webViewRef.current?.postMessage(message);
  }, [incidents, loaded, selectedIncidentId]);

  useEffect(() => {
    sendMapData();
  }, [sendMapData]);

  const handleMessage = (event: WebViewMessageEvent) => {
    if (event.nativeEvent.data === '__map_ready__') {
      setLoaded(true);
      return;
    }
    onSelectIncident(event.nativeEvent.data);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundElement }]}>
      <WebView
        ref={webViewRef}
        source={{ html: MAP_HTML }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        nestedScrollEnabled
        onLoadEnd={() => setLoaded(true)}
        onMessage={handleMessage}
        style={styles.webView}
      />
      {!loaded && (
        <View style={[styles.loadingOverlay, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText style={{ color: colors.textSecondary }}>Loading incident map…</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, overflow: 'hidden', borderRadius: 12 },
  webView: { flex: 1, backgroundColor: 'transparent' },
  loadingOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
