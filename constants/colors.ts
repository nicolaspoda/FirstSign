export const Colors = {
  primary: '#1D9E75',
  primaryLight: '#E8F7F2',
  primaryDark: '#157A5A',
  primaryMuted: '#A8DEC9',

  background: '#F8FAFB',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F4F6',

  text: '#1A1A2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  info: '#3B82F6',

  // Burnout severity colors
  severityNone: '#10B981',
  severityMild: '#F59E0B',
  severityModerate: '#F97316',
  severitySevere: '#EF4444',
} as const;

export type ColorKey = keyof typeof Colors;
