import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@/providers/UserProvider';
import { useSubscription } from '@/lib/revenuecat';

const ONBOARDING_PAYWALL_CUTOFF_MS = Date.UTC(2026, 4, 9);
const SHOWN_KEY_PREFIX = 'onboarding_paywall_shown_v1';
const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';
const PRESENT_DELAY_MS = 1500;

export default function OnboardingPaywallTrigger() {
  const { user } = useUser();
  const { isSubscribed, presentPaywall, isAvailable } = useSubscription();
  const triggeredForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!user?.id) return;
    if (isSubscribed) return;
    if (!isAvailable) return;

    const createdAt = user.createdAt ?? 0;
    if (createdAt < ONBOARDING_PAYWALL_CUTOFF_MS) return;

    const userId = user.id;
    if (triggeredForUserRef.current === userId) return;
    triggeredForUserRef.current = userId;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      try {
        const [shownVal, onboardingDone] = await Promise.all([
          AsyncStorage.getItem(`${SHOWN_KEY_PREFIX}:${userId}`),
          AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY),
        ]);
        if (cancelled) return;

        if (shownVal) {
          console.log('[ONBOARDING_PAYWALL] already shown for user', userId);
          return;
        }
        if (!onboardingDone) {
          console.log('[ONBOARDING_PAYWALL] onboarding not yet complete, will retry next mount');
          triggeredForUserRef.current = null;
          return;
        }

        await new Promise<void>((resolve) => {
          timer = setTimeout(() => resolve(), PRESENT_DELAY_MS);
        });
        if (cancelled) return;

        console.log('[ONBOARDING_PAYWALL] presenting for new user', userId);
        const result = await presentPaywall('onboarding');
        if (cancelled) return;

        if (result === 'error' || result === 'not_presented') {
          console.warn('[ONBOARDING_PAYWALL] not presented (result=', result, '); leaving flag unset to retry next launch');
          triggeredForUserRef.current = null;
          return;
        }

        await AsyncStorage.setItem(`${SHOWN_KEY_PREFIX}:${userId}`, String(Date.now()));
      } catch (err) {
        console.warn('[ONBOARDING_PAYWALL] failed:', err);
        triggeredForUserRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user?.id, user?.createdAt, isSubscribed, isAvailable, presentPaywall]);

  return null;
}
