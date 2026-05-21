import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import { AppCard } from './AppCard';

interface SectionShellProps {
  title: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const SectionShell: React.FC<SectionShellProps> = ({ title, children, style }) => {
  return (
    <AppCard style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      <View>{children}</View>
    </AppCard>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
});
