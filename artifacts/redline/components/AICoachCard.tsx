import React, { useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Lock, Sparkles, RefreshCw, ThumbsUp, Target, Lightbulb } from 'lucide-react-native';
import { TripStats } from '@/types/trip';
import { ThemeColors } from '@/constants/colors';
import { useSettings } from '@/providers/SettingsProvider';
import { useSubscription } from '@/lib/revenuecat';
import { computeProMetrics } from '@/lib/proMetrics';
import { trpc } from '@/lib/trpc';
import ProBadge from '@/components/ProBadge';

interface AICoachCardProps {
  trip: TripStats | null;
}

type Tone = 'praise' | 'improve' | 'tip';

function toneIcon(tone: Tone, color: string) {
  if (tone === 'praise') return <ThumbsUp size={14} color={color} />;
  if (tone === 'improve') return <Target size={14} color={color} />;
  return <Lightbulb size={14} color={color} />;
}

export default function AICoachCard({ trip }: AICoachCardProps) {
  const { colors, settings } = useSettings();
  const { isSubscribed, presentPaywall, getLastPaywallError } = useSubscription();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const metrics = useMemo(() => (trip ? computeProMetrics(trip) : null), [trip]);

  const queryInput = useMemo(() => {
    if (!trip || !metrics) return null;
    return {
      tripId: trip.id,
      units: settings.speedUnit === 'mph' ? ('mph' as const) : ('kmh' as const),
      carModel: trip.carModel,
      stats: {
        distanceKm: trip.distance,
        durationSec: trip.duration,
        avgSpeedKmh: trip.avgSpeed,
        topSpeedKmh: trip.topSpeed,
        corners: trip.corners,
        maxGForce: trip.maxGForce,
        time0to100: trip.time0to100,
      },
      metrics: {
        smoothness: metrics.smoothness,
        aggression: metrics.aggression,
        drivingStyle: metrics.drivingStyle,
        bestSectorSpeed: metrics.bestSectorSpeed,
        bestSectorIndex: metrics.bestSectorIndex,
      },
    };
  }, [trip, metrics, settings.speedUnit]);

  const coachingQuery = trpc.coach.getTripCoaching.useQuery(queryInput!, {
    enabled: !!queryInput && isSubscribed,
    staleTime: Infinity,
    retry: 1,
  });

  const handleUpgrade = useCallback(async () => {
    try {
      const result = await presentPaywall('recap_ai_coach');
      if (result === 'not_presented' || result === 'error') {
        const reason = getLastPaywallError?.();
        Alert.alert(
          'AI Drive Coach',
          reason ?? 'The upgrade screen could not be opened right now. Please try again in a moment.',
        );
      }
    } catch (e: any) {
      Alert.alert('AI Drive Coach', `The upgrade screen could not be opened: ${e?.message ?? 'unknown error'}`);
    }
  }, [presentPaywall, getLastPaywallError]);

  if (!trip) return null;

  if (!isSubscribed) {
    return (
      <TouchableOpacity style={styles.lockedCard} activeOpacity={0.85} onPress={() => { void handleUpgrade(); }}>
        <View style={styles.headerRow}>
          <Sparkles size={14} color="#FFD700" />
          <Text style={styles.title}>AI DRIVE COACH</Text>
          <ProBadge size="sm" />
        </View>
        <View style={styles.lockedRow}>
          <Lock size={20} color={colors.textLight} />
          <View style={styles.lockedTextWrap}>
            <Text style={styles.lockedHeadline}>Get personalized coaching after every drive</Text>
            <Text style={styles.lockedSub}>Tap to upgrade to RedLine Pro</Text>
          </View>
        </View>
        <View style={styles.teaserBlur}>
          <Text style={styles.teaserLine} numberOfLines={1}>“Your sector 2 pace shows real commitment to the line…”</Text>
          <Text style={styles.teaserLine} numberOfLines={1}>“Smoothness is the next level — treat inputs like a dial…”</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const renderBody = () => {
    if (coachingQuery.isLoading) {
      return (
        <View style={styles.centerRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Analyzing your drive…</Text>
        </View>
      );
    }

    if (coachingQuery.isError) {
      return (
        <TouchableOpacity style={styles.retryRow} activeOpacity={0.8} onPress={() => { void coachingQuery.refetch(); }}>
          <RefreshCw size={16} color={colors.textLight} />
          <Text style={styles.retryText}>Couldn't generate coaching. Tap to retry.</Text>
        </TouchableOpacity>
      );
    }

    const data = coachingQuery.data;
    if (!data || data.available === false || !('insights' in data)) {
      return null;
    }

    return (
      <View>
        <Text style={styles.coachHeadline}>{data.headline}</Text>
        {data.insights.map((insight, idx) => {
          const tone = (insight.tone as Tone) ?? 'tip';
          const accent = tone === 'praise' ? colors.success : tone === 'improve' ? colors.accent : '#FFD700';
          return (
            <View key={idx} style={styles.insightRow}>
              <View style={[styles.insightIconWrap, { backgroundColor: accent + '22' }]}>
                {toneIcon(tone, accent)}
              </View>
              <View style={styles.insightTextWrap}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightBody}>{insight.body}</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const body = renderBody();
  if (body === null && !coachingQuery.isLoading && !coachingQuery.isError) {
    // AI unconfigured / empty — hide entirely (graceful degradation).
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Sparkles size={14} color="#FFD700" />
        <Text style={styles.title}>AI DRIVE COACH</Text>
        <ProBadge size="sm" />
      </View>
      {body}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lockedCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  title: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 12,
    color: colors.textInverted === '#000000' ? '#FFFFFF' : colors.text,
    letterSpacing: 1,
    flex: 1,
  },
  coachHeadline: {
    fontFamily: 'Orbitron_600SemiBold',
    fontSize: 15,
    color: colors.textInverted === '#000000' ? '#FFFFFF' : colors.text,
    marginBottom: 14,
    lineHeight: 21,
  },
  insightRow: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 12,
  },
  insightIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  insightTextWrap: {
    flex: 1,
  },
  insightTitle: {
    fontFamily: 'Orbitron_600SemiBold',
    fontSize: 12,
    color: colors.textInverted === '#000000' ? '#FFFFFF' : colors.text,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  insightBody: {
    fontSize: 13,
    color: colors.textLight,
    lineHeight: 19,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textLight,
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: 13,
    color: colors.textLight,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  lockedTextWrap: {
    flex: 1,
  },
  lockedHeadline: {
    fontFamily: 'Orbitron_600SemiBold',
    fontSize: 13,
    color: colors.textInverted === '#000000' ? '#FFFFFF' : colors.text,
    marginBottom: 2,
  },
  lockedSub: {
    fontSize: 12,
    color: colors.textLight,
  },
  teaserBlur: {
    backgroundColor: colors.cardLight,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    opacity: Platform.OS === 'web' ? 0.5 : 0.45,
  },
  teaserLine: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.textLight,
  },
});
