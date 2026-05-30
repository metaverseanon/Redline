import React, { useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Lock, Sparkles, RefreshCw, TrendingUp, Target, Flag } from 'lucide-react-native';
import { TripStats } from '@/types/trip';
import { ThemeColors } from '@/constants/colors';
import { useSettings } from '@/providers/SettingsProvider';
import { useSubscription } from '@/lib/revenuecat';
import { computeProMetrics } from '@/lib/proMetrics';
import { trpc } from '@/lib/trpc';
import ProBadge from '@/components/ProBadge';

interface AIWeeklyCoachCardProps {
  trips: TripStats[];
  weekStart: number;
  weekEnd: number;
}

export default function AIWeeklyCoachCard({ trips, weekStart, weekEnd }: AIWeeklyCoachCardProps) {
  const { colors, settings } = useSettings();
  const { isSubscribed, presentPaywall, getLastPaywallError } = useSubscription();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const queryInput = useMemo(() => {
    const weekTrips = trips.filter((t) => t.startTime >= weekStart && t.startTime <= weekEnd);
    if (weekTrips.length === 0) return null;

    const perTrip = weekTrips
      .slice()
      .sort((a, b) => a.startTime - b.startTime)
      .map((t) => {
        const m = computeProMetrics(t);
        return {
          date: new Date(t.startTime).toISOString().slice(0, 10),
          topSpeedKmh: t.topSpeed,
          distanceKm: t.distance,
          smoothness: m.smoothness,
          aggression: m.aggression,
          drivingStyle: m.drivingStyle,
        };
      });

    const totalDistanceKm = perTrip.reduce((s, t) => s + t.distanceKm, 0);
    const topSpeedKmh = Math.max(...perTrip.map((t) => t.topSpeedKmh));
    const avgSmoothness = perTrip.reduce((s, t) => s + t.smoothness, 0) / perTrip.length;
    const avgAggression = perTrip.reduce((s, t) => s + t.aggression, 0) / perTrip.length;

    return {
      weekKey: `${weekStart}-${weekEnd}`,
      units: settings.speedUnit === 'mph' ? ('mph' as const) : ('kmh' as const),
      aggregate: {
        totalTrips: perTrip.length,
        totalDistanceKm,
        topSpeedKmh,
        avgSmoothness,
        avgAggression,
      },
      trips: perTrip,
    };
  }, [trips, weekStart, weekEnd, settings.speedUnit]);

  const weeklyQuery = trpc.coach.getWeeklyCoaching.useQuery(queryInput!, {
    enabled: !!queryInput && isSubscribed,
    staleTime: Infinity,
    retry: 1,
  });

  const handleUpgrade = useCallback(async () => {
    try {
      const result = await presentPaywall('weekly_ai_coach');
      if (result === 'not_presented' || result === 'error') {
        const reason = getLastPaywallError?.();
        Alert.alert(
          'AI Weekly Coach',
          reason ?? 'The upgrade screen could not be opened right now. Please try again in a moment.',
        );
      }
    } catch (e: any) {
      Alert.alert('AI Weekly Coach', `The upgrade screen could not be opened: ${e?.message ?? 'unknown error'}`);
    }
  }, [presentPaywall, getLastPaywallError]);

  if (!queryInput) return null;

  if (!isSubscribed) {
    return (
      <TouchableOpacity style={styles.lockedCard} activeOpacity={0.85} onPress={() => { void handleUpgrade(); }}>
        <View style={styles.headerRow}>
          <Sparkles size={14} color="#FFD700" />
          <Text style={styles.title}>AI WEEKLY TRENDS</Text>
          <ProBadge size="sm" />
        </View>
        <View style={styles.lockedRow}>
          <Lock size={18} color="rgba(255,255,255,0.6)" />
          <Text style={styles.lockedText}>Unlock weekly trends, what improved & next week's goal</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (weeklyQuery.isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Sparkles size={14} color="#FFD700" />
          <Text style={styles.title}>AI WEEKLY TRENDS</Text>
        </View>
        <View style={styles.centerRow}>
          <ActivityIndicator color="#FFD700" />
          <Text style={styles.loadingText}>Analyzing your week…</Text>
        </View>
      </View>
    );
  }

  if (weeklyQuery.isError) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Sparkles size={14} color="#FFD700" />
          <Text style={styles.title}>AI WEEKLY TRENDS</Text>
        </View>
        <TouchableOpacity style={styles.retryRow} activeOpacity={0.8} onPress={() => { void weeklyQuery.refetch(); }}>
          <RefreshCw size={15} color="rgba(255,255,255,0.6)" />
          <Text style={styles.retryText}>Couldn't generate trends. Tap to retry.</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const data = weeklyQuery.data;
  if (!data || data.available === false || !('headline' in data)) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Sparkles size={14} color="#FFD700" />
        <Text style={styles.title}>AI WEEKLY TRENDS</Text>
      </View>
      <Text style={styles.headline}>{data.headline}</Text>

      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(48,209,88,0.16)' }]}>
          <TrendingUp size={14} color="#30D158" />
        </View>
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowLabel}>WHAT IMPROVED</Text>
          <Text style={styles.rowBody}>{data.whatImproved}</Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(204,0,0,0.16)' }]}>
          <Target size={14} color="#FF453A" />
        </View>
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowLabel}>WORK ON</Text>
          <Text style={styles.rowBody}>{data.workOn}</Text>
        </View>
      </View>

      <View style={styles.goalBox}>
        <Flag size={14} color="#FFD700" />
        <Text style={styles.goalText}>{data.goal}</Text>
      </View>
    </View>
  );
}

const createStyles = (_colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 16,
    width: '100%',
  },
  lockedCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 16,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1,
    flex: 1,
  },
  headline: {
    fontFamily: 'Orbitron_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 14,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: 'Orbitron_600SemiBold',
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 3,
  },
  rowBody: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },
  goalBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.25)',
  },
  goalText: {
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
    fontFamily: 'Orbitron_500Medium',
    lineHeight: 18,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  loadingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  retryText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lockedText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
  },
});
