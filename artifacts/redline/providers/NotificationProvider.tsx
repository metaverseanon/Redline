import createContextHook from '@nkzw/create-context-hook';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trpcClient } from '@/lib/trpc';
import { router } from 'expo-router';

const PUSH_TOKEN_KEY = 'push_notification_token';
const NOTIFICATIONS_ENABLED_KEY = 'push_notifications_enabled';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function getExpoPushToken(): Promise<string> {
  console.log('[PUSH] Getting Expo push token...');
  
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  console.log('[PUSH] Current permission status:', existingStatus);
  
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    console.log('[PUSH] Requesting permission...');
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    console.log('[PUSH] Permission result:', status);
  }
  
  if (finalStatus !== 'granted') {
    throw new Error('Push notification permission not granted');
  }
  
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  console.log('[PUSH] EAS Project ID:', projectId);
  console.log('[PUSH] App ownership:', Constants.appOwnership);
  
  if (!projectId) {
    throw new Error('No EAS project ID configured for push notifications. Make sure you have built the app with EAS.');
  }
  
  console.log('[PUSH] Getting token with projectId:', projectId);
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: projectId,
  });
  
  console.log('[PUSH] Token obtained:', tokenData.data);
  return tokenData.data;
}

async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;
  
  console.log('[PUSH] Setting up Android notification channels...');
  
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#CC0000',
  });
  
  await Notifications.setNotificationChannelAsync('weekly-recap', {
    name: 'Weekly Recap',
    description: 'Weekly driving statistics',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#CC0000',
  });
  
  console.log('[PUSH] Android channels configured');
}

export type NotificationAction = {
  type: 'open_meetups';
  meetupId?: string;
  fromUserName?: string;
} | null;

export const [NotificationProvider, useNotifications] = createContextHook(() => {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<NotificationAction>(null);
  
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setIsLoading(false);
      return;
    }

    const loadStoredState = async () => {
      try {
        const [storedToken, storedEnabled] = await Promise.all([
          AsyncStorage.getItem(PUSH_TOKEN_KEY),
          AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY),
        ]);
        
        console.log('[PUSH] Loaded stored token:', storedToken ? 'exists' : 'none');
        console.log('[PUSH] Loaded stored enabled:', storedEnabled);
        
        if (storedToken) {
          setPushToken(storedToken);
        }
        setNotificationsEnabled(storedEnabled === 'true');
      } catch (error) {
        console.error('[PUSH] Error loading stored state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const checkPermission = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        setPermissionStatus(status);
        console.log('[PUSH] Permission status on mount:', status);
      } catch (error) {
        console.error('[PUSH] Error checking permission:', error);
      }
    };

    void loadStoredState();
    void checkPermission();
    void setupAndroidChannels();

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('[PUSH] Notification received in foreground:', notification.request.content.title);
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      
      if (data?.type === 'drive_ping') {
        const fromName = (data.fromUserName as string) || 'Someone';
        Alert.alert(
          '🚗 Drive Invite!',
          `${fromName} wants to go for a drive with you!`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'View',
              onPress: () => {
                console.log('[PUSH] User tapped View on foreground drive ping');
                setPendingAction({
                  type: 'open_meetups' as const,
                  meetupId: data.meetupId as string,
                  fromUserName: fromName,
                });
                router.navigate('/(tabs)/leaderboard' as any);
              },
            },
          ]
        );
      } else if (data?.type === 'ping_accepted') {
        const fromName = (data.fromUserName as string) || 'Someone';
        Alert.alert(
          '✅ Drive Accepted!',
          `${fromName} accepted your drive invite! Open meetups to share locations.`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'View',
              onPress: () => {
                setPendingAction({
                  type: 'open_meetups' as const,
                  meetupId: data.meetupId as string,
                  fromUserName: undefined,
                });
                router.navigate('/(tabs)/leaderboard' as any);
              },
            },
          ]
        );
      } else if (data?.type === 'location_shared') {
        const fromName = (data.fromUserName as string) || 'Someone';
        Alert.alert(
          '📍 Location Shared!',
          `${fromName} shared their location. Open meetups to navigate.`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'View',
              onPress: () => {
                setPendingAction({
                  type: 'open_meetups' as const,
                  meetupId: data.meetupId as string,
                  fromUserName: undefined,
                });
                router.navigate('/(tabs)/leaderboard' as any);
              },
            },
          ]
        );
      } else if (data?.type === 'leaderboard_beat') {
        Alert.alert(
          '🏁 You\'ve been overtaken!',
          notification.request.content.body || 'Someone just beat your top speed on the leaderboard!',
          [
            { text: 'Dismiss', style: 'cancel' },
            {
              text: 'View Leaderboard',
              onPress: () => {
                router.navigate('/(tabs)/leaderboard' as any);
              },
            },
          ]
        );
      } else if (data?.type === 'post_rev') {
        const fromName = (data.fromUserName as string) || 'Someone';
        Alert.alert(
          '🏎️ New Rev!',
          notification.request.content.body || `${fromName} revved your post!`,
          [
            { text: 'Dismiss', style: 'cancel' },
            {
              text: 'View',
              onPress: () => {
                router.navigate('/(tabs)/feed' as any);
              },
            },
          ]
        );
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('[PUSH] Notification tapped:', response.notification.request.content.title);
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      
      if (data?.type === 'new_follower' && data?.fromUserId) {
        console.log('[PUSH] New follower notification tapped, navigating to user profile:', data.fromUserId);
        const userId = data.fromUserId as string;
        const tryNav = (attempt: number) => {
          console.log('[PUSH] new_follower nav attempt', attempt, 'userId:', userId);
          try {
            router.push({ pathname: '/user-profile' as any, params: { userId } });
            console.log('[PUSH] new_follower nav succeeded on attempt', attempt);
          } catch (e) {
            console.log('[PUSH] new_follower nav failed:', e);
            if (attempt < 10) setTimeout(() => tryNav(attempt + 1), 600);
          }
        };
        setTimeout(() => tryNav(1), 800);
      } else if (data?.type === 'post_rev') {
        console.log('[PUSH] Post rev notification tapped, navigating to feed');
        const tryNav = (attempt: number) => {
          try {
            router.navigate('/(tabs)/feed' as any);
          } catch {
            if (attempt < 5) setTimeout(() => tryNav(attempt + 1), 500);
          }
        };
        setTimeout(() => tryNav(1), 300);
      } else if (data?.type === 'leaderboard_beat') {
        console.log('[PUSH] Leaderboard beat notification tapped');
        const tryNav = (attempt: number) => {
          try {
            router.navigate('/(tabs)/leaderboard' as any);
          } catch {
            if (attempt < 5) setTimeout(() => tryNav(attempt + 1), 500);
          }
        };
        setTimeout(() => tryNav(1), 300);
      } else if (data?.type === 'drive_ping' || data?.type === 'ping_accepted' || data?.type === 'ping_declined' || data?.type === 'location_shared' || data?.type === 'meetup_cancelled') {
        console.log('[PUSH] Drive-related notification tapped, type:', data.type, 'meetupId:', data.meetupId);
        const action: NotificationAction = {
          type: 'open_meetups' as const,
          meetupId: data.meetupId as string,
          fromUserName: data.fromUserName as string | undefined,
        };
        const tryNavigate = (attempt: number) => {
          console.log('[PUSH] Navigate attempt', attempt);
          try {
            router.navigate('/(tabs)/leaderboard' as any);
            console.log('[PUSH] Navigate succeeded on attempt', attempt);
            setTimeout(() => {
              console.log('[PUSH] Setting pending action after navigate, attempt:', attempt);
              setPendingAction(action);
            }, 500);
          } catch (e) {
            console.log('[PUSH] Navigate failed, retrying...', e);
            if (attempt < 8) {
              setTimeout(() => tryNavigate(attempt + 1), 500);
            }
          }
        };
        setTimeout(() => tryNavigate(1), 300);
      }
    });

    const checkInitialNotification = async () => {
      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse) {
          const data = lastResponse.notification.request.content.data as Record<string, unknown> | undefined;
          const receivedAt = lastResponse.notification.date;
          const isRecent = receivedAt && (Date.now() - receivedAt * 1000) < 30000;
          
          if (isRecent && data?.type === 'new_follower' && data?.fromUserId) {
            console.log('[PUSH] Cold start new follower notification, navigating to user profile:', data.fromUserId);
            const userId = data.fromUserId as string;
            const tryNavigate = (attempt: number) => {
              console.log('[PUSH] Cold start new_follower nav attempt', attempt, 'userId:', userId);
              try {
                router.push({ pathname: '/user-profile' as any, params: { userId } });
                console.log('[PUSH] Cold start new_follower nav succeeded on attempt', attempt);
              } catch (e) {
                console.log('[PUSH] Cold start new_follower nav failed:', e);
                if (attempt < 15) setTimeout(() => tryNavigate(attempt + 1), 600);
              }
            };
            setTimeout(() => tryNavigate(1), 2000);
          } else if (isRecent && data?.type === 'post_rev') {
            console.log('[PUSH] Cold start post rev notification, navigating to feed');
            const tryNavigate = (attempt: number) => {
              try {
                router.navigate('/(tabs)/feed' as any);
              } catch (e) {
                if (attempt < 10) setTimeout(() => tryNavigate(attempt + 1), 600);
              }
            };
            setTimeout(() => tryNavigate(1), 1500);
          } else if (isRecent && (data?.type === 'drive_ping' || data?.type === 'ping_accepted' || data?.type === 'ping_declined' || data?.type === 'location_shared' || data?.type === 'meetup_cancelled')) {
            console.log('[PUSH] Cold start notification detected:', data.type, 'meetupId:', data.meetupId);
            const action: NotificationAction = {
              type: 'open_meetups' as const,
              meetupId: data.meetupId as string,
              fromUserName: data.fromUserName as string | undefined,
            };
            const tryNavigate = (attempt: number) => {
              console.log('[PUSH] Cold start navigate attempt', attempt);
              try {
                router.navigate('/(tabs)/leaderboard' as any);
                console.log('[PUSH] Cold start navigate succeeded on attempt', attempt);
                setTimeout(() => {
                  console.log('[PUSH] Cold start setting pending action after navigate');
                  setPendingAction(action);
                }, 600);
              } catch (e) {
                console.log('[PUSH] Cold start navigate failed, retrying...', e);
                if (attempt < 10) {
                  setTimeout(() => tryNavigate(attempt + 1), 600);
                }
              }
            };
            setTimeout(() => tryNavigate(1), 1500);
          }
        }
      } catch (e) {
        console.log('[PUSH] Error checking initial notification:', e);
      }
    };

    setTimeout(() => checkInitialNotification(), 1000);

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  const syncPushTokenToBackend = useCallback(async (userId: string, token?: string | null): Promise<boolean> => {
    const tokenToSync = token || pushToken;
    if (!tokenToSync) {
      console.log('[PUSH] No token to sync');
      return false;
    }
    
    try {
      console.log('[PUSH] Syncing existing token to backend for user:', userId);
      await trpcClient.user.updatePushToken.mutate({ userId, pushToken: tokenToSync });
      console.log('[PUSH] Token synced to backend successfully');
      return true;
    } catch (error) {
      console.error('[PUSH] Failed to sync token to backend:', error);
      return false;
    }
  }, [pushToken]);

  const registerForPushNotifications = useCallback(async (userId?: string): Promise<string | null> => {
    console.log('[PUSH] registerForPushNotifications called');
    
    if (Platform.OS === 'web') {
      console.log('[PUSH] Web platform - not supported');
      throw new Error('Push notifications are not supported on web');
    }

    try {
      const token = await getExpoPushToken();
      
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
      await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'true');
      
      setPushToken(token);
      setNotificationsEnabled(true);
      
      if (userId) {
        await syncPushTokenToBackend(userId, token);
      }
      
      console.log('[PUSH] Registration complete');
      return token;
    } catch (error: any) {
      console.error('[PUSH] Registration failed:', error);
      throw error;
    }
  }, [syncPushTokenToBackend]);

  const disableNotifications = useCallback(async (userId?: string) => {
    console.log('[PUSH] disableNotifications called');
    
    try {
      await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'false');
      await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
      
      setNotificationsEnabled(false);
      
      if (userId && pushToken) {
        try {
          console.log('[PUSH] Removing token from backend');
          await trpcClient.user.updatePushToken.mutate({ userId, pushToken: null });
        } catch (error) {
          console.error('[PUSH] Failed to remove token from backend:', error);
        }
      }
      
      setPushToken(null);
      console.log('[PUSH] Notifications disabled');
    } catch (error) {
      console.error('[PUSH] Error disabling notifications:', error);
    }
  }, [pushToken]);

  const scheduleLocalNotification = useCallback(async (
    title: string,
    body: string,
    data?: Record<string, unknown>,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return null;
    }

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: true,
        },
        trigger: trigger || null,
      });
      console.log('[PUSH] Local notification scheduled:', id);
      return id;
    } catch (error) {
      console.error('[PUSH] Failed to schedule notification:', error);
      return null;
    }
  }, []);

  const cancelAllNotifications = useCallback(async () => {
    if (Platform.OS === 'web') return;
    
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('[PUSH] All notifications cancelled');
    } catch (error) {
      console.error('[PUSH] Failed to cancel notifications:', error);
    }
  }, []);

  const clearPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  return useMemo(() => ({
    pushToken,
    notificationsEnabled,
    isLoading,
    permissionStatus,
    pendingAction,
    clearPendingAction,
    registerForPushNotifications,
    disableNotifications,
    scheduleLocalNotification,
    cancelAllNotifications,
    syncPushTokenToBackend,
  }), [pushToken, notificationsEnabled, isLoading, permissionStatus, pendingAction, clearPendingAction, registerForPushNotifications, disableNotifications, scheduleLocalNotification, cancelAllNotifications, syncPushTokenToBackend]);
});
