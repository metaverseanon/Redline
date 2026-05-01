export type ThemeType = 'light' | 'dark' | 'carbon' | 'neon' | 'trackday';

export interface ThemeColors {
  background: string;
  cardBackground: string;
  cardLight: string;
  text: string;
  textLight: string;
  textInverted: string;
  primary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  border: string;
  tabBarBackground: string;
  tabBarInactive: string;
  tabBarActive: string;
  logo: string;
}

export const LOGOS = {
  light: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/ff02ss0junnzhsmxc7y5t',
  dark: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/88i29a3ot5yzdi1xhkc39',
  splash: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/qemybdck5v2ljrs9z5m28',
};

export const lightTheme: ThemeColors = {
  background: '#F5F5F7',
  cardBackground: '#1C1C1E',
  cardLight: '#FFFFFF',
  text: '#1C1C1E',
  textLight: '#8E8E93',
  textInverted: '#FFFFFF',
  primary: '#1C1C1E',
  accent: '#CC0000',
  success: '#34C759',
  warning: '#FF9500',
  danger: '#FF3B30',
  border: '#E5E5EA',
  tabBarBackground: '#FFFFFF',
  tabBarInactive: '#8E8E93',
  tabBarActive: '#1C1C1E',
  logo: LOGOS.light,
};

export const darkTheme: ThemeColors = {
  background: '#000000',
  cardBackground: '#1C1C1E',
  cardLight: '#2C2C2E',
  text: '#FFFFFF',
  textLight: '#8E8E93',
  textInverted: '#000000',
  primary: '#FFFFFF',
  accent: '#CC0000',
  success: '#30D158',
  warning: '#FF9F0A',
  danger: '#FF453A',
  border: '#38383A',
  tabBarBackground: '#1C1C1E',
  tabBarInactive: '#8E8E93',
  tabBarActive: '#FFFFFF',
  logo: LOGOS.dark,
};

export const carbonTheme: ThemeColors = {
  background: '#0A0A0B',
  cardBackground: '#16171A',
  cardLight: '#1F2024',
  text: '#F0F0F2',
  textLight: '#7A7C82',
  textInverted: '#0A0A0B',
  primary: '#E8E8EA',
  accent: '#D4AF37',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F43F5E',
  border: '#2A2C32',
  tabBarBackground: '#101114',
  tabBarInactive: '#5A5C62',
  tabBarActive: '#D4AF37',
  logo: LOGOS.dark,
};

export const neonTheme: ThemeColors = {
  background: '#0B0014',
  cardBackground: '#15001F',
  cardLight: '#1F002B',
  text: '#F5F0FF',
  textLight: '#9B7BC9',
  textInverted: '#0B0014',
  primary: '#FF2EC8',
  accent: '#00F0FF',
  success: '#39FF14',
  warning: '#FFD400',
  danger: '#FF2E5F',
  border: '#3A1A52',
  tabBarBackground: '#100018',
  tabBarInactive: '#6B4F8F',
  tabBarActive: '#FF2EC8',
  logo: LOGOS.dark,
};

export const trackdayTheme: ThemeColors = {
  background: '#0F0F0F',
  cardBackground: '#1A1A1A',
  cardLight: '#222222',
  text: '#FFFFFF',
  textLight: '#9A9A9A',
  textInverted: '#0F0F0F',
  primary: '#FF4500',
  accent: '#FFD700',
  success: '#00C853',
  warning: '#FFA000',
  danger: '#FF1744',
  border: '#333333',
  tabBarBackground: '#181818',
  tabBarInactive: '#7A7A7A',
  tabBarActive: '#FF4500',
  logo: LOGOS.dark,
};

export const PRO_THEMES: readonly ThemeType[] = ['carbon', 'neon', 'trackday'] as const;

export const isProTheme = (theme: ThemeType): boolean => {
  return (PRO_THEMES as readonly ThemeType[]).includes(theme);
};

export const getThemeColors = (theme: ThemeType): ThemeColors => {
  switch (theme) {
    case 'light': return lightTheme;
    case 'dark': return darkTheme;
    case 'carbon': return carbonTheme;
    case 'neon': return neonTheme;
    case 'trackday': return trackdayTheme;
    default: return darkTheme;
  }
};

export default lightTheme;
