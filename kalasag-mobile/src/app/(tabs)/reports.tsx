import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { Link } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AlertIcon, FileIcon, PinIcon } from '@/components/Icons';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { ThemeToggle } from '@/components/ThemeToggle';

interface ResidentReport {
  id: string;
  category?: string;
  incident_description?: string;
  report_id?: string;
  status?: string;
  priority_level?: string;
  report_date?: any;
  created_at?: string;
  latitude?: number;
  longitude?: number;
}

function getDateValue(value: any): number {
  if (value?.toDate) return value.toDate().getTime();
  const date = new Date(value || 0).getTime();
  return Number.isFinite(date) ? date : 0;
}

function formatReportDate(report: ResidentReport): string {
  const value = report.report_date || report.created_at;
  const timestamp = getDateValue(value);
  return timestamp ? new Date(timestamp).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }) : 'Date unavailable';
}

function getStatusStyle(status: string, colors: ReturnType<typeof useTheme>['colors']) {
  switch (status) {
    case 'In Progress': return { label: 'RESPONDING', color: colors.badgeOrangeText, background: colors.accentOrangeGlow };
    case 'Resolved':
    case 'Closed': return { label: 'COMPLETED', color: colors.badgeGreenText, background: colors.accentGreenGlow };
    default: return { label: 'RECEIVED', color: colors.badgeBlueText, background: colors.accentBlueGlow };
  }
}

export default function MyReportsScreen() {
  const { colors } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const insets = useSafeAreaInsets();
  const [reports, setReports] = useState<ResidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const reportsQuery = useMemo(() => userId
    ? query(collection(db, 'incident_reports'), where('reporter_uid', '==', userId), limit(100))
    : null, [userId]);

  useEffect(() => {
    if (!userId || !reportsQuery) return;

    return onSnapshot(reportsQuery, (snapshot) => {
      const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ResidentReport));
      data.sort((a, b) => getDateValue(b.report_date || b.created_at) - getDateValue(a.report_date || a.created_at));
      setReports(data);
      setError('');
      setLoading(false);
    }, (snapshotError) => {
      console.error('Could not load resident reports:', snapshotError);
      setError('Your reports could not be loaded. Check your connection and try again.');
      setLoading(false);
    });
  }, [userId, reportsQuery]);

  const refreshReports = async () => {
    if (!reportsQuery) return;
    setRefreshing(true);
    try {
      const snapshot = await getDocs(reportsQuery);
      const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ResidentReport));
      data.sort((a, b) => getDateValue(b.report_date || b.created_at) - getDateValue(a.report_date || a.created_at));
      setReports(data);
      setError('');
    } catch (refreshError) {
      console.error('Could not refresh resident reports:', refreshError);
      setError('Your reports could not be refreshed. Check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { borderBottomColor: colors.glassBorder }]}>
          <View style={styles.headerTop}>
            <View style={styles.titleRow}>
              <FileIcon size={20} color={colors.accentRed} />
              <ThemedText style={styles.title}>MY REPORTS</ThemedText>
            </View>
            <ThemeToggle compact />
          </View>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
            Live updates from KALASAG dispatch
          </ThemedText>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + BottomTabInset + Spacing.four, 120) }]}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshReports}
              tintColor={colors.accentBlue}
              colors={[colors.accentBlue, colors.accentRed]}
              progressBackgroundColor={colors.backgroundElement}
            />
          )}
        >
          {authLoading || (user && loading) ? (
            <View style={styles.state}>
              <ActivityIndicator size="large" color={colors.accentRed} />
              <ThemedText style={{ color: colors.textSecondary }}>Loading your reports...</ThemedText>
            </View>
          ) : error ? (
            <View style={[styles.emptyState, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
              <AlertIcon size={24} color={colors.accentOrange} />
              <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>{error}</ThemedText>
            </View>
          ) : !user ? (
            <View style={[styles.emptyState, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
              <FileIcon size={26} color={colors.accentBlue} />
              <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>Sign in to track your reports</ThemedText>
              <Link href="/login" asChild>
                <TouchableOpacity style={styles.actionLinkButton}>
                  <ThemedText style={[styles.actionLink, { color: colors.accentBlue }]}>SIGN IN</ThemedText>
                </TouchableOpacity>
              </Link>
            </View>
          ) : reports.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
              <FileIcon size={26} color={colors.accentBlue} />
              <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No reports submitted yet</ThemedText>
              <Link href="/" asChild>
                <TouchableOpacity style={styles.actionLinkButton}>
                  <ThemedText style={[styles.actionLink, { color: colors.accentBlue }]}>CREATE A REPORT</ThemedText>
                </TouchableOpacity>
              </Link>
            </View>
          ) : (
            reports.map((report) => {
              const status = getStatusStyle(report.status || 'Pending', colors);
              return (
                <View key={report.id} style={[styles.reportCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleGroup}>
                      <ThemedText style={[styles.category, { color: colors.text }]}>
                        {(report.category || 'Incident report').toUpperCase()}
                      </ThemedText>
                      <ThemedText style={[styles.reportNumber, { color: colors.textMuted }]}>
                        {report.report_id || `REPORT ${report.id.slice(0, 6).toUpperCase()}`}
                      </ThemedText>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: status.background }]}>
                      <ThemedText style={[styles.statusText, { color: status.color }]}>{status.label}</ThemedText>
                    </View>
                  </View>

                  <ThemedText style={[styles.description, { color: colors.textSecondary }]} numberOfLines={3}>
                    {report.incident_description || 'No description provided.'}
                  </ThemedText>

                  <View style={[styles.cardFooter, { borderTopColor: colors.glassBorder }]}>
                    <ThemedText style={[styles.date, { color: colors.textMuted }]}>{formatReportDate(report)}</ThemedText>
                    {typeof report.latitude === 'number' && typeof report.longitude === 'number' && (
                      <View style={styles.location}>
                        <PinIcon size={13} color={colors.accentBlue} />
                        <ThemedText style={[styles.locationText, { color: colors.textMuted }]}>
                          {report.latitude.toFixed(3)}, {report.longitude.toFixed(3)}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  header: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { marginTop: 4, fontSize: 11, fontWeight: '500' },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 16, gap: 12 },
  state: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyState: { minHeight: 220, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyTitle: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  actionLink: { fontSize: 12, fontWeight: '800', padding: 8 },
  actionLinkButton: { alignSelf: 'center' },
  reportCard: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardTitleGroup: { flex: 1, gap: 3 },
  category: { fontSize: 13, fontWeight: '800' },
  reportNumber: { fontSize: 10, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 5 },
  statusText: { fontSize: 9, fontWeight: '800' },
  description: { fontSize: 13, lineHeight: 19 },
  cardFooter: { borderTopWidth: 1, paddingTop: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  date: { fontSize: 10 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 10, fontWeight: '600' },
});