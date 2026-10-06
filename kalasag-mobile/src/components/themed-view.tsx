import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const { colors, isDark } = useTheme();
  const bgColor = lightColor && !isDark ? lightColor : darkColor && isDark ? darkColor : colors[type ?? 'background'] || colors.background;

  return <View style={[{ backgroundColor: bgColor }, style]} {...otherProps} />;
}
