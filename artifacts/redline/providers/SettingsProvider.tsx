import createContextHook from '@nkzw/create-context-hook';
import { useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeType, ThemeColors, getThemeColors } from '@/constants/colors';
import { trpcClient } from '@/lib/trpc';

export type SpeedUnit = 'kmh' | 'mph';
export type DistanceUnit = 'km' | 'mi';

export interface ShareCardFields {
  distance: boolean;
  duration: boolean;
  corners: boolean;
  avgSpeed: boolean;
  acceleration: boolean;
  topSpeed: boolean;
  ranking: boolean;
  routeMap: boolean;
  speedCameras: boolean;
}

export type ShareCardPage = 'stats' | 'route';

interface Settings {
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
  theme: ThemeType;
  shareCardFields: ShareCardFields;
  shareCardPages: Record<ShareCardPage, boolean>;
}

const SETTINGS_KEY = 'app_settings';

const DEFAULT_SHARE_CARD_FIELDS: ShareCardFields = {
  distance: true,
  duration: true,
  corners: true,
  avgSpeed: true,
  acceleration: true,
  topSpeed: true,
  ranking: true,
  routeMap: true,
  speedCameras: true,
};

const DEFAULT_SHARE_CARD_PAGES: Record<ShareCardPage, boolean> = {
  stats: true,
  route: true,
};

const DEFAULT_SETTINGS: Settings = {
  speedUnit: 'kmh',
  distanceUnit: 'km',
  theme: 'dark',
  shareCardFields: DEFAULT_SHARE_CARD_FIELDS,
  shareCardPages: DEFAULT_SHARE_CARD_PAGES,
};

export const [SettingsProvider, useSettings] = createContextHook(() => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const syncUnitsToBackend = useCallback(async (speedUnit: SpeedUnit, distanceUnit: DistanceUnit) => {
    try {
      const storedUser = await AsyncStorage.getItem('user_profile');
      if (!storedUser) return;
      const userData = JSON.parse(storedUser);
      if (!userData.id) return;
      console.log('[SETTINGS] Syncing unit preferences to backend:', speedUnit, distanceUnit);
      await trpcClient.user.updateUnitPreferences.mutate({
        userId: userData.id,
        speedUnit,
        distanceUnit,
      });
      console.log('[SETTINGS] Unit preferences synced successfully');
    } catch (error) {
      console.error('[SETTINGS] Failed to sync unit preferences:', error);
    }
  }, []);

  const setSpeedUnit = useCallback((unit: SpeedUnit) => {
    const newSettings = { ...settings, speedUnit: unit };
    void saveSettings(newSettings);
    void syncUnitsToBackend(unit, settings.distanceUnit);
  }, [settings, syncUnitsToBackend]);

  const setDistanceUnit = useCallback((unit: DistanceUnit) => {
    const newSettings = { ...settings, distanceUnit: unit };
    void saveSettings(newSettings);
    void syncUnitsToBackend(settings.speedUnit, unit);
  }, [settings, syncUnitsToBackend]);

  const setTheme = useCallback((theme: ThemeType) => {
    const newSettings = { ...settings, theme };
    void saveSettings(newSettings);
  }, [settings]);

  const setShareCardField = useCallback((field: keyof ShareCardFields, value: boolean) => {
    const newFields = { ...settings.shareCardFields, [field]: value };
    const newSettings = { ...settings, shareCardFields: newFields };
    void saveSettings(newSettings);
  }, [settings]);

  const setShareCardPage = useCallback((page: ShareCardPage, value: boolean) => {
    const otherPage = page === 'stats' ? 'route' : 'stats';
    if (!value && !settings.shareCardPages[otherPage]) return;
    const newPages = { ...settings.shareCardPages, [page]: value };
    const newSettings = { ...settings, shareCardPages: newPages };
    void saveSettings(newSettings);
  }, [settings]);

  const colors: ThemeColors = getThemeColors(settings.theme);

  const convertSpeed = useCallback((speedKmh: number): number => {
    if (settings.speedUnit === 'mph') {
      return speedKmh * 0.621371;
    }
    return speedKmh;
  }, [settings.speedUnit]);

  const convertDistance = useCallback((distanceKm: number): number => {
    if (settings.distanceUnit === 'mi') {
      return distanceKm * 0.621371;
    }
    return distanceKm;
  }, [settings.distanceUnit]);

  const getSpeedLabel = useCallback((): string => {
    return settings.speedUnit === 'mph' ? 'mph' : 'km/h';
  }, [settings.speedUnit]);

  const getDistanceLabel = useCallback((): string => {
    return settings.distanceUnit === 'mi' ? 'mi' : 'km';
  }, [settings.distanceUnit]);

  const getAccelerationLabel = useCallback((type: '0-100' | '0-200' | '100-200'): string => {
    if (settings.speedUnit === 'mph') {
      if (type === '0-100') return '0-60 mph';
      if (type === '0-200') return '0-130 mph';
      return '60-130 mph';
    }
    if (type === '0-100') return '0-100 km/h';
    if (type === '0-200') return '0-200 km/h';
    return '100-200 km/h';
  }, [settings.speedUnit]);

  const getAccelerationShortLabel = useCallback((type: '0-100' | '0-200' | '100-200'): string => {
    if (settings.speedUnit === 'mph') {
      if (type === '0-100') return '0-60';
      if (type === '0-200') return '0-130';
      return '60-130';
    }
    if (type === '0-100') return '0-100';
    if (type === '0-200') return '0-200';
    return '100-200';
  }, [settings.speedUnit]);

  return useMemo(() => ({
    settings,
    isLoading,
    colors,
    setSpeedUnit,
    setDistanceUnit,
    setTheme,
    setShareCardField,
    setShareCardPage,
    convertSpeed,
    convertDistance,
    getSpeedLabel,
    getDistanceLabel,
    getAccelerationLabel,
    getAccelerationShortLabel,
  }), [settings, isLoading, colors, setSpeedUnit, setDistanceUnit, setTheme, setShareCardField, setShareCardPage, convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel, getAccelerationLabel, getAccelerationShortLabel]);
});
