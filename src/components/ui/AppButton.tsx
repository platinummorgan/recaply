import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';

type AppButtonVariant = 'primary' | 'dark' | 'warning' | 'danger' | 'info';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const AppButton: React.FC<AppButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const isDisabled = disabled || loading;
  const textColor = variant === 'info' ? colors.accentInfoText : colors.surface;

  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  dark: {
    backgroundColor: colors.surfaceDark,
  },
  warning: {
    backgroundColor: colors.warning,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  info: {
    backgroundColor: colors.accentInfoSoft,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: typography.heading,
  },
  disabled: {
    opacity: 0.6,
  },
});
