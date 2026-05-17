import { useEffect } from 'react';
import { useAnalytics } from '@/providers/AnalyticsProvider';
import { setPaywallAnalyticsHandler } from '@/lib/revenuecat';

export default function PaywallAnalyticsBridge() {
  const { track } = useAnalytics();

  useEffect(() => {
    setPaywallAnalyticsHandler((event, properties) => {
      try {
        track(event, properties);
      } catch (err) {
        console.warn('[PaywallAnalyticsBridge] track failed:', err);
      }
    });
    return () => setPaywallAnalyticsHandler(null);
  }, [track]);

  return null;
}
