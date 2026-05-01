import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { Users, Trophy, Activity, Crown, ChevronDown } from 'lucide-react-native';
import { trpc } from '@/lib/trpc';
import { useSettings } from '@/providers/SettingsProvider';
import { ThemeColors } from '@/constants/colors';
import ProBadge from '@/components/ProBadge';

type Sort = 'recent' | 'topSpeed' | 'distance';

const SORT_OPTIONS: { key: Sort; label: string; pro: boolean }[] = [
  { key: 'recent', label: 'Recent', pro: false },
  { key: 'topSpeed', label: 'Top Speed', pro: true },
  { key: 'distance', label: 'Distance', pro: true },
];

interface CommunityCardProps {
  userId: string;
  isSubscribed: boolean;
  presentPaywall: () => void;
}

export default function CommunityCard({ userId, isSubscribed, presentPaywall }: CommunityCardProps) {
  const { colors, convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel } = useSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [sort, setSort] = useState<Sort>('recent');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const communityQuery = trpc.communities.getMyCommunity.useQuery(
    { userId },
    { enabled: !!userId }
  );

  const community = communityQuery.data;
  const brand = community?.available ? community.brand : undefined;
  const model = community?.available ? community.model : undefined;

  const feedQuery = trpc.communities.getCommunityFeed.useQuery(
    {
      brand: brand ?? '',
      model: model ?? '',
      sort,
      limit: 8,
    },
    { enabled: !!brand && !!model }
  );

  const handleSortPress = (option: Sort, isPro: boolean) => {
    if (isPro && !isSubscribed) {
      presentPaywall();
      return;
    }
    setSort(option);
    setShowSortMenu(false);
  };

  if (communityQuery.isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (community && !community.available && community.reason === 'no_car') {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Users size={18} color={colors.accent} />
          <Text style={styles.title}>Community</Text>
        </View>
        <Text style={styles.emptyText}>
          Set your car in your profile to join your model&apos;s community.
        </Text>
      </View>
    );
  }

  if (!community || !community.available) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Users size={18} color={colors.accent} />
        <Text style={styles.title}>
          {community.brand} {community.model} Community
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{community.memberCount}</Text>
          <Text style={styles.statLabel}>members</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            {convertSpeed(community.stats.avgTopSpeed).toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>avg top {getSpeedLabel()}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{community.stats.totalTrips}</Text>
          <Text style={styles.statLabel}>total trips</Text>
        </View>
      </View>

      {community.topMembers.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Trophy size={14} color={colors.accent} />
            <Text style={styles.sectionTitle}>Top Members</Text>
          </View>
          {community.topMembers.map((m, idx) => (
            <View key={m.userId} style={styles.memberRow}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{idx + 1}</Text>
              </View>
              <Text style={styles.memberName}>{m.displayName}</Text>
              <Text style={styles.memberValue}>
                {convertSpeed(m.topSpeed).toFixed(0)} {getSpeedLabel()}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Activity size={14} color={colors.accent} />
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setShowSortMenu((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.sortBtnText}>
              {SORT_OPTIONS.find((o) => o.key === sort)?.label}
            </Text>
            {!isSubscribed && <ProBadge size="sm" />}
            <ChevronDown size={12} color={colors.textLight} />
          </TouchableOpacity>
        </View>

        {showSortMenu && (
          <View style={styles.sortMenu}>
            {SORT_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.key}
                style={styles.sortMenuItem}
                onPress={() => handleSortPress(o.key, o.pro)}
                activeOpacity={0.7}
              >
                <Text style={styles.sortMenuText}>{o.label}</Text>
                {o.pro && !isSubscribed && <Crown size={12} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {feedQuery.isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />}

        {feedQuery.data?.trips.length === 0 && !feedQuery.isLoading && (
          <Text style={styles.emptyText}>No activity yet from this community.</Text>
        )}

        <ScrollView style={{ maxHeight: 240 }}>
          {feedQuery.data?.trips.map((t) => (
            <View key={t.id} style={styles.feedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.feedName}>{t.userName}</Text>
                <Text style={styles.feedMeta}>
                  {convertDistance(t.distance).toFixed(1)} {getDistanceLabel()} \u2022{' '}
                  {convertSpeed(t.topSpeed).toFixed(0)} {getSpeedLabel()}
                </Text>
              </View>
              <Text style={styles.feedTime}>
                {t.startTime ? new Date(t.startTime).toLocaleDateString() : ''}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    title: {
      fontSize: 14,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      letterSpacing: 0.5,
      flex: 1,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
      gap: 8,
    },
    statBox: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.background,
    },
    statValue: {
      fontSize: 18,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
    statLabel: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    section: {
      marginTop: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 11,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    sortBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    sortBtnText: {
      fontSize: 10,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
      letterSpacing: 0.5,
    },
    sortMenu: {
      marginBottom: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    sortMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sortMenuText: {
      fontSize: 12,
      fontFamily: 'Orbitron_400Regular',
      color: colors.text,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 8,
      gap: 10,
    },
    rankBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: {
      fontSize: 10,
      fontFamily: 'Orbitron_700Bold',
      color: '#FFF',
    },
    memberName: {
      flex: 1,
      fontSize: 12,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
    },
    memberValue: {
      fontSize: 12,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
    feedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    feedName: {
      fontSize: 12,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
    },
    feedMeta: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 2,
    },
    feedTime: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
    },
    emptyText: {
      fontSize: 12,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 18,
    },
  });
