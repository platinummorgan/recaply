import { Platform } from 'react-native';

export const colors = {
  screenBg: '#eef2f7',
  surface: '#ffffff',
  surfaceMuted: '#f4f6fb',
  surfaceDark: '#0d1b2a',
  surfaceDarkElevated: '#1b2f45',
  border: '#d7deea',
  borderSoft: '#bcc8dc',
  borderMuted: '#e3e9f3',
  textPrimary: '#122235',
  textSecondary: '#55657c',
  textMuted: '#7d8ca2',
  textOnDark: '#f4f7fc',
  textOnDarkMuted: '#bdc9db',
  accent: '#0b5fff',
  accentStrong: '#0847cc',
  accentDark: '#0035a8',
  accentInfoSoft: '#e8f0ff',
  accentInfoBorder: '#bfd4ff',
  accentInfoText: '#1a3f8b',
  success: '#1f9d63',
  successDark: '#117347',
  warning: '#d98a12',
  warningSoft: '#fff6e4',
  warningText: '#8d5607',
  danger: '#d14242',
  dangerSoft: '#ffebeb',
  dangerBorder: '#f8c9c9',
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  pill: 999,
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

export const typography = {
  display: Platform.select({
    ios: 'AvenirNext-Bold',
    android: 'sans-serif-black',
    default: 'System',
  }),
  heading: Platform.select({
    ios: 'AvenirNext-DemiBold',
    android: 'sans-serif-medium',
    default: 'System',
  }),
  body: Platform.select({
    ios: 'AvenirNext-Regular',
    android: 'sans-serif',
    default: 'System',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
};
