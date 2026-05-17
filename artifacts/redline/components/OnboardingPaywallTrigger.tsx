import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@/providers/UserProvider';
import { useSubscription } from '@/lib/revenuecat';

const ONBOARDING_PAYWALL_CUTOFF_MS = Date.UTC(2026, 4, 9);
const STORAGE_KEY_PREFIX = 'onboarding_paywall_shown_v1';
const PRESENT_DELAY_MS = 1500;

export default function OnboardingPaywallTrigger() {
  const { user } = useUser();
  const { isSubscribed, presentPaywall, isAvailable } = useSubscription();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (triggeredRef.current) return;
    if (!user?.id) return;
    if (isSubscribed) return;
    if (!isAvailable) return;

    const createdAt = user.createdAt ?? 0;
    if (createdAt < ONBOARDING_PAYWALL_CUTOFF_MS) return;

    triggeredRef.current = true;
    const userId = user.id;

    void (async () => {
      try {
        const key = `${STORAGE_KEY_PREFIX}:${userId}`;
        const alreadyShown = await AsyncStorage.getItem(key);
        if (alreadyShown) {
          console.log('[ONBOARDING_PAYWALL] already shown for user', userId);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, PRESENT_DELAY_MS));

        console.log('[ONBOARDING_PAYWALL] presenting for new user', userId);
        await presentPaywall('onboarding');
        await AsyncStorage.setItem(key, String(Date.now()));
      } catch (err) {
        console.warn('[ONBOARDING_PAYWALL] failed:', err);
      }
    })();
  }, [user?.id, user?.createdAt, isSubscribed, isAvailable, presentPaywall]);

  return null;
}
