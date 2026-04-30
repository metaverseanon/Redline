import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState, Component, ErrorInfo, ReactNode } from "react";
import { StyleSheet, Platform, View, Text, TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TripProvider, useTrips } from "@/providers/TripProvider";
import { DailyMissionProvider } from "@/providers/DailyMissionProvider";
import { useAchievements } from "@/providers/AchievementProvider";
import { AnalyticsProvider, useAnalytics } from "@/providers/AnalyticsProvider";
import { AchievementProvider } from "@/providers/AchievementProvider";
import { SettingsProvider } from "@/providers/SettingsProvider";
import { UserProvider, useUser } from "@/providers/UserProvider";
import { NotificationProvider, useNotifications } from "@/providers/NotificationProvider";
import StreakPopup from "@/components/StreakPopup";
import { trpc, trpcClient } from "@/lib/trpc";
import * as Location from 'expo-location';
import {
  useFonts,
  Orbitron_400Regular,
  Orbitron_500Medium,
  Orbitron_600SemiBold,
  Orbitron_700Bold,
  Orbitron_800ExtraBold,
  Orbitron_900Black,
} from "@expo-google-fonts/orbitron";
import AsyncStorage from "@react-native-async-storage/async-storage";
SplashScreen.preventAutoHideAsync().catch(() => {});

if (Platform.OS !== 'web') {
  try {
    const appsFlyer = require('react-native-appsflyer').default;
    appsFlyer.initSdk(
      {
        devKey: 'FPDaeC6wQQ2zNXbRLgberm',
        isDebug: false,
        appId: '6758342404',
        onInstallConversionDataListener: true,
        onDeepLinkListener: true,
        timeToWaitForATTUserAuthorization: 10,
      },
      (result: Record<string, unknown>) => {
        console.log('[APPSFLYER] Init success:', result);
      },
      (error: Record<string, unknown>) => {
        console.error('[APPSFLYER] Init error:', error);
      }
    );
  } catch (e) {
    console.warn('[APPSFLYER] Native module not available (expected in Expo Go):', e);
  }
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
  }

  handleReset = async () => {
    try {
      await AsyncStorage.removeItem('tracking_state');
      await AsyncStorage.removeItem('current_trip');
      await AsyncStorage.removeItem('current_speed');
      await AsyncStorage.removeItem('last_location_time');
    } catch (e) {
      console.warn('Failed to clear corrupted state:', e);
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <TouchableOpacity style={errorStyles.button} onPress={this.handleReset}>
            <Text style={errorStyles.buttonText}>Restart App</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#CC0000',
    marginBottom: 16,
  },
  message: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center' as const,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#CC0000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});

// Suppress TronLink wallet extension errors (browser extension interference)
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const shouldSuppressError = (message: string) => {
    const lowerMessage = message.toLowerCase();
    return (
      lowerMessage.includes('tronlinkparams') ||
      lowerMessage.includes('tronlink') ||
      lowerMessage.includes('trap returned falsish') ||
      (lowerMessage.includes('proxy') && lowerMessage.includes('trap'))
    );
  };

  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const errorMessage = String(args[0] || '');
    if (shouldSuppressError(errorMessage)) {
      return;
    }
    originalConsoleError.apply(console, args);
  };

  const originalConsoleWarn = console.warn;
  console.warn = (...args: any[]) => {
    const warnMessage = String(args[0] || '');
    if (shouldSuppressError(warnMessage)) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  };

  window.addEventListener('error', (event) => {
    if (shouldSuppressError(event.message || '')) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = String(event.reason || '');
    if (shouldSuppressError(reason)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  // Clean up any TronLink injected properties
  try {
    if ('tronlinkParams' in window) {
      delete (window as any).tronlinkParams;
    }
  } catch {
    // Ignore deletion errors
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      staleTime: 30000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

function AnalyticsSync() {
  const { user } = useUser();
  const { identify, track } = useAnalytics();
  const trackedRef = React.useRef(false);

  useEffect(() => {
    if (!trackedRef.current) {
      trackedRef.current = true;
      track('app_opened');
    }
  }, [track]);

  useEffect(() => {
    if (user?.id) {
      identify(user.id);
      track('user_signed_in', { userId: user.id });
    }
  }, [user?.id, identify, track]);

  return null;
}

function PushTokenSync() {
  const { user } = useUser();
  const { pushToken, notificationsEnabled, syncPushTokenToBackend } = useNotifications();
  const syncedRef = React.useRef(false);

  useEffect(() => {
    if (user?.id && pushToken && notificationsEnabled && !syncedRef.current) {
      console.log('[PUSH_SYNC] User logged in with existing push token, syncing to backend...');
      syncedRef.current = true;
      void syncPushTokenToBackend(user.id).then((success) => {
        if (success) {
          console.log('[PUSH_SYNC] Push token synced successfully on app start');
        }
      });
    }
    
    if (!user?.id) {
      syncedRef.current = false;
    }
  }, [user?.id, pushToken, notificationsEnabled, syncPushTokenToBackend]);

  return null;
}

function AchievementSync() {
  const { lastSavedTrip, trips } = useTrips();
  const { checkTripAchievements } = useAchievements();
  const { user } = useUser();
  const lastCheckedTripIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!lastSavedTrip) return;
    if (lastCheckedTripIdRef.current === lastSavedTrip.id) return;
    lastCheckedTripIdRef.current = lastSavedTrip.id;

    console.log('[ACHIEVEMENT_SYNC] New trip completed, checking achievements for trip:', lastSavedTrip.id);
    checkTripAchievements(lastSavedTrip, trips, user?.id).then((unlocked) => {
      if (unlocked.length > 0) {
        console.log('[ACHIEVEMENT_SYNC] Unlocked achievements:', unlocked);
      } else {
        console.log('[ACHIEVEMENT_SYNC] No new achievements unlocked');
      }
    }).catch((err) => {
      console.error('[ACHIEVEMENT_SYNC] Failed to check achievements:', err);
    });
  }, [lastSavedTrip, trips, user?.id, checkTripAchievements]);

  return null;
}

function LocationSync() {
  const { user } = useUser();
  const syncedRef = React.useRef(false);

  useEffect(() => {
    if (!user?.id) {
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) return;
    syncedRef.current = true;

    const updateLocation = async () => {
      try {
        if (Platform.OS === 'web') {
          if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              async (position) => {
                const { latitude, longitude } = position.coords;
                console.log('[LOCATION_SYNC] Web location:', latitude, longitude);
                try {
                  await trpcClient.user.updateUserLocation.mutate({
                    userId: user.id,
                    latitude,
                    longitude,
                  });
                  console.log('[LOCATION_SYNC] Location synced to backend');
                } catch (e) {
                  console.warn('[LOCATION_SYNC] Failed to sync location:', e);
                }
              },
              (err) => {
                console.warn('[LOCATION_SYNC] Web geolocation error:', err.message);
              },
              { timeout: 10000, maximumAge: 60000 }
            );
          }
          return;
        }

        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('[LOCATION_SYNC] Location permission not granted, skipping');
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const { latitude, longitude } = location.coords;
        console.log('[LOCATION_SYNC] Got location:', latitude, longitude);

        await trpcClient.user.updateUserLocation.mutate({
          userId: user.id,
          latitude,
          longitude,
        });
        console.log('[LOCATION_SYNC] Location synced to backend');
      } catch (error) {
        console.warn('[LOCATION_SYNC] Failed to update location:', error);
      }
    };

    void updateLocation();
  }, [user?.id]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back", contentStyle: { backgroundColor: '#000000' } }}>
      <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="profile" options={{ presentation: "card" }} />
      <Stack.Screen name="user-profile" options={{ presentation: "card" }} />
      <Stack.Screen name="achievements" options={{ presentation: "card" }} />
      <Stack.Screen name="create-post" options={{ presentation: "modal" }} />
      <Stack.Screen name="notifications" options={{ presentation: "card" }} />
      <Stack.Screen name="my-posts" options={{ presentation: "card" }} />
      <Stack.Screen name="whats-new" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="challenge-complete" options={{ presentation: "modal", headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});

const FONT_LOAD_TIMEOUT = 10000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Orbitron_400Regular,
    Orbitron_500Medium,
    Orbitron_600SemiBold,
    Orbitron_700Bold,
    Orbitron_800ExtraBold,
    Orbitron_900Black,
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('Font loading timed out, proceeding anyway');
      setTimedOut(true);
    }, FONT_LOAD_TIMEOUT);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fontError) {
      console.warn('Font loading error:', fontError);
    }
    if (fontsLoaded) {
      console.log('Orbitron fonts loaded successfully');
    }
    if (fontsLoaded || fontError || timedOut) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, timedOut]);

  if (!fontsLoaded && !fontError && !timedOut) {
    return null;
  }

  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <SettingsProvider>
            <UserProvider>
              <AnalyticsProvider>
              <NotificationProvider>
                <AnalyticsSync />
                <PushTokenSync />
                <LocationSync />
                <AchievementProvider>
                <TripProvider>
                  <DailyMissionProvider>
                  <AchievementSync />
                  <SafeAreaProvider>
                    <GestureHandlerRootView style={styles.container}>
                      <RootLayoutNav />
                      <StreakPopup />
                    </GestureHandlerRootView>
                  </SafeAreaProvider>
                  </DailyMissionProvider>
                </TripProvider>
                </AchievementProvider>
              </NotificationProvider>
              </AnalyticsProvider>
            </UserProvider>
          </SettingsProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}
