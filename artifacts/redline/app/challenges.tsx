import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Trophy,
  Crown,
  Lock,
  Clock,
  Users,
  Check,
  Route as RouteIcon,
  Timer,
  CalendarCheck,
  UserPlus,
  Camera,
  UsersRound,
  Flag,
} from 'lucide-react-native';
import { trpc } from '@/lib/trpc';
import { useUser } from '@/providers/UserProvider';
import { useSettings } from '@/providers/SettingsProvider';
import { useSubscription } from '@/lib/revenuecat';
import { ThemeColors } from '@/constants/colors';
import { getChallengeBadge } from '@/constants/challengeBadges';
import ProBadge from '@/components/ProBadge';

type PaywallResult = 'purchased' | 'restored' | 'cancelled' | 'error' | 'not_presented';

const TASK_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  distance: RouteIcon,
  seat_time: Timer,
  daily_driver: CalendarCheck,
  crew_up: UserPlus,
  show_your_ride: Camera,
  squad_builder: UsersRound,
};

function taskIcon(key: string) {
  return TASK_ICONS[key] ?? Flag;
}

function formatCash(amount: number, currency: string): string {
  const symbol = currency === 'USD' ? '$' : '';
  const suffix = symbol ? '' : ` ${currency}`;
  return `${symbol}${Math.round(amount)}${suffix}`;
}

function rewardLabel(place: number, cashAmount: number, currency: string): string {
  if (place === 1) return `${formatCash(cashAmount, currency)} cash · Champion badge · Hall of Fame`;
  if (place === 2) return `1 year of Pro free · Runner-up badge`;
  if (place === 3) return `3 months of Pro free · Third-place badge`;
  return '';
}

interface ScoringTask {
  taskKey: string;
  title: string;
  description: string;
  scoringType: string;
  unitSize: number;
  pointsPerUnit: number;
  pointsCap: number;
  targetValue: number;
  completionPoints: number;
}

function ruleText(t: ScoringTask): string {
  if (t.scoringType === 'progressive') {
    let unitLabel = '';
    if (t.taskKey === 'distance') unitLabel = `${t.unitSize} km`;
    else if (t.taskKey === 'seat_time') {
      const hrs = t.unitSize / 3600;
      unitLabel = hrs === 1 ? 'hour' : `${hrs} hours`;
    } else unitLabel = `${t.unitSize}`;
    const pts = `${t.pointsPerUnit} pt${t.pointsPerUnit === 1 ? '' : 's'}`;
    return `${pts} per ${unitLabel} · up to ${t.pointsCap} pts`;
  }
  // completion
  return `${t.completionPoints} pts when completed`;
}

function formatProgress(taskKey: string, progress: number, target: number): string {
  switch (taskKey) {
    case 'distance':
      return `${progress.toFixed(0)} km`;
    case 'seat_time':
      return `${(progress / 3600).toFixed(1)} hrs`;
    case 'daily_driver':
      return `${Math.min(progress, target)}/${target} days`;
    case 'crew_up':
      return `${Math.min(progress, target)}/${target} new followers`;
    case 'squad_builder':
      return `${Math.min(progress, target)}/${target} followed`;
    case 'show_your_ride':
      return `${Math.min(progress, target)}/${target} posts`;
    default:
      return `${progress}`;
  }
}

function countdown(endMs: number, nowMs: number): string {
  const diff = endMs - nowMs;
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export default function ChallengesScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { colors } = useSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isSubscribed, presentPaywall, getLastPaywallError } = useSubscription();

  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const activeQuery = trpc.challenges.getActiveChallenge.useQuery(
    { userId: user?.id },
    { refetchOnWindowFocus: false },
  );
  const data = activeQuery.data;
  const challenge = data?.challenge ?? null;
  const me = data?.me ?? null;
  const tasks = (data?.tasks ?? []) as ScoringTask[];
  const leaderboard = data?.leaderboard ?? [];
  const proCount = data?.proCount ?? 0;

  const joined = !!me?.joined;
  const isActive = challenge?.status === 'active';
  const isPending = challenge?.status === 'pending';
  const canParticipate = isSubscribed || !!me?.isPro;

  const progressQuery = trpc.challenges.getMyProgress.useQuery(
    { challengeId: challenge?.id ?? '', userId: user?.id ?? '' },
    { enabled: !!challenge && !!user?.id && joined && isActive, refetchOnWindowFocus: false },
  );

  const hofQuery = trpc.challenges.getHallOfFame.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const joinMutation = trpc.challenges.join.useMutation({
    onSuccess: () => {
      void activeQuery.refetch();
    },
    onError: (e) => {
      Alert.alert('Could not join', e.message || 'Please try again in a moment.');
    },
  });

  const tryPaywall = useCallback(async () => {
    try {
      const result = (await presentPaywall('challenges')) as PaywallResult | void;
      if (result === 'not_presented' || result === 'error') {
        const reason = getLastPaywallError?.();
        Alert.alert(
          'Pro feature',
          reason ??
            'The upgrade screen could not be opened right now. Please try again in a moment, or check your connection.',
        );
      }
    } catch (e: any) {
      Alert.alert('Pro feature', `The upgrade screen could not be opened: ${e?.message ?? 'unknown error'}`);
    }
  }, [presentPaywall, getLastPaywallError]);

  const handleJoin = useCallback(() => {
    if (!user?.id) {
      Alert.alert('Sign in required', 'Open the Settings tab to sign in, then join the challenge.');
      return;
    }
    if (!canParticipate) {
      void tryPaywall();
      return;
    }
    joinMutation.mutate({ userId: user.id });
  }, [user?.id, canParticipate, tryPaywall, joinMutation]);

  const refreshing = activeQuery.isRefetching;
  const onRefresh = useCallback(() => {
    void activeQuery.refetch();
    void hofQuery.refetch();
    if (joined && isActive) void progressQuery.refetch();
  }, [activeQuery, hofQuery, progressQuery, joined, isActive]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CHALLENGES</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.cardBackground}
          />
        }
      >
        {activeQuery.isLoading && (
          <View style={styles.centerBox}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}

        {activeQuery.isError && !activeQuery.isLoading && (
          <View style={styles.centerBox}>
            <Text style={styles.emptyText}>Could not load challenges.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void activeQuery.refetch()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!activeQuery.isLoading && !activeQuery.isError && !challenge && (
          <View style={styles.centerBox}>
            <View style={styles.emptyIcon}>
              <Trophy size={36} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>No active challenge</Text>
            <Text style={styles.emptyText}>
              Challenges unlock once RedLine hits {data?.challenge?.requiredProCount ?? 100} Pro members. Check
              back soon — the first round is coming.
            </Text>
          </View>
        )}

        {challenge && (
          <>
            {/* Challenge hero card */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={styles.roundPill}>
                  <Text style={styles.roundPillText}>ROUND {challenge.roundNumber}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: isActive ? colors.accent : colors.cardLight },
                  ]}
                >
                  {isActive ? (
                    <>
                      <View style={styles.liveDot} />
                      <Text style={styles.statusPillTextLive}>LIVE</Text>
                    </>
                  ) : (
                    <Text style={styles.statusPillText}>LOCKED</Text>
                  )}
                </View>
              </View>

              <Text style={styles.heroTitle}>{challenge.title}</Text>
              {!!challenge.description && <Text style={styles.heroDesc}>{challenge.description}</Text>}

              {isActive && (
                <View style={styles.metaRow}>
                  <Clock size={14} color={colors.textLight} />
                  <Text style={styles.metaText}>{countdown(challenge.endTime ?? 0, nowTick)}</Text>
                </View>
              )}

              {/* Unlock progress (pending) */}
              {isPending && (
                <View style={styles.unlockBox}>
                  <View style={styles.unlockHeaderRow}>
                    <Users size={14} color={colors.accent} />
                    <Text style={styles.unlockLabel}>
                      {proCount} / {challenge.requiredProCount} Pro members
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(
                            100,
                            challenge.requiredProCount > 0
                              ? (proCount / challenge.requiredProCount) * 100
                              : 0,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.unlockHint}>
                    This round goes live the moment RedLine reaches {challenge.requiredProCount} Pro members.
                  </Text>
                </View>
              )}
            </View>

            {/* Prizes */}
            <Text style={styles.sectionLabel}>PRIZES</Text>
            <View style={styles.prizeCard}>
              {[1, 2, 3].map((place) => {
                const badge = getChallengeBadge(place);
                return (
                  <View key={place} style={styles.prizeRow}>
                    {badge ? (
                      <Image source={badge} style={styles.prizeBadge} resizeMode="contain" />
                    ) : (
                      <View style={styles.prizeBadgeFallback}>
                        <Text style={styles.prizeBadgeFallbackText}>{place}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prizePlace}>
                        {place === 1 ? '1st place' : place === 2 ? '2nd place' : '3rd place'}
                      </Text>
                      <Text style={styles.prizeReward}>
                        {rewardLabel(place, challenge.cashPrizeAmount, challenge.cashPrizeCurrency)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <Text style={styles.prizeFootnote}>
                Highest total points wins. Ties are broken by whoever reached the total first.
              </Text>
            </View>

            {/* Join / status */}
            {isActive && (
              <View style={styles.joinCard}>
                {joined ? (
                  <View style={styles.joinedRow}>
                    <View style={styles.joinedIcon}>
                      <Check size={18} color={colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.joinedTitle}>You&apos;re in</Text>
                      <Text style={styles.joinedMeta}>
                        {me?.rank ? `Rank #${me.rank}` : 'Unranked'} · {me?.totalPoints ?? 0} pts
                      </Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.joinBtn}
                      activeOpacity={0.85}
                      onPress={handleJoin}
                      disabled={joinMutation.isPending}
                    >
                      {joinMutation.isPending ? (
                        <ActivityIndicator color={colors.textInverted} />
                      ) : (
                        <>
                          {!canParticipate && <Lock size={16} color={colors.textInverted} />}
                          <Text style={styles.joinBtnText}>
                            {canParticipate ? 'Join the Challenge' : 'Join with Pro'}
                          </Text>
                          {!canParticipate && <ProBadge size="sm" />}
                        </>
                      )}
                    </TouchableOpacity>
                    {!canParticipate && (
                      <Text style={styles.joinHint}>
                        Anyone can watch the live leaderboard. Pro members compete for the prizes.
                      </Text>
                    )}
                  </>
                )}
              </View>
            )}

            {/* My progress */}
            {joined && isActive && (
              <>
                <Text style={styles.sectionLabel}>YOUR PROGRESS</Text>
                <View style={styles.card}>
                  {progressQuery.isLoading && <ActivityIndicator color={colors.accent} />}
                  {progressQuery.data && (
                    <>
                      <View style={styles.myTotalRow}>
                        <Text style={styles.myTotalLabel}>Total points</Text>
                        <Text style={styles.myTotalValue}>{progressQuery.data.total}</Text>
                      </View>
                      {progressQuery.data.breakdown.map((b) => {
                        const Icon = taskIcon(b.taskKey);
                        const pct =
                          b.target > 0 ? Math.min(100, (b.progress / b.target) * 100) : b.completed ? 100 : 0;
                        return (
                          <View key={b.taskKey} style={styles.progressTaskRow}>
                            <View style={styles.taskIconBubble}>
                              <Icon size={15} color={colors.accent} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={styles.progressTaskTop}>
                                <Text style={styles.taskTitle}>{b.title}</Text>
                                <Text style={styles.taskPoints}>{b.points} pts</Text>
                              </View>
                              <View style={styles.progressTrackSm}>
                                <View style={[styles.progressFillSm, { width: `${pct}%` }]} />
                              </View>
                              <Text style={styles.taskProgressText}>
                                {formatProgress(b.taskKey, b.progress, b.target)}
                                {b.completed ? ' · done' : ''}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </>
                  )}
                </View>
              </>
            )}

            {/* How points work (always visible) */}
            <Text style={styles.sectionLabel}>HOW POINTS WORK</Text>
            <View style={styles.card}>
              {tasks.map((t, idx) => {
                const Icon = taskIcon(t.taskKey);
                return (
                  <View
                    key={t.taskKey}
                    style={[styles.taskRow, idx === tasks.length - 1 && styles.taskRowLast]}
                  >
                    <View style={styles.taskIconBubble}>
                      <Icon size={16} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taskTitle}>{t.title}</Text>
                      <Text style={styles.taskDesc}>{t.description}</Text>
                      <Text style={styles.taskRule}>{ruleText(t)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Live leaderboard (everyone can view) */}
            {(isActive || leaderboard.length > 0) && (
              <>
                <Text style={styles.sectionLabel}>LIVE LEADERBOARD</Text>
                <View style={styles.card}>
                  {leaderboard.length === 0 ? (
                    <Text style={styles.emptyText}>No one has scored yet. Be the first.</Text>
                  ) : (
                    leaderboard.map((entry) => {
                      const badge = entry.rank <= 3 ? getChallengeBadge(entry.rank) : null;
                      const isMe = entry.userId === user?.id;
                      return (
                        <TouchableOpacity
                          key={entry.userId}
                          activeOpacity={0.7}
                          onPress={() =>
                            router.push({
                              pathname: '/user-profile',
                              params: { userId: entry.userId },
                            } as any)
                          }
                          style={[styles.lbRow, isMe && styles.lbRowMe]}
                        >
                          {badge ? (
                            <Image source={badge} style={styles.lbBadge} resizeMode="contain" />
                          ) : (
                            <View style={styles.lbRankBubble}>
                              <Text style={styles.lbRankText}>{entry.rank}</Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={styles.lbName} numberOfLines={1}>
                              {entry.displayName}
                              {isMe ? ' (you)' : ''}
                            </Text>
                            {!!(entry.carBrand || entry.carModel) && (
                              <Text style={styles.lbCar} numberOfLines={1}>
                                {[entry.carBrand, entry.carModel].filter(Boolean).join(' ')}
                              </Text>
                            )}
                          </View>
                          <Text style={styles.lbPoints}>{entry.totalPoints}</Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              </>
            )}
          </>
        )}

        {/* Hall of Fame */}
        {hofQuery.data && hofQuery.data.entries.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>HALL OF FAME</Text>
            <View style={styles.card}>
              {hofQuery.data.entries.map((entry, idx) => {
                const badge = entry.place <= 3 ? getChallengeBadge(entry.place) : null;
                return (
                  <View
                    key={`${entry.challengeId}-${entry.userId}`}
                    style={[styles.hofRow, idx === hofQuery.data!.entries.length - 1 && styles.taskRowLast]}
                  >
                    {badge ? (
                      <Image source={badge} style={styles.hofBadge} resizeMode="contain" />
                    ) : (
                      <View style={styles.lbRankBubble}>
                        <Crown size={14} color={colors.accent} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hofName} numberOfLines={1}>
                        {entry.displayName}
                      </Text>
                      <Text style={styles.hofMeta} numberOfLines={1}>
                        Round {entry.roundNumber} · {entry.points} pts
                      </Text>
                    </View>
                    <Text style={styles.hofPlace}>
                      {entry.place === 1 ? '1st' : entry.place === 2 ? '2nd' : '3rd'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 16,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      letterSpacing: 2,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 24,
    },
    centerBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
      paddingHorizontal: 32,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.cardBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 16,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      marginBottom: 8,
      letterSpacing: 0.5,
    },
    emptyText: {
      fontSize: 12,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      textAlign: 'center',
      lineHeight: 19,
    },
    retryBtn: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.accent,
    },
    retryBtnText: {
      fontSize: 12,
      fontFamily: 'Orbitron_700Bold',
      color: colors.textInverted,
      letterSpacing: 0.5,
    },
    heroCard: {
      marginHorizontal: 16,
      marginTop: 16,
      padding: 18,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.cardBackground,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    roundPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    roundPillText: {
      fontSize: 10,
      fontFamily: 'Orbitron_700Bold',
      color: colors.textLight,
      letterSpacing: 1,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.textInverted,
    },
    statusPillText: {
      fontSize: 10,
      fontFamily: 'Orbitron_700Bold',
      color: colors.textLight,
      letterSpacing: 1,
    },
    statusPillTextLive: {
      fontSize: 10,
      fontFamily: 'Orbitron_700Bold',
      color: colors.textInverted,
      letterSpacing: 1,
    },
    heroTitle: {
      fontSize: 22,
      fontFamily: 'Orbitron_800ExtraBold',
      color: colors.text,
      letterSpacing: 0.5,
    },
    heroDesc: {
      fontSize: 12,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 8,
      lineHeight: 19,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 14,
    },
    metaText: {
      fontSize: 12,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
      letterSpacing: 0.5,
    },
    unlockBox: {
      marginTop: 16,
    },
    unlockHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    unlockLabel: {
      fontSize: 12,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      letterSpacing: 0.5,
    },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    unlockHint: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 8,
      lineHeight: 16,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: 'Orbitron_700Bold',
      color: colors.textLight,
      letterSpacing: 1.5,
      marginHorizontal: 20,
      marginTop: 24,
      marginBottom: 10,
    },
    prizeCard: {
      marginHorizontal: 16,
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
    },
    prizeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 8,
    },
    prizeBadge: {
      width: 44,
      height: 44,
    },
    prizeBadgeFallback: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    prizeBadgeFallbackText: {
      fontSize: 16,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
    prizePlace: {
      fontSize: 13,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      letterSpacing: 0.5,
    },
    prizeReward: {
      fontSize: 11,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 3,
      lineHeight: 16,
    },
    prizeFootnote: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 10,
      lineHeight: 15,
      fontStyle: 'italic',
    },
    joinCard: {
      marginHorizontal: 16,
      marginTop: 16,
    },
    joinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    joinBtnText: {
      fontSize: 14,
      fontFamily: 'Orbitron_700Bold',
      color: colors.textInverted,
      letterSpacing: 0.5,
    },
    joinHint: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      textAlign: 'center',
      marginTop: 10,
      lineHeight: 15,
    },
    joinedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.success,
      backgroundColor: colors.cardBackground,
    },
    joinedIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    joinedTitle: {
      fontSize: 13,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      letterSpacing: 0.5,
    },
    joinedMeta: {
      fontSize: 11,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 3,
    },
    card: {
      marginHorizontal: 16,
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
    },
    myTotalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 14,
      marginBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    myTotalLabel: {
      fontSize: 12,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.textLight,
      letterSpacing: 0.5,
    },
    myTotalValue: {
      fontSize: 22,
      fontFamily: 'Orbitron_800ExtraBold',
      color: colors.accent,
    },
    progressTaskRow: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 10,
    },
    progressTaskTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    taskIconBubble: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    progressTrackSm: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    progressFillSm: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    taskProgressText: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 6,
    },
    taskRow: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    taskRowLast: {
      borderBottomWidth: 0,
    },
    taskTitle: {
      fontSize: 13,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      letterSpacing: 0.3,
    },
    taskDesc: {
      fontSize: 11,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 3,
      lineHeight: 16,
    },
    taskRule: {
      fontSize: 10,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.accent,
      marginTop: 6,
      letterSpacing: 0.3,
    },
    taskPoints: {
      fontSize: 12,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
    lbRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 8,
    },
    lbRowMe: {
      backgroundColor: colors.background,
    },
    lbBadge: {
      width: 34,
      height: 34,
    },
    lbRankBubble: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lbRankText: {
      fontSize: 12,
      fontFamily: 'Orbitron_700Bold',
      color: colors.textLight,
    },
    lbName: {
      fontSize: 12,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
    },
    lbCar: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 2,
    },
    lbPoints: {
      fontSize: 14,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
    hofRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    hofBadge: {
      width: 34,
      height: 34,
    },
    hofName: {
      fontSize: 12,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
    },
    hofMeta: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 2,
    },
    hofPlace: {
      fontSize: 12,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
  });
