import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { trpcClient } from '@/lib/trpc';

const ANON_ID_KEY = 'anonymous_id';
const ANALYTICS_QUEUE_KEY = 'analytics_queue';
const FLUSH_INTERVAL = 30000;

type AnalyticsEvent = {
  event: string;
  properties?: Record<string, unknown>;
  timestamp: number;
  anonymousId: string;
  userId?: string;
  platform: string;
};

function generateAnonId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'anon_';
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export const [AnalyticsProvider, useAnalytics] = createContextHook(() => {
  const [anonymousId, setAnonymousId] = useState<string | null>(null);
  const queueRef = useRef<AnalyticsEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const init = async () => {
      try {
        let anonId = await AsyncStorage.getItem(ANON_ID_KEY);
        if (!anonId) {
          anonId = generateAnonId();
          await AsyncStorage.setItem(ANON_ID_KEY, anonId);
          console.log('[ANALYTICS] Generated new anonymous ID:', anonId);
        } else {
          console.log('[ANALYTICS] Loaded anonymous ID:', anonId);
        }
        setAnonymousId(anonId);

        const storedQueue = await AsyncStorage.getItem(ANALYTICS_QUEUE_KEY);
        if (storedQueue) {
          try {
            const parsed = JSON.parse(storedQueue);
            if (Array.isArray(parsed)) {
              queueRef.current = parsed;
              console.log('[ANALYTICS] Loaded', parsed.length, 'queued events');
            }
          } catch {
            console.warn('[ANALYTICS] Failed to parse stored queue');
          }
        }
      } catch (e) {
        console.warn('[ANALYTICS] Init error:', e);
        const fallbackId = generateAnonId();
        setAnonymousId(fallbackId);
      }
    };

    void init();
  }, []);

  const flushQueue = useCallback(async () => {
    if (queueRef.current.length === 0) return;

    const eventsToSend = [...queueRef.current];
    queueRef.current = [];

    try {
      await trpcClient.analytics.trackEvents.mutate({
        events: eventsToSend.map(e => ({
          event: e.event,
          properties: e.properties ? JSON.stringify(e.properties) : undefined,
          timestamp: e.timestamp,
          anonymousId: e.anonymousId,
          userId: e.userId,
          platform: e.platform,
        })),
      });
      console.log('[ANALYTICS] Flushed', eventsToSend.length, 'events');
      await AsyncStorage.removeItem(ANALYTICS_QUEUE_KEY);
    } catch {
      console.warn('[ANALYTICS] Flush failed, re-queuing', eventsToSend.length, 'events');
      queueRef.current = [...eventsToSend, ...queueRef.current];
      try {
        await AsyncStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(queueRef.current));
      } catch {
        console.warn('[ANALYTICS] Failed to persist queue');
      }
    }
  }, []);

  useEffect(() => {
    flushTimerRef.current = setInterval(() => {
      void flushQueue();
    }, FLUSH_INTERVAL);

    return () => {
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
      }
      void flushQueue();
    };
  }, [flushQueue]);

  const track = useCallback((event: string, properties?: Record<string, unknown>) => {
    const anonId = anonymousId || 'unknown';
    const analyticsEvent: AnalyticsEvent = {
      event,
      properties,
      timestamp: Date.now(),
      anonymousId: anonId,
      userId: userIdRef.current,
      platform: Platform.OS,
    };

    queueRef.current.push(analyticsEvent);
    console.log('[ANALYTICS] Track:', event, properties || '');

    if (queueRef.current.length >= 10) {
      void flushQueue();
    }
  }, [anonymousId, flushQueue]);

  const identify = useCallback((userId: string) => {
    userIdRef.current = userId;
    console.log('[ANALYTICS] Identified user:', userId);
    track('user_identified', { userId });
  }, [track]);

  return useMemo(() => ({
    anonymousId,
    track,
    identify,
    flushQueue,
  }), [anonymousId, track, identify, flushQueue]);
});
