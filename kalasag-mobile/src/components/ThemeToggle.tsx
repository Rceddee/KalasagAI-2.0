import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { ThemedText } from '@/components/themed-text';
import { SunIcon, MoonIcon } from '@/components/Icons';

interface ThemeToggleProps {
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { isDark, toggleTheme, colors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.toggleBtn,
        {
          backgroundColor: colors.glassBgHover,
          borderColor: colors.glassBorder,
        },
      ]}
      onPress={toggleTheme}
      activeOpacity={0.7}
      accessibilityLabel={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
    >
      {isDark ? (
        <SunIcon size={13} color={colors.accentYellow} />
      ) : (
        <MoonIcon size={13} color={colors.accentBlue} />
      )}
      {!compact && (
        <ThemedText style={[styles.text, { color: colors.textSecondary }]}>
          {isDark ? 'Light' : 'Dark'}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
