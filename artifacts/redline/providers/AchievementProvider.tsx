import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { ACHIEVEMENTS } from '@/constants/achievements';
import { getEarnedBadges, getHighestBadge, getNextBadge } from '@/constants/badges';
import { UserAchievement, AchievementProgress } from '@/types/achievement';
import { TripStats } from '@/types/trip';
import { trpcClient } from '@/lib/trpc';
import { useUser } from '@/providers/UserProvider';

const ACHIEVEMENTS_KEY = 'user_achievements';
const STREAK_KEY = 'driving_streak';

interface StreakData {
  currentStreak: number;
  lastDriveDate: string;
  longestStreak: number;
}

function getDateString(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const [AchievementProvider, useAchievements] = createContextHook(() => {
  const [unlockedAchievements, setUnlockedAchievements] = useState<UserAchievement[]>([]);
  const [streak, setStreak] = useState<StreakData>({ currentStreak: 0, lastDriveDate: '', longestStreak: 0 });
  const [newlyUnlocked, setNewlyUnlocked] = useState<string[]>([]);
  const [pendingCongrats, setPendingCongrats] = useState<string | null>(null);
  const unlockedRef = useRef<UserAchievement[]>([]);
  const { user } = useUser();
  const backendSyncDone = useRef(false);

  useEffect(() => {
    void loadAchievements();
    void loadStreak();
  }, []);

  useEffect(() => {
    unlockedRef.current = unlockedAchievements;
  }, [unlockedAchievements]);

  useEffect(() => {
    if (!user?.id || backendSyncDone.current) return;
    backendSyncDone.current = true;
    void fetchAndMergeFromBackend(user.id);
  }, [user?.id]);

  const fetchWithRetry = async <T,>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T | null> => {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (error) {
        const isLast = i === retries;
        console.warn(`[ACHIEVEMENTS] Fetch attempt ${i + 1}/${retries + 1} failed:`, error instanceof Error ? error.message : 'Unknown error');
        if (isLast) return null;
        await new Promise(r => setTimeout(r, delay * (i + 1)));
      }
    }
    return null;
  };

  const fetchAndMergeFromBackend = async (userId: string) => {
    try {
      console.log('[ACHIEVEMENTS] Fetching from backend for user:', userId);
      const remote = await fetchWithRetry(() => trpcClient.social.getUserAchievements.query({ userId }));
      if (!remote || remote.length === 0) {
        console.log('[ACHIEVEMENTS] No remote achievements found');
        return;
      }
      console.log('[ACHIEVEMENTS] Remote achievements count:', remote.length);

      const local = unlockedRef.current;
      const localMap = new Map(local.map(a => [a.achievementId, a]));

      let changed = false;
      for (const r of remote) {
        if (!localMap.has(r.achievementId)) {
          localMap.set(r.achievementId, {
            achievementId: r.achievementId,
            unlockedAt: r.unlockedAt,
            progress: 0,
          });
          changed = true;
        }
      }

      if (changed) {
        const merged = Array.from(localMap.values());
        console.log('[ACHIEVEMENTS] Merged local+remote, total:', merged.length);
        await saveAchievements(merged);
      } else {
        console.log('[ACHIEVEMENTS] Local already up to date');
      }
    } catch (error) {
      console.warn('[ACHIEVEMENTS] Failed to fetch from backend, will retry on next app launch:', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const loadAchievements = async () => {
    try {
      const stored = await AsyncStorage.getItem(ACHIEVEMENTS_KEY);
      if (stored) {
        const parsed: UserAchievement[] = JSON.parse(stored);
        setUnlockedAchievements(parsed);
        unlockedRef.current = parsed;
      }
    } catch (error) {
      console.error('[ACHIEVEMENTS] Failed to load:', error);
    }
  };

  const loadStreak = async () => {
    try {
      const stored = await AsyncStorage.getItem(STREAK_KEY);
      if (stored) {
        setStreak(JSON.parse(stored));
      }
    } catch (error) {
      console.error('[ACHIEVEMENTS] Failed to load streak:', error);
    }
  };

  const saveAchievements = async (achievements: UserAchievement[]) => {
    try {
      await AsyncStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(achievements));
      setUnlockedAchievements(achievements);
      unlockedRef.current = achievements;
    } catch (error) {
      console.error('[ACHIEVEMENTS] Failed to save:', error);
    }
  };

  const saveStreak = async (data: StreakData) => {
    try {
      await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data));
      setStreak(data);
    } catch (error) {
      console.error('[ACHIEVEMENTS] Failed to save streak:', error);
    }
  };

  const syncAchievementsToBackend = useCallback(async (userId: string) => {
    try {
      const current = unlockedRef.current;
      await trpcClient.social.syncAchievements.mutate({
        userId,
        achievements: current.map(a => ({
          achievementId: a.achievementId,
          unlockedAt: a.unlockedAt,
        })),
      });
      console.log('[ACHIEVEMENTS] Synced to backend');
    } catch (error) {
      console.error('[ACHIEVEMENTS] Failed to sync to backend:', error);
    }
  }, []);

  const unlockAchievement = useCallback(async (achievementId: string, progress: number) => {
    const current = unlockedRef.current;
    if (current.some(a => a.achievementId === achievementId)) {
      return false;
    }

    const newAchievement: UserAchievement = {
      achievementId,
      unlockedAt: Date.now(),
      progress,
    };

    const updated = [...current, newAchievement];
    await saveAchievements(updated);
    setNewlyUnlocked(prev => [...prev, achievementId]);
    setPendingCongrats(achievementId);

    const def = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (def) {
      console.log('[ACHIEVEMENTS] Unlocked:', def.title);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Notifications.scheduleNotificationAsync({
          content: {
            title: '🏆 Achievement Unlocked!',
            body: `${def.title} — ${def.description}`,
            sound: true,
            data: { type: 'achievement_unlocked', achievementId: def.id },
          },
          trigger: null,
        }).catch((err) => console.error('[ACHIEVEMENTS] Failed to send notification:', err));
      }
    }

    return true;
  }, []);

  const updateStreak = useCallback(async (tripEndTime: number) => {
    const today = getDateString(tripEndTime);
    const yesterday = getDateString(tripEndTime - 86400000);

    let newStreak: StreakData;

    if (streak.lastDriveDate === today) {
      return streak;
    } else if (streak.lastDriveDate === yesterday) {
      const newCount = streak.currentStreak + 1;
      newStreak = {
        currentStreak: newCount,
        lastDriveDate: today,
        longestStreak: Math.max(streak.longestStreak, newCount),
      };
    } else {
      newStreak = {
        currentStreak: 1,
        lastDriveDate: today,
        longestStreak: Math.max(streak.longestStreak, 1),
      };
    }

    await saveStreak(newStreak);
    return newStreak;
  }, [streak]);

  const checkTripAchievements = useCallback(async (
    trip: TripStats,
    allTrips: TripStats[],
    userId?: string
  ) => {
    console.log('[ACHIEVEMENTS] Checking achievements for trip:', trip.id);
    const newUnlocks: string[] = [];

    if (trip.topSpeed >= 100) {
      if (await unlockAchievement('speed_100', trip.topSpeed)) {
        newUnlocks.push('speed_100');
      }
    }

    const totalTrips = allTrips.length;
    if (totalTrips >= 1) {
      if (await unlockAchievement('distance_first', 1)) {
        newUnlocks.push('distance_first');
      }
    }

    const totalDistance = allTrips.reduce((sum, t) => sum + t.distance, 0);
    if (totalDistance >= 100) {
      if (await unlockAchievement('distance_100', totalDistance)) {
        newUnlocks.push('distance_100');
      }
    }
    if (totalDistance >= 1000) {
      if (await unlockAchievement('distance_1000', totalDistance)) {
        newUnlocks.push('distance_1000');
      }
    }
    if (totalDistance >= 10000) {
      if (await unlockAchievement('distance_10000', totalDistance)) {
        newUnlocks.push('distance_10000');
      }
    }

    if (trip.distance >= 200) {
      if (await unlockAchievement('distance_single_200', trip.distance)) {
        newUnlocks.push('distance_single_200');
      }
    }

    if (totalTrips >= 5) {
      if (await unlockAchievement('trips_5', totalTrips)) {
        newUnlocks.push('trips_5');
      }
    }
    if (totalTrips >= 25) {
      if (await unlockAchievement('trips_25', totalTrips)) {
        newUnlocks.push('trips_25');
      }
    }
    if (totalTrips >= 100) {
      if (await unlockAchievement('trips_100', totalTrips)) {
        newUnlocks.push('trips_100');
      }
    }
    if (totalTrips >= 500) {
      if (await unlockAchievement('trips_500', totalTrips)) {
        newUnlocks.push('trips_500');
      }
    }

    const updatedStreak = await updateStreak(trip.endTime ?? Date.now());
    if (updatedStreak.currentStreak >= 3) {
      if (await unlockAchievement('streak_3', updatedStreak.currentStreak)) {
        newUnlocks.push('streak_3');
      }
    }
    if (updatedStreak.currentStreak >= 7) {
      if (await unlockAchievement('streak_7', updatedStreak.currentStreak)) {
        newUnlocks.push('streak_7');
      }
    }
    if (updatedStreak.currentStreak >= 30) {
      if (await unlockAchievement('streak_30', updatedStreak.currentStreak)) {
        newUnlocks.push('streak_30');
      }
    }

    if ((trip.maxGForce ?? 0) >= 1.0) {
      if (await unlockAchievement('perf_gforce', trip.maxGForce ?? 0)) {
        newUnlocks.push('perf_gforce');
      }
    }
    if (trip.corners >= 50) {
      if (await unlockAchievement('perf_corners_50', trip.corners)) {
        newUnlocks.push('perf_corners_50');
      }
    }
    if (trip.corners >= 100) {
      if (await unlockAchievement('perf_corners_100', trip.corners)) {
        newUnlocks.push('perf_corners_100');
      }
    }
    if (trip.time0to100 && trip.time0to100 > 0 && trip.time0to100 < 6) {
      if (await unlockAchievement('perf_quick_launch', trip.time0to100)) {
        newUnlocks.push('perf_quick_launch');
      }
    }

    const tripEndHour = new Date(trip.endTime ?? Date.now()).getHours();
    if (tripEndHour >= 0 && tripEndHour < 5) {
      if (await unlockAchievement('perf_night_owl', 1)) {
        newUnlocks.push('perf_night_owl');
      }
    }

    if (trip.duration >= 7200) {
      if (await unlockAchievement('perf_marathon', trip.duration)) {
        newUnlocks.push('perf_marathon');
      }
    }

    if (newUnlocks.length > 0 && userId) {
      syncAchievementsToBackend(userId).catch(console.error);
    }

    if (newUnlocks.length > 0) {
      const titles = newUnlocks
        .map(id => ACHIEVEMENTS.find(a => a.id === id)?.title)
        .filter(Boolean);
      console.log('[ACHIEVEMENTS] Newly unlocked:', titles.join(', '));
    }

    return newUnlocks;
  }, [unlockAchievement, updateStreak, syncAchievementsToBackend]);

  const checkSocialAchievements = useCallback(async (followingCount: number, followersCount: number, userId?: string) => {
    const newUnlocks: string[] = [];

    if (followingCount >= 5) {
      if (await unlockAchievement('social_follow_5', followingCount)) {
        newUnlocks.push('social_follow_5');
      }
    }
    if (followingCount >= 25) {
      if (await unlockAchievement('social_follow_25', followingCount)) {
        newUnlocks.push('social_follow_25');
      }
    }
    if (followersCount >= 10) {
      if (await unlockAchievement('social_followers_10', followersCount)) {
        newUnlocks.push('social_followers_10');
      }
    }
    if (followersCount >= 50) {
      if (await unlockAchievement('social_followers_50', followersCount)) {
        newUnlocks.push('social_followers_50');
      }
    }

    if (newUnlocks.length > 0 && userId) {
      syncAchievementsToBackend(userId).catch(console.error);
    }

    return newUnlocks;
  }, [unlockAchievement, syncAchievementsToBackend]);

  const getAchievementProgress = useCallback((): AchievementProgress[] => {
    return ACHIEVEMENTS.map(def => {
      const unlocked = unlockedAchievements.find(a => a.achievementId === def.id);
      return {
        definition: def,
        progress: unlocked?.progress ?? 0,
        isUnlocked: !!unlocked,
        unlockedAt: unlocked?.unlockedAt,
      };
    });
  }, [unlockedAchievements]);

  const clearNewlyUnlocked = useCallback(() => {
    setNewlyUnlocked([]);
  }, []);

  const clearPendingCongrats = useCallback(() => {
    setPendingCongrats(null);
  }, []);

  const unlockedCount = unlockedAchievements.length;
  const totalCount = ACHIEVEMENTS.length;

  const earnedBadges = useMemo(() => getEarnedBadges(unlockedCount, totalCount), [unlockedCount, totalCount]);
  const highestBadge = useMemo(() => getHighestBadge(unlockedCount, totalCount), [unlockedCount, totalCount]);
  const nextBadge = useMemo(() => getNextBadge(unlockedCount, totalCount), [unlockedCount, totalCount]);
  const completionPercent = useMemo(() => totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0, [unlockedCount, totalCount]);

  return useMemo(() => ({
    unlockedAchievements,
    streak,
    newlyUnlocked,
    pendingCongrats,
    unlockedCount,
    totalCount,
    earnedBadges,
    highestBadge,
    nextBadge,
    completionPercent,
    checkTripAchievements,
    checkSocialAchievements,
    getAchievementProgress,
    clearNewlyUnlocked,
    clearPendingCongrats,
    syncAchievementsToBackend,
  }), [
    unlockedAchievements,
    streak,
    newlyUnlocked,
    pendingCongrats,
    unlockedCount,
    totalCount,
    earnedBadges,
    highestBadge,
    nextBadge,
    completionPercent,
    checkTripAchievements,
    checkSocialAchievements,
    getAchievementProgress,
    clearNewlyUnlocked,
    clearPendingCongrats,
    syncAchievementsToBackend,
  ]);
});
