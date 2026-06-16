import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@/providers/UserProvider';
import { useTrips } from '@/providers/TripProvider';
import { useSubscription } from '@/lib/revenuecat';

const FIRST_RECAP_PAYWALL_CUTOFF_MS = Date.UTC(2026, 5, 15);
const SHOWN_KEY_PREFIX = 'first_recap_paywall_shown_v1';
const PRESENT_DELAY_MS = 1200;

export default function FirstRecapPaywallTrigger() {
  const { user } = useUser();
  const { trips } = useTrips();
  const { isSubscribed, presentPaywall, isAvailable } = useSubscription();
  const triggeredForUserRef = useRef<string | null>(null);

  const hasCompletedDrive = trips.length >= 1;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!user?.id) return;
    if (isSubscribed) return;
    if (!isAvailable) return;
    if (!hasCompletedDrive) return;

    const createdAt = user.createdAt ?? 0;
    if (createdAt < FIRST_RECAP_PAYWALL_CUTOFF_MS) return;

    const userId = user.id;
    if (triggeredForUserRef.current === userId) return;
    triggeredForUserRef.current = userId;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      try {
        const shownVal = await AsyncStorage.getItem(`${SHOWN_KEY_PREFIX}:${userId}`);
        if (cancelled) return;

        if (shownVal) {
          console.log('[FIRST_RECAP_PAYWALL] already shown for user', userId);
          return;
        }

        await new Promise<void>((resolve) => {
          timer = setTimeout(() => resolve(), PRESENT_DELAY_MS);
        });
        if (cancelled) return;

        console.log('[FIRST_RECAP_PAYWALL] presenting after first drive for user', userId);
        const result = await presentPaywall('recap_first_trip');
        if (cancelled) return;

        if (result === 'error' || result === 'not_presented') {
          console.warn('[FIRST_RECAP_PAYWALL] not presented (result=', result, '); leaving flag unset to retry next visit');
          triggeredForUserRef.current = null;
          return;
        }

        await AsyncStorage.setItem(`${SHOWN_KEY_PREFIX}:${userId}`, String(Date.now()));
      } catch (err) {
        console.warn('[FIRST_RECAP_PAYWALL] failed:', err);
        triggeredForUserRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user?.id, user?.createdAt, isSubscribed, isAvailable, hasCompletedDrive, presentPaywall]);

  return null;
}
