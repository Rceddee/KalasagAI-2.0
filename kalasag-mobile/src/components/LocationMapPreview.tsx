import React, { useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { BorderRadius, Shadows } from '../constants/theme';
import { ThemedText } from './themed-text';
import { useTheme } from '@/lib/theme-context';

interface LocationMapPreviewProps {
  latitude: number;
  longitude: number;
  isTagged: boolean;
  height?: number;
}

export function LocationMapPreview({ latitude, longitude, isTagged, height = 180 }: LocationMapPreviewProps) {
  const { colors, isDark } = useTheme();
  const [mapLoading, setMapLoading] = useState(Platform.OS !== 'web');
  const [mapUnavailable, setMapUnavailable] = useState(false);

  // OpenStreetMap embed URL
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.008},${latitude - 0.006},${longitude + 0.008},${latitude + 0.006}&layer=mapnik&marker=${latitude},${longitude}`;
  const nativeMapHtml = createNativeMapHtml(latitude, longitude);

  return (
    <View style={[
      styles.container, 
      { borderColor: colors.glassBorder, backgroundColor: colors.backgroundElement },
      Shadows.sm
    ]}>
      {/* Top Status Header Bar */}
      <View style={[styles.headerBar, { backgroundColor: colors.glassBg, borderBottomColor: colors.glassBorder }]}>
        <View style={styles.coordsGroup}>
          <View style={[styles.liveIndicatorDot, { backgroundColor: isTagged ? colors.accentGreen : colors.textMuted }]} />
          <ThemedText style={[styles.coordsText, { color: colors.textSecondary }]}>
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </ThemedText>
        </View>

        <View style={[
          styles.limitBadge,
          {
            backgroundColor: isTagged ? colors.accentGreenGlow : colors.glassBg,
            borderColor: isTagged ? colors.accentGreen : colors.glassBorder,
          }
        ]}>
          <ThemedText style={[
            styles.limitBadgeText,
            { color: isTagged ? colors.badgeGreenText : colors.textMuted }
          ]}>
            {isTagged ? 'GPS Location Tagged' : 'Location Not Tagged'}
          </ThemedText>
        </View>
      </View>

      {/* Map Content */}
      <View style={{ height, width: '100%', position: 'relative' }}>
        {Platform.OS === 'web' ? (
          <iframe
            title={isTagged ? 'Tagged Location Map Preview' : 'Gumaca Area Preview'}
            src={mapSrc}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              filter: isDark ? 'invert(90%) hue-rotate(180deg) brightness(95%) contrast(90%)' : 'none',
            }}
          />
        ) : (
          <>
            <WebView
              source={{ html: nativeMapHtml }}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              onLoadEnd={() => setMapLoading(false)}
              onError={() => {
                setMapLoading(false);
                setMapUnavailable(true);
              }}
              style={styles.webView}
            />
            {(mapLoading || mapUnavailable) && (
              <View style={[styles.mapOverlay, { backgroundColor: colors.backgroundElement }]}>
                {mapLoading ? (
                  <>
                    <ActivityIndicator color={colors.accentBlue} />
                    <ThemedText style={[styles.fallbackTitle, { color: colors.textSecondary }]}>Loading map…</ThemedText>
                  </>
                ) : (
                  <>
                    <ThemedText style={[styles.fallbackTitle, { color: colors.textSecondary }]}>Map unavailable</ThemedText>
                    <ThemedText style={[styles.fallbackCoords, { color: colors.textMuted }]}>
                      Check your internet connection. Your coordinates are still shown above.
                    </ThemedText>
                  </>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    marginTop: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    gap: 8,
    flexWrap: 'wrap',
  },
  coordsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveIndicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  coordsText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  limitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  limitBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mapOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    gap: 6,
  },
  fallbackTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  fallbackCoords: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

function createNativeMapHtml(latitude: number, longitude: number) {
  const safeLatitude = Number.isFinite(latitude) ? latitude : 13.922;
  const safeLongitude = Number.isFinite(longitude) ? longitude : 122.099;

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <style>
      html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #e8edf2; }
      .leaflet-control-attribution { font-size: 9px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onerror="document.body.innerHTML = '<div style=&quot;padding:16px;font:13px system-ui;color:#526170&quot;>Map unavailable. Check your internet connection.</div>'"></script>
    <script>
      if (window.L) {
        var point = [${safeLatitude}, ${safeLongitude}];
        var map = L.map('map', { zoomControl: true, scrollWheelZoom: false }).setView(point, 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          subdomains: ['a', 'b', 'c']
        }).addTo(map);
        L.marker(point).addTo(map);
      }
    </script>
  </body>
</html>`;
}
