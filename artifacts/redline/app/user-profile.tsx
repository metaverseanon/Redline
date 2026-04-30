import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
  Animated,
  Alert,
  Share,
  Modal,
  Dimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { MapPin, Car, Zap, Navigation, Gauge, Activity, CornerDownRight, Timer, Route, Trophy, Calendar, ChevronDown, UserPlus, UserMinus, Flame, Flag, Users, Star, Rocket, Moon, Shield, Clock, Share2, QrCode, X } from 'lucide-react-native';
import * as Linking from 'expo-linking';
import { useAchievements } from '@/providers/AchievementProvider';
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from '@/constants/achievements';
import { AchievementCategory, UserAchievement } from '@/types/achievement';
import { getEarnedBadges, BADGE_TIERS } from '@/constants/badges';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';
import { useTrips } from '@/providers/TripProvider';
import { trpc } from '@/lib/trpc';
import { ThemeColors } from '@/constants/colors';
import { TripStats } from '@/types/trip';
import * as Haptics from 'expo-haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CarStats {
  carKey: string;
  brand: string;
  model: string;
  picture?: string;
  totalTrips: number;
  totalDistance: number;
  topSpeed: number;
  avgSpeed: number;
  topCornerSpeed: number;
  maxGForce: number;
  best0to100: number | null;
  best0to200: number | null;
  totalDuration: number;
  lastDriveDate: number;
}

interface ProfileData {
  displayName: string;
  profilePicture?: string;
  country?: string;
  city?: string;
  carBrand?: string;
  carModel?: string;
  carPicture?: string;
  bio?: string;
  cars?: Array<{ id: string; brand: string; model: string; picture?: string; isPrimary?: boolean }>;
  createdAt: number;
}

const CATEGORY_COLORS: Record<AchievementCategory, string> = {
  speed: '#FF3B30',
  distance: '#007AFF',
  trips: '#FF9500',
  streak: '#FF6B00',
  social: '#AF52DE',
  performance: '#30D158',
};

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  'gauge': Gauge,
  'route': Route,
  'flag': Flag,
  'flame': Flame,
  'users': Users,
  'zap': Zap,
};

const ACHIEVEMENT_ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  'gauge': Gauge,
  'map-pin': MapPin,
  'route': Route,
  'map': Navigation,
  'globe': Navigation,
  'flag': Flag,
  'repeat': Route,
  'award': Trophy,
  'infinity': Zap,
  'flame': Flame,
  'users': Users,
  'star': Star,
  'zap': Zap,
  'corner-down-right': CornerDownRight,
  'rocket': Rocket,
  'moon': Moon,
  'clock': Clock,
};

interface AchievementShowcaseProps {
  isOwnProfile: boolean;
  ownUnlockedAchievements: UserAchievement[];
  ownUnlockedCount: number;
  ownTotalCount: number;
  ownStreak: { currentStreak: number; longestStreak: number };
  remoteAchievements?: { achievementId: string; unlockedAt: number }[];
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function AchievementShowcase({
  isOwnProfile,
  ownUnlockedAchievements,
  ownUnlockedCount,
  ownTotalCount,
  ownStreak,
  remoteAchievements,
  colors,
  styles,
}: AchievementShowcaseProps) {
  const achievementIds = useMemo(() => {
    if (isOwnProfile) {
      return new Set(ownUnlockedAchievements.map(a => a.achievementId));
    }
    return new Set((remoteAchievements ?? []).map(a => a.achievementId));
  }, [isOwnProfile, ownUnlockedAchievements, remoteAchievements]);

  const unlockedCount = isOwnProfile ? ownUnlockedCount : achievementIds.size;
  const totalAchievements = isOwnProfile ? ownTotalCount : ACHIEVEMENTS.length;
  const progressPercent = totalAchievements > 0 ? (unlockedCount / totalAchievements) * 100 : 0;

  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPercent,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [progressPercent, progressAnim]);

  const categoryStats = useMemo(() => {
    return ACHIEVEMENT_CATEGORIES.map(cat => {
      const catAchievements = ACHIEVEMENTS.filter(a => a.category === cat.key);
      const catUnlocked = catAchievements.filter(a => achievementIds.has(a.id)).length;
      return {
        ...cat,
        total: catAchievements.length,
        unlocked: catUnlocked,
        color: CATEGORY_COLORS[cat.key as AchievementCategory] ?? colors.accent,
      };
    });
  }, [achievementIds, colors.accent]);

  const recentUnlocks = useMemo(() => {
    const source = isOwnProfile
      ? ownUnlockedAchievements.map(a => ({ id: a.achievementId, at: a.unlockedAt }))
      : (remoteAchievements ?? []).map(a => ({ id: a.achievementId, at: a.unlockedAt }));
    return source
      .sort((a, b) => b.at - a.at)
      .slice(0, 3)
      .map(item => {
        const def = ACHIEVEMENTS.find(a => a.id === item.id);
        return def ? { ...def, unlockedAt: item.at } : null;
      })
      .filter(Boolean) as (typeof ACHIEVEMENTS[number] & { unlockedAt: number })[];
  }, [isOwnProfile, ownUnlockedAchievements, remoteAchievements]);

  const hasNoData = !isOwnProfile && (!remoteAchievements || remoteAchievements.length === 0);
  if (hasNoData && unlockedCount === 0 && !isOwnProfile) {
    // Still show the section with 0 progress for other users
  }

  const earnedBadges = useMemo(() => getEarnedBadges(unlockedCount, totalAchievements), [unlockedCount, totalAchievements]);

  return (
    <>
      <View style={styles.sectionHeader}>
        <Trophy size={18} color={colors.text} />
        <Text style={styles.sectionTitle}>Achievements</Text>
      </View>

      <View style={achStyles.container}>
        {BADGE_TIERS.length > 0 && (
          <View style={achStyles.badgeRow}>
            {BADGE_TIERS.map((tier) => {
              const isEarned = earnedBadges.some(b => b.id === tier.id);
              return (
                <View key={tier.id} style={[achStyles.badgeItem, !isEarned && achStyles.badgeItemLocked]}>
                  <View style={[
                    achStyles.badgeIconCircle,
                    { backgroundColor: isEarned ? tier.bgColor : colors.cardLight, borderColor: isEarned ? tier.borderColor : colors.border + '40' },
                  ]}>
                    <Shield size={20} color={isEarned ? tier.color : colors.textLight + '40'} fill={isEarned ? tier.color + '30' : 'transparent'} />
                  </View>
                  <Text style={[achStyles.badgeLabel, { color: isEarned ? tier.color : colors.textLight + '60' }]}>
                    {tier.name}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={[achStyles.summaryCard, { backgroundColor: colors.cardLight, borderColor: colors.border }]}>
          <View style={achStyles.summaryTop}>
            <View style={achStyles.trophyCircle}>
              <Trophy size={22} color="#FFD700" />
            </View>
            <View style={achStyles.summaryInfo}>
              <Text style={[achStyles.summaryCount, { color: colors.text }]}>
                {unlockedCount}
                <Text style={[achStyles.summaryTotal, { color: colors.textLight }]}>
                  /{totalAchievements}
                </Text>
              </Text>
              <Text style={[achStyles.summaryLabel, { color: colors.textLight }]}>Unlocked</Text>
            </View>
            {((isOwnProfile && ownStreak.currentStreak > 0) || false) && (
              <View style={achStyles.streakPill}>
                <Flame size={14} color="#FF6B00" />
                <Text style={achStyles.streakPillText}>{ownStreak.currentStreak}d streak</Text>
              </View>
            )}
          </View>
          <View style={[achStyles.progressTrack, { backgroundColor: colors.background }]}>
            <Animated.View
              style={[
                achStyles.progressFill,
                {
                  backgroundColor: colors.accent,
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={[achStyles.progressLabel, { color: colors.textLight }]}>
            {Math.round(progressPercent)}% complete
          </Text>
        </View>

        <View style={achStyles.categoriesGrid}>
          {categoryStats.map(cat => {
            const CatIcon = CATEGORY_ICON_MAP[cat.icon] || Trophy;
            const catPercent = cat.total > 0 ? (cat.unlocked / cat.total) * 100 : 0;
            return (
              <View
                key={cat.key}
                style={[
                  achStyles.categoryChip,
                  {
                    backgroundColor: cat.color + '10',
                    borderColor: cat.unlocked > 0 ? cat.color + '30' : colors.border + '40',
                  },
                ]}
              >
                <View style={[achStyles.categoryIconWrap, { backgroundColor: cat.color + '18' }]}>
                  <CatIcon size={14} color={cat.color} />
                </View>
                <Text style={[achStyles.categoryName, { color: colors.text }]} numberOfLines={1}>
                  {cat.label}
                </Text>
                <Text style={[achStyles.categoryCount, { color: cat.color }]}>
                  {cat.unlocked}/{cat.total}
                </Text>
                <View style={[achStyles.categoryBar, { backgroundColor: cat.color + '15' }]}>
                  <View
                    style={[
                      achStyles.categoryBarFill,
                      {
                        backgroundColor: cat.color,
                        width: `${catPercent}%` as any,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {recentUnlocks.length > 0 && (
          <View style={[achStyles.recentCard, { backgroundColor: colors.cardLight, borderColor: colors.border }]}>
            <Text style={[achStyles.recentTitle, { color: colors.textLight }]}>RECENT UNLOCKS</Text>
            {recentUnlocks.map((ach, index) => {
              const IconComp = ACHIEVEMENT_ICON_MAP[ach.icon] || Trophy;
              const catColor = CATEGORY_COLORS[ach.category] ?? colors.accent;
              const dateStr = new Date(ach.unlockedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <View
                  key={ach.id}
                  style={[
                    achStyles.recentItem,
                    index < recentUnlocks.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border + '40' },
                  ]}
                >
                  <View style={[achStyles.recentIconWrap, { backgroundColor: catColor + '18' }]}>
                    <IconComp size={16} color={catColor} />
                  </View>
                  <View style={achStyles.recentInfo}>
                    <Text style={[achStyles.recentAchTitle, { color: colors.text }]}>{ach.title}</Text>
                    <Text style={[achStyles.recentAchDesc, { color: colors.textLight }]}>{ach.description}</Text>
                  </View>
                  <Text style={[achStyles.recentDate, { color: colors.textLight }]}>{dateStr}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </>
  );
}

const achStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  summaryCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  trophyCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFD70018',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryCount: {
    fontSize: 26,
    fontFamily: 'Orbitron_700Bold',
  },
  summaryTotal: {
    fontSize: 16,
    fontFamily: 'Orbitron_400Regular',
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    marginTop: 1,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B0018',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  streakPillText: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: '#FF6B00',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    marginTop: 6,
    textAlign: 'right',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  categoryChip: {
    width: '47%' as any,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  categoryIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    marginBottom: 2,
  },
  categoryCount: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
    marginBottom: 6,
  },
  categoryBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: 4,
    borderRadius: 2,
  },
  recentCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  recentTitle: {
    fontSize: 10,
    fontFamily: 'Orbitron_600SemiBold',
    letterSpacing: 1,
    marginBottom: 10,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  recentIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentInfo: {
    flex: 1,
  },
  recentAchTitle: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
  },
  recentAchDesc: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    marginTop: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  badgeItem: {
    alignItems: 'center',
    gap: 6,
  },
  badgeItemLocked: {
    opacity: 0.5,
  },
  badgeIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeLabel: {
    fontSize: 9,
    fontFamily: 'Orbitron_600SemiBold',
    letterSpacing: 0.5,
  },
  recentDate: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
  },
});

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useUser();
  const { trips: ownTrips } = useTrips();
  const { convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel, colors } = useSettings();
  const [expandedCarKey, setExpandedCarKey] = useState<string | null>(null);
  const { unlockedAchievements, unlockedCount, totalCount, streak } = useAchievements();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const isOwnProfile = !userId || userId === user?.id;

  const [showQRModal, setShowQRModal] = useState(false);

  const profileUrl = useMemo(() => {
    const targetId = isOwnProfile ? user?.id : userId;
    if (!targetId) return '';
    return Linking.createURL('user-profile', { queryParams: { userId: targetId } });
  }, [isOwnProfile, user?.id, userId]);

  const qrCodeUrl = useMemo(() => {
    if (!profileUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(profileUrl)}&bgcolor=000000&color=FFFFFF&margin=16`;
  }, [profileUrl]);

  const remoteAchievementsQuery = trpc.social.getUserAchievements.useQuery(
    { userId: userId || '' },
    { enabled: !isOwnProfile && !!userId }
  );

  const isFollowingQuery = trpc.social.isFollowing.useQuery(
    { followerId: user?.id || '', followingId: userId || '' },
    { enabled: !isOwnProfile && !!user?.id && !!userId }
  );

  const followCountsQuery = trpc.social.getFollowCounts.useQuery(
    { userId: isOwnProfile ? (user?.id || '') : (userId || '') },
    { enabled: !!(isOwnProfile ? user?.id : userId) }
  );

  const followMutation = trpc.social.follow.useMutation({
    onSuccess: () => {
      void isFollowingQuery.refetch();
      void followCountsQuery.refetch();
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
  });

  const unfollowMutation = trpc.social.unfollow.useMutation({
    onSuccess: () => {
      void isFollowingQuery.refetch();
      void followCountsQuery.refetch();
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const handleFollowToggle = useCallback(() => {
    if (!userId) return;
    if (!user?.id) {
      Alert.alert(
        'Account Required',
        'You need to create an account to follow other users.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Sign Up', onPress: () => router.push('/profile' as any) },
        ]
      );
      return;
    }
    if (isFollowingQuery.data?.following) {
      unfollowMutation.mutate({ followerId: user.id, followingId: userId });
    } else {
      followMutation.mutate({ followerId: user.id, followingId: userId });
    }
  }, [user?.id, userId, isFollowingQuery.data?.following, unfollowMutation, followMutation]);

  const remoteProfileQuery = trpc.user.getPublicProfile.useQuery(
    { userId: userId || '' },
    { enabled: !isOwnProfile && !!userId }
  );

  const remoteTripsQuery = trpc.trips.getUserTrips.useQuery(
    { userId: userId || '' },
    { enabled: !isOwnProfile && !!userId }
  );

  const handleShowQR = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowQRModal(true);
  }, []);

  const profileUser = useMemo((): ProfileData | null => {
    if (isOwnProfile && user) {
      return {
        displayName: user.displayName,
        profilePicture: user.profilePicture,
        country: user.country,
        city: user.city,
        cars: user.cars || [],
        carBrand: user.carBrand,
        carModel: user.carModel,
        carPicture: user.carPicture,
        bio: user.bio,
        createdAt: user.createdAt,
      };
    }

    if (!isOwnProfile && remoteProfileQuery.data) {
      const p = remoteProfileQuery.data;
      return {
        displayName: p.displayName,
        profilePicture: p.profilePicture ?? undefined,
        country: p.country,
        city: p.city,
        carBrand: p.carBrand,
        carModel: p.carModel,
        carPicture: p.carPicture ?? undefined,
        bio: p.bio,
        cars: p.cars ?? undefined,
        createdAt: p.createdAt,
      };
    }

    return null;
  }, [isOwnProfile, user, remoteProfileQuery.data]);

  const handleShareProfile = useCallback(async () => {
    const targetName = profileUser?.displayName || 'this driver';
    try {
      await Share.share({
        message: `Check out ${targetName}'s profile on RedLine! ${profileUrl}`,
        url: profileUrl,
      });
    } catch (error) {
      console.error('[PROFILE] Share error:', error);
    }
  }, [profileUser?.displayName, profileUrl]);

  const profileTrips = useMemo(() => {
    if (isOwnProfile) return ownTrips;
    if (remoteTripsQuery.data) {
      return remoteTripsQuery.data.map(t => ({
        ...t,
        locations: [] as Array<{ latitude: number; longitude: number; speed: number | null; timestamp: number }>,
      }));
    }
    return [] as TripStats[];
  }, [isOwnProfile, ownTrips, remoteTripsQuery.data]);

  const isLoadingRemote = !isOwnProfile && (remoteProfileQuery.isLoading || remoteTripsQuery.isLoading);

  const carStats = useMemo((): CarStats[] => {
    if (!profileUser) return [];

    const carMap = new Map<string, { brand: string; model: string; picture?: string; trips: TripStats[] }>();

    if (profileUser.cars && profileUser.cars.length > 0) {
      for (const car of profileUser.cars) {
        const key = `${car.brand} ${car.model}`;
        const pic = car.picture || (car.isPrimary ? profileUser.carPicture : undefined);
        carMap.set(key, { brand: car.brand, model: car.model, picture: pic || undefined, trips: [] });
      }
    } else if (profileUser.carBrand) {
      const key = `${profileUser.carBrand} ${profileUser.carModel || ''}`.trim();
      carMap.set(key, { brand: profileUser.carBrand, model: profileUser.carModel || '', picture: profileUser.carPicture, trips: [] });
    }

    for (const trip of profileTrips) {
      if (trip.carModel) {
        const existing = carMap.get(trip.carModel);
        if (existing) {
          existing.trips.push(trip);
        } else {
          const parts = trip.carModel.split(' ');
          const brand = parts[0];
          const model = parts.slice(1).join(' ');
          carMap.set(trip.carModel, { brand, model, trips: [trip] });
        }
      } else {
        const firstKey = carMap.keys().next().value;
        if (firstKey) {
          carMap.get(firstKey)!.trips.push(trip);
        }
      }
    }

    const result: CarStats[] = [];
    for (const [key, data] of carMap) {
      const t = data.trips;
      let topCornerSpeed = 0;
      for (const trip of t) {
        if (trip.corners > 0 && trip.avgSpeed > 0) {
          const cornerSpeed = trip.avgSpeed * 0.7;
          if (cornerSpeed > topCornerSpeed) topCornerSpeed = cornerSpeed;
        }
        if (trip.topSpeed > 0 && trip.corners > 0) {
          const estimatedCornerSpeed = trip.topSpeed * 0.45;
          if (estimatedCornerSpeed > topCornerSpeed) topCornerSpeed = estimatedCornerSpeed;
        }
      }

      result.push({
        carKey: key,
        brand: data.brand,
        model: data.model,
        picture: data.picture,
        totalTrips: t.length,
        totalDistance: t.reduce((sum, tr) => sum + tr.distance, 0),
        topSpeed: Math.max(0, ...t.map(tr => tr.topSpeed)),
        avgSpeed: t.length > 0 ? t.reduce((sum, tr) => sum + tr.avgSpeed, 0) / t.length : 0,
        topCornerSpeed,
        maxGForce: Math.max(0, ...t.map(tr => tr.maxGForce ?? 0)),
        best0to100: t.reduce((best: number | null, tr) => {
          if (!tr.time0to100 || tr.time0to100 <= 0) return best;
          return best === null ? tr.time0to100 : Math.min(best, tr.time0to100);
        }, null),
        best0to200: t.reduce((best: number | null, tr) => {
          if (!tr.time0to200 || tr.time0to200 <= 0) return best;
          return best === null ? tr.time0to200 : Math.min(best, tr.time0to200);
        }, null),
        totalDuration: t.reduce((sum, tr) => sum + tr.duration, 0),
        lastDriveDate: Math.max(0, ...t.map(tr => tr.startTime)),
      });
    }

    result.sort((a, b) => b.totalTrips - a.totalTrips);
    return result;
  }, [profileUser, profileTrips]);

  const toggleCar = useCallback((carKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCarKey(prev => prev === carKey ? null : carKey);
  }, []);

  const totalTrips = profileTrips.length;
  const totalDistance = profileTrips.reduce((sum, t) => sum + t.distance, 0);
  const overallTopSpeed = Math.max(0, ...profileTrips.map(t => t.topSpeed));

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const memberSince = profileUser?.createdAt
    ? new Date(profileUser.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  if (isLoadingRemote) {
    return (
      <>
        <Stack.Screen options={{ title: 'Profile', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.emptyText, { marginTop: 12 }]}>Loading profile...</Text>
        </View>
      </>
    );
  }

  if (!profileUser) {
    return (
      <>
        <Stack.Screen options={{ title: 'Profile', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />
        <View style={[styles.container, styles.centered]}>
          <Text style={styles.emptyText}>Profile not available</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontSize: 16, fontWeight: '600' as const },
        }}
      />
      <Modal
        visible={showQRModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQRModal(false)}
      >
        <TouchableOpacity
          style={styles.qrModalOverlay}
          activeOpacity={1}
          onPress={() => setShowQRModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.qrModalContent}>
            <View style={styles.qrModalHeader}>
              <Text style={styles.qrModalTitle}>Scan to Follow</Text>
              <TouchableOpacity
                onPress={() => setShowQRModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={22} color={colors.textLight} />
              </TouchableOpacity>
            </View>
            <View style={styles.qrCodeWrapper}>
              {qrCodeUrl ? (
                <Image
                  source={{ uri: qrCodeUrl }}
                  style={styles.qrCodeImage}
                  resizeMode="contain"
                />
              ) : (
                <ActivityIndicator size="large" color={colors.accent} />
              )}
            </View>
            <Text style={styles.qrUserName}>{profileUser?.displayName}</Text>
            {(profileUser?.city || profileUser?.country) && (
              <View style={styles.qrLocationRow}>
                <MapPin size={12} color={colors.accent} />
                <Text style={styles.qrLocationText}>
                  {profileUser?.city}{profileUser?.city && profileUser?.country ? ', ' : ''}{profileUser?.country}
                </Text>
              </View>
            )}
            <Text style={styles.qrHint}>Point your camera at this code to open this profile</Text>
            <TouchableOpacity style={styles.qrShareButton} onPress={handleShareProfile} activeOpacity={0.7}>
              <Share2 size={16} color="#fff" />
              <Text style={styles.qrShareButtonText}>Share Link</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarWrapper}>
            {profileUser.profilePicture ? (
              <Image source={{ uri: profileUser.profilePicture }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                  {profileUser.displayName[0].toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.displayName}>{profileUser.displayName}</Text>
          {(profileUser.city || profileUser.country) && (
            <View style={styles.locationRow}>
              <MapPin size={14} color={colors.accent} />
              <Text style={styles.locationText}>
                {profileUser.city}{profileUser.city && profileUser.country ? ', ' : ''}{profileUser.country}
              </Text>
            </View>
          )}
          {profileUser.bio ? (
            <Text style={styles.bioText}>{profileUser.bio}</Text>
          ) : null}
          {memberSince ? (
            <View style={styles.memberRow}>
              <Calendar size={12} color={colors.textLight} />
              <Text style={styles.memberText}>Member since {memberSince}</Text>
            </View>
          ) : null}

          <View style={styles.profileActions}>
            <TouchableOpacity style={styles.profileActionButton} onPress={handleShareProfile} activeOpacity={0.7} testID="share-profile-button">
              <Share2 size={16} color={colors.accent} />
              <Text style={styles.profileActionText}>Share</Text>
            </TouchableOpacity>
            {isOwnProfile && (
              <TouchableOpacity style={styles.profileActionButton} onPress={handleShowQR} activeOpacity={0.7} testID="qr-code-button">
                <QrCode size={16} color={colors.accent} />
                <Text style={styles.profileActionText}>Share Profile</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.followRow}>
          <View style={styles.followStat}>
            <Text style={styles.followCount}>{followCountsQuery.data?.followers ?? 0}</Text>
            <Text style={styles.followLabel}>Followers</Text>
          </View>
          <View style={styles.followStat}>
            <Text style={styles.followCount}>{followCountsQuery.data?.following ?? 0}</Text>
            <Text style={styles.followLabel}>Following</Text>
          </View>
          {!isOwnProfile && userId && (
            <TouchableOpacity
              style={[
                styles.followButton,
                isFollowingQuery.data?.following && styles.followButtonActive,
              ]}
              onPress={handleFollowToggle}
              disabled={followMutation.isPending || unfollowMutation.isPending}
              activeOpacity={0.7}
              testID="follow-button"
            >
              {followMutation.isPending || unfollowMutation.isPending ? (
                <ActivityIndicator size="small" color={isFollowingQuery.data?.following ? colors.accent : '#fff'} />
              ) : isFollowingQuery.data?.following ? (
                <>
                  <UserMinus size={16} color={colors.accent} />
                  <Text style={styles.followButtonTextActive}>Following</Text>
                </>
              ) : (
                <>
                  <UserPlus size={16} color="#fff" />
                  <Text style={styles.followButtonText}>Follow</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.overviewRow}>
          <View style={styles.overviewCard}>
            <Route size={18} color={colors.accent} />
            <Text style={styles.overviewValue}>{totalTrips}</Text>
            <Text style={styles.overviewLabel}>Trips</Text>
          </View>
          <View style={styles.overviewCard}>
            <Navigation size={18} color={colors.primary} />
            <Text style={styles.overviewValue}>{convertDistance(totalDistance).toFixed(0)}</Text>
            <Text style={styles.overviewLabel}>{getDistanceLabel()}</Text>
          </View>
          <View style={styles.overviewCard}>
            <Zap size={18} color={colors.warning} />
            <Text style={styles.overviewValue}>{Math.round(convertSpeed(overallTopSpeed))}</Text>
            <Text style={styles.overviewLabel}>{getSpeedLabel()}</Text>
          </View>
        </View>

        {carStats.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Car size={18} color={colors.text} />
              <Text style={styles.sectionTitle}>Garage</Text>
            </View>

            <View style={styles.garageList}>
              {carStats.map((car) => {
                const isExpanded = expandedCarKey === car.carKey;
                return (
                  <View key={car.carKey} style={[styles.garageItem, isExpanded && styles.garageItemExpanded]}>
                    <TouchableOpacity
                      style={styles.garageItemRow}
                      onPress={() => toggleCar(car.carKey)}
                      activeOpacity={0.7}
                    >
                      {car.picture ? (
                        <Image source={{ uri: car.picture }} style={styles.garageItemImage} />
                      ) : (
                        <View style={styles.garageItemImagePlaceholder}>
                          <Car size={22} color={isExpanded ? colors.accent : colors.textLight} />
                        </View>
                      )}
                      <View style={styles.garageItemInfo}>
                        <Text style={styles.garageItemBrand}>{car.brand}</Text>
                        <Text style={styles.garageItemModel}>{car.model}</Text>
                        {car.totalTrips > 0 && (
                          <Text style={styles.garageItemTrips}>{car.totalTrips} {car.totalTrips === 1 ? 'trip' : 'trips'}</Text>
                        )}
                      </View>
                      <View style={[styles.garageChevron, isExpanded && styles.garageChevronExpanded]}>
                        <ChevronDown size={18} color={colors.textLight} />
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.garageStatsPanel}>
                        {car.lastDriveDate > 0 && (
                          <Text style={styles.garageLastDrive}>
                            Last drive: {new Date(car.lastDriveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Text>
                        )}
                        {car.totalTrips === 0 ? (
                          <View style={styles.garageNoStats}>
                            <Car size={24} color={colors.textLight} />
                            <Text style={styles.garageNoStatsText}>No trips recorded yet</Text>
                          </View>
                        ) : (
                          <View style={styles.statsGrid}>
                            <View style={styles.statItem}>
                              <View style={[styles.statIconBg, { backgroundColor: colors.warning + '20' }]}>
                                <Zap size={18} color={colors.warning} />
                              </View>
                              <View style={styles.statTextGroup}>
                                <Text style={styles.statValue}>{Math.round(convertSpeed(car.topSpeed))} {getSpeedLabel()}</Text>
                                <Text style={styles.statLabel}>Top Speed</Text>
                              </View>
                            </View>
                            <View style={styles.statItem}>
                              <View style={[styles.statIconBg, { backgroundColor: colors.accent + '20' }]}>
                                <Navigation size={18} color={colors.accent} />
                              </View>
                              <View style={styles.statTextGroup}>
                                <Text style={styles.statValue}>{convertDistance(car.totalDistance).toFixed(1)} {getDistanceLabel()}</Text>
                                <Text style={styles.statLabel}>Distance</Text>
                              </View>
                            </View>
                            <View style={styles.statItem}>
                              <View style={[styles.statIconBg, { backgroundColor: colors.accent + '20' }]}>
                                <Route size={18} color={colors.accent} />
                              </View>
                              <View style={styles.statTextGroup}>
                                <Text style={styles.statValue}>{car.totalTrips}</Text>
                                <Text style={styles.statLabel}>Trips</Text>
                              </View>
                            </View>
                            <View style={styles.statItem}>
                              <View style={[styles.statIconBg, { backgroundColor: colors.success + '20' }]}>
                                <Gauge size={18} color={colors.success} />
                              </View>
                              <View style={styles.statTextGroup}>
                                <Text style={styles.statValue}>{Math.round(convertSpeed(car.avgSpeed))} {getSpeedLabel()}</Text>
                                <Text style={styles.statLabel}>Avg Speed</Text>
                              </View>
                            </View>
                            <View style={styles.statItem}>
                              <View style={[styles.statIconBg, { backgroundColor: colors.primary + '20' }]}>
                                <CornerDownRight size={18} color={colors.primary} />
                              </View>
                              <View style={styles.statTextGroup}>
                                <Text style={styles.statValue}>
                                  {car.topCornerSpeed > 0 ? `${Math.round(convertSpeed(car.topCornerSpeed))} ${getSpeedLabel()}` : '—'}
                                </Text>
                                <Text style={styles.statLabel}>Corner Speed</Text>
                              </View>
                            </View>
                            <View style={styles.statItem}>
                              <View style={[styles.statIconBg, { backgroundColor: colors.danger + '20' }]}>
                                <Activity size={18} color={colors.danger} />
                              </View>
                              <View style={styles.statTextGroup}>
                                <Text style={styles.statValue}>{car.maxGForce > 0 ? `${car.maxGForce.toFixed(2)} G` : '—'}</Text>
                                <Text style={styles.statLabel}>Max G-Force</Text>
                              </View>
                            </View>
                            <View style={styles.statItem}>
                              <View style={[styles.statIconBg, { backgroundColor: colors.warning + '20' }]}>
                                <Timer size={18} color={colors.warning} />
                              </View>
                              <View style={styles.statTextGroup}>
                                <Text style={styles.statValue}>{car.best0to100 ? `${car.best0to100.toFixed(2)}s` : '—'}</Text>
                                <Text style={styles.statLabel}>0-100</Text>
                              </View>
                            </View>
                            {car.best0to200 && (
                              <View style={styles.statItem}>
                                <View style={[styles.statIconBg, { backgroundColor: colors.accent + '20' }]}>
                                  <Timer size={18} color={colors.accent} />
                                </View>
                                <View style={styles.statTextGroup}>
                                  <Text style={styles.statValue}>{car.best0to200.toFixed(2)}s</Text>
                                  <Text style={styles.statLabel}>0-200</Text>
                                </View>
                              </View>
                            )}
                            <View style={styles.statItem}>
                              <View style={[styles.statIconBg, { backgroundColor: colors.textLight + '20' }]}>
                                <Trophy size={18} color={colors.textLight} />
                              </View>
                              <View style={styles.statTextGroup}>
                                <Text style={styles.statValue}>{formatDuration(car.totalDuration)}</Text>
                                <Text style={styles.statLabel}>Drive Time</Text>
                              </View>
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        <AchievementShowcase
          isOwnProfile={isOwnProfile}
          ownUnlockedAchievements={unlockedAchievements}
          ownUnlockedCount={unlockedCount}
          ownTotalCount={totalCount}
          ownStreak={streak}
          remoteAchievements={remoteAchievementsQuery.data}
          colors={colors}
          styles={styles}
        />

        {carStats.length === 0 && !isOwnProfile && profileUser.carBrand && (
          <View style={styles.noStatsCard}>
            <Car size={40} color={colors.accent} />
            <Text style={styles.noStatsCarName}>
              {profileUser.carBrand}{profileUser.carModel ? ` ${profileUser.carModel}` : ''}
            </Text>
            <Text style={styles.noStatsSubtext}>No trip data available</Text>
          </View>
        )}

        {carStats.length === 0 && (isOwnProfile || !profileUser.carBrand) && (
          <View style={styles.noStatsCard}>
            <Car size={40} color={colors.textLight} />
            <Text style={styles.noStatsText}>No cars in garage</Text>
            <Text style={styles.noStatsSubtext}>
              {isOwnProfile ? 'Add a car in your profile to see stats' : 'This user has no cars listed'}
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  avatarWrapper: {
    marginBottom: 14,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.cardLight,
    borderWidth: 3,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 32,
    fontFamily: 'Orbitron_700Bold',
    color: colors.accent,
  },
  displayName: {
    fontSize: 20,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    marginBottom: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  locationText: {
    fontSize: 13,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  memberText: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  bioText: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    textAlign: 'center' as const,
    marginBottom: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  followRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 20,
  },
  followStat: {
    alignItems: 'center',
  },
  followCount: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  followLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 2,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 110,
    justifyContent: 'center',
  },
  followButtonActive: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  followButtonText: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: '#FFFFFF',
  },
  followButtonTextActive: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.accent,
  },
  overviewRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 24,
  },
  overviewCard: {
    flex: 1,
    backgroundColor: colors.cardLight,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overviewValue: {
    fontSize: 18,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  overviewLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  garageList: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  garageItem: {
    backgroundColor: colors.cardLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  garageItemExpanded: {
    borderColor: colors.accent,
  },
  garageItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  garageItemImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  garageItemImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  garageItemInfo: {
    flex: 1,
    gap: 2,
  },
  garageItemBrand: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  garageItemModel: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  garageItemTrips: {
    fontSize: 10,
    fontFamily: 'Orbitron_500Medium',
    color: colors.accent,
    marginTop: 2,
  },
  garageChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  garageChevronExpanded: {
    transform: [{ rotate: '180deg' }],
    backgroundColor: colors.accent + '20',
  },
  garageStatsPanel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
  },
  garageLastDrive: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginBottom: 12,
  },
  garageNoStats: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  garageNoStatsText: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statItem: {
    width: '47%' as any,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statTextGroup: {
    flex: 1,
  },
  statValue: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 2,
  },
  noStatsCard: {
    marginHorizontal: 16,
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  noStatsText: {
    fontSize: 14,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
    textAlign: 'center',
  },
  noStatsCarName: {
    fontSize: 16,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    textAlign: 'center',
  },
  noStatsSubtext: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
  },
  profileActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  profileActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent + '15',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  profileActionText: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.accent,
  },
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  qrModalContent: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  qrModalTitle: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  qrCodeWrapper: {
    width: 240,
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  qrCodeImage: {
    width: 240,
    height: 240,
  },
  qrUserName: {
    fontSize: 18,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    marginBottom: 4,
  },
  qrLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  qrLocationText: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  qrHint: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    textAlign: 'center' as const,
    marginBottom: 16,
    paddingHorizontal: 10,
    lineHeight: 16,
  },
  qrShareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  qrShareButtonText: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: '#FFFFFF',
  },
});
