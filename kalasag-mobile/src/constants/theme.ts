import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Core backgrounds — clean high-contrast light mode
    text: '#0F172A',
    textSecondary: '#334155',
    textMuted: '#64748B',
    background: '#F0F3F7',           // dashboard --bg-primary
    backgroundElement: '#FFFFFF',     // dashboard --bg-secondary
    backgroundTertiary: '#E1E7F0',    // dashboard --bg-tertiary
    backgroundSelected: '#E2E8F0',
    cardBackground: '#FFFFFF',
    cardBorder: 'rgba(0, 0, 0, 0.14)',

    // Card & glass surfaces
    glassBg: '#FFFFFF',
    glassBgHover: 'rgba(0, 0, 0, 0.04)',
    glassBorder: 'rgba(0, 0, 0, 0.14)',
    glassBorderFocus: 'rgba(0, 0, 0, 0.30)',

    // Accent colors — exact match to dashboard
    accentRed: '#D32F2F',
    accentRedGlow: 'rgba(211, 47, 47, 0.12)',
    accentBlue: '#1976D2',
    accentBlueGlow: 'rgba(25, 118, 210, 0.12)',
    accentGreen: '#2E7D32',
    accentGreenGlow: 'rgba(46, 125, 50, 0.12)',
    accentOrange: '#E65100',
    accentOrangeGlow: 'rgba(230, 81, 0, 0.12)',
    accentYellow: '#F57F17',
    accentYellowGlow: 'rgba(245, 127, 23, 0.12)',

    // Chips & filters
    chipBg: '#F8FAFC',
    chipBorder: 'rgba(0, 0, 0, 0.14)',

    // Badge text colors
    badgeRedText: '#B42318',
    badgeOrangeText: '#C2410C',
    badgeYellowText: '#A16207',
    badgeBlueText: '#1D4ED8',
    badgeGreenText: '#15803D',
  },
  dark: {
    // Core backgrounds — high-contrast command center dark mode
    text: '#FFFFFF',
    textSecondary: '#A3B4CC',
    textMuted: '#7E8FA8',
    background: '#0A0D10',            // dashboard --bg-primary
    backgroundElement: '#11151A',     // dashboard --bg-secondary
    backgroundTertiary: '#1A2027',    // dashboard --bg-tertiary
    backgroundSelected: '#1A2027',
    cardBackground: '#11151A',
    cardBorder: 'rgba(255, 255, 255, 0.12)',

    // Card & glass surfaces
    glassBg: 'rgba(255, 255, 255, 0.05)',
    glassBgHover: 'rgba(255, 255, 255, 0.08)',
    glassBorder: 'rgba(255, 255, 255, 0.12)',
    glassBorderFocus: 'rgba(255, 255, 255, 0.25)',

    // Accent colors — high visibility
    accentRed: '#E53935',
    accentRedGlow: 'rgba(229, 57, 53, 0.22)',
    accentBlue: '#1E88E5',
    accentBlueGlow: 'rgba(30, 136, 229, 0.22)',
    accentGreen: '#43A047',
    accentGreenGlow: 'rgba(67, 160, 71, 0.22)',
    accentOrange: '#FB8C00',
    accentOrangeGlow: 'rgba(251, 140, 0, 0.22)',
    accentYellow: '#FDD835',
    accentYellowGlow: 'rgba(253, 216, 53, 0.22)',

    // Chips & filters
    chipBg: 'rgba(255, 255, 255, 0.06)',
    chipBorder: 'rgba(255, 255, 255, 0.12)',

    // Badge text colors (high contrast on dark surfaces)
    badgeRedText: '#FF8A80',
    badgeOrangeText: '#FFB74D',
    badgeYellowText: '#FFF176',
    badgeBlueText: '#90CAF9',
    badgeGreenText: '#A5D6A7',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'monospace',
  },
});

// Spacing scale
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Border radius — matching dashboard
export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,     // dashboard login-card
  full: 9999,
} as const;

// Shadows — matching dashboard shadow system
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 48,
    elevation: 10,
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 640;
export const FloatingNavClearance = 135;
