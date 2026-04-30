import { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const ONBOARDING_KEY = 'onboarding_completed';
const WHATS_NEW_VERSION_KEY = 'whats_new_seen_version';
const CURRENT_APP_VERSION = '1.5.0';
const _BUILD_TIMESTAMP = '20260329';

export default function WelcomeScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const completed = await AsyncStorage.getItem(ONBOARDING_KEY);
        const seenVersion = await AsyncStorage.getItem(WHATS_NEW_VERSION_KEY);

        let destination: string;
        let destinationParams: Record<string, string> | undefined;
        if (completed !== 'true') {
          destination = '/onboarding';
        } else if (seenVersion !== CURRENT_APP_VERSION) {
          destination = '/whats-new';
        } else {
          destination = '/(tabs)/track';
        }

        if (completed === 'true' && Platform.OS !== 'web') {
          try {
            const lastResponse = await Notifications.getLastNotificationResponseAsync();
            if (lastResponse) {
              const data = lastResponse.notification.request.content.data as Record<string, unknown> | undefined;
              const receivedAt = lastResponse.notification.date;
              const isRecent = receivedAt && (Date.now() - receivedAt * 1000) < 60000;
              if (isRecent && data?.type === 'new_follower' && data?.fromUserId) {
                destination = '/user-profile';
                destinationParams = { userId: data.fromUserId as string };
                console.log('[WELCOME] Cold start new_follower notification, redirecting to user profile:', data.fromUserId);
              } else if (isRecent && data?.type === 'post_rev') {
                destination = '/(tabs)/feed';
                console.log('[WELCOME] Cold start post_rev notification, redirecting to feed');
              } else if (isRecent && data?.type === 'leaderboard_beat') {
                destination = '/(tabs)/leaderboard';
                console.log('[WELCOME] Cold start leaderboard_beat notification, redirecting to leaderboard');
              } else if (isRecent && (data?.type === 'drive_ping' || data?.type === 'ping_accepted' || data?.type === 'ping_declined' || data?.type === 'location_shared' || data?.type === 'meetup_cancelled')) {
                destination = '/(tabs)/leaderboard';
                console.log('[WELCOME] Cold start drive notification, redirecting to leaderboard');
              }
            }
          } catch (err) {
            console.log('[WELCOME] Error checking initial notification:', err);
          }
        }

        console.log('[WELCOME] Routing to:', destination, '| onboarding:', completed, '| seenVersion:', seenVersion);

        const delay = destination.startsWith('/user-profile') || destination.startsWith('/(tabs)/feed') || destination.startsWith('/(tabs)/leaderboard') ? 1200 : 4000;

        const timer = setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => {
            if (destinationParams) {
              router.replace({ pathname: destination as any, params: destinationParams });
            } else {
              router.replace(destination as any);
            }
          });
        }, delay);

        return () => clearTimeout(timer);
      } catch (e) {
        console.warn('[WELCOME] Error checking onboarding:', e);
        const timer = setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => {
            router.replace('/onboarding' as any);
          });
        }, 4000);
        return () => clearTimeout(timer);
      }
    };

    void checkOnboarding();
  }, [fadeAnim, router]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image
        source={{ uri: 'https://r2-pub.rork.com/attachments/1c5o0h0k30qvgy75ubrhz' }}
        style={styles.animation}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  animation: {
    width: 280,
    height: 280,
  },
});
