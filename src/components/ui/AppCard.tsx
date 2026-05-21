import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

type AppCardVariant = 'surface' | 'dark' | 'soft';

interface AppCardProps {
  children: React.ReactNode;
  variant?: AppCardVariant;
  style?: StyleProp<ViewStyle>;
}

export const AppCard: React.FC<AppCardProps> = ({ children, variant = 'surface', style }) => {
  return <View style={[styles.base, styles[variant], style]}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    padding: spacing.md,
    shadowColor: '#10243d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  surface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dark: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: '#2b425d',
  },
  soft: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
