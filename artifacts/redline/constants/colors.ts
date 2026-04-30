export type ThemeType = 'light' | 'dark';

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

export const getThemeColors = (theme: ThemeType): ThemeColors => {
  return theme === 'dark' ? darkTheme : lightTheme;
};

export default lightTheme;
