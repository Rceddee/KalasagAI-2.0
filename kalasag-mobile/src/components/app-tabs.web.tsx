import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import type { RelativePathString } from 'expo-router';
import { Pressable, View, StyleSheet, Linking, Platform } from 'react-native';
import { ThemedText } from './themed-text';
import { ShieldIcon, MapIcon, DirectoryIcon, PhoneIcon, FileIcon } from './Icons';
import { Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon={ShieldIcon}>Report</TabButton>
          </TabTrigger>

          <TabTrigger name="map" href="/map" asChild>
            <TabButton icon={MapIcon}>Live Map</TabButton>
          </TabTrigger>

          <TabTrigger name="reports" href={'/reports' as RelativePathString} asChild>
            <TabButton icon={FileIcon}>My Reports</TabButton>
          </TabTrigger>

          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton icon={DirectoryIcon}>Directory</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

interface TabButtonProps extends TabTriggerSlotProps {
  icon?: React.ComponentType<{ size?: number; color?: string }>;
}

export function TabButton({ children, isFocused, icon: Icon, ...props }: TabButtonProps) {
  const { colors } = useTheme();
  const iconColor = isFocused ? colors.badgeRedText : colors.textSecondary;

  return (
    <Pressable {...props} style={({ pressed }) => [styles.tabButtonPressable, pressed && styles.pressed]}>
      <View
        style={[
          styles.tabButtonView,
          {
            backgroundColor: isFocused ? colors.accentRedGlow : 'transparent',
            borderColor: isFocused ? colors.accentRed : 'transparent',
          }
        ]}>
        {Icon && <Icon size={14} color={iconColor} />}
        <ThemedText style={[styles.tabLabel, { color: isFocused ? colors.badgeRedText : colors.textSecondary }]}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const { colors, isDark } = useTheme();

  const handleCall911 = () => {
    Linking.openURL('tel:911');
  };

  return (
    <View {...props} style={styles.bottomNavWrapper}>
      <View style={[
        styles.bottomNavContainer, 
        { 
          backgroundColor: isDark ? 'rgba(17, 21, 26, 0.88)' : 'rgba(255, 255, 255, 0.92)', 
          borderColor: colors.glassBorder,
        },
        Shadows.md
      ]}>
        {/* Navigation triggers */}
        <View style={styles.triggersRow}>
          {props.children}
        </View>

        {/* Quick Emergency 911 Dial Pill */}
        <Pressable 
          style={({ pressed }) => [
            styles.quickCallPill, 
            { backgroundColor: colors.accentRed },
            pressed && styles.pressed
          ]} 
          onPress={handleCall911}
          accessibilityLabel="Call 911 Hotline"
        >
          <PhoneIcon size={13} color="#FFF" />
          <ThemedText style={styles.quickCallText}>911</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNavWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    paddingTop: 4,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  bottomNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 540,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      } as any,
    }),
  },
  triggersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'space-around',
  },
  tabButtonPressable: {
    flex: 1,
  },
  tabButtonView: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  quickCallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    marginLeft: 6,
  },
  quickCallText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
});
