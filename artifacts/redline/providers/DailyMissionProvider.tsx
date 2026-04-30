import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { DAILY_MISSIONS, getMissionForDate } from '@/constants/missions';
import { DailyMission, DailyMissionState } from '@/types/mission';
import { TripStats } from '@/types/trip';
import { useTrips } from '@/providers/TripProvider';

const STATE_KEY = 'daily_mission_state';
const POINTS_KEY = 'daily_mission_points';

function getDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tripIsFromDate(trip: TripStats, date: Date): boolean {
  const t = new Date(trip.startTime);
  return (
    t.getFullYear() === date.getFullYear() &&
    t.getMonth() === date.getMonth() &&
    t.getDate() === date.getDate()
  );
}

function computeProgress(mission: DailyMission, todaysTrips: TripStats[]): number {
  if (todaysTrips.length === 0) return 0;
  switch (mission.metric) {
    case 'anyDrive':
      return todaysTrips.length >= 1 ? 1 : 0;
    case 'topSpeedKmh':
      return Math.max(...todaysTrips.map(t => t.topSpeed));
    case 'distanceKm': {
      if (mission.id === 'distance_10') {
        return todaysTrips.reduce((sum, t) => sum + t.distance, 0);
      }
      return Math.max(...todaysTrips.map(t => t.distance));
    }
    case 'durationSec':
      return Math.max(...todaysTrips.map(t => t.duration));
    case 'corners':
      return Math.max(...todaysTrips.map(t => t.corners));
    case 'maxGForce':
      return Math.max(...todaysTrips.map(t => t.maxGForce ?? 0));
    case 'accel0to100': {
      const times = todaysTrips.map(t => t.time0to100).filter((x): x is number => !!x && x > 0);
      if (times.length === 0) return 0;
      return Math.min(...times);
    }
    case 'nightDrive': {
      const any = todaysTrips.some(t => {
        const h = new Date(t.startTime).getHours();
        return h >= 21 || h < 5;
      });
      return any ? 1 : 0;
    }
    default:
      return 0;
  }
}

function isMet(mission: DailyMission, progress: number): boolean {
  if (mission.metric === 'accel0to100') {
    return progress > 0 && progress <= mission.target;
  }
  return progress >= mission.target;
}

export const [DailyMissionProvider, useDailyMission] = createContextHook(() => {
  const { trips } = useTrips();
  const [state, setState] = useState<DailyMissionState | null>(null);
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);
  const notifiedRef = useRef(false);

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const mission = useMemo(() => getMissionForDate(today), [today]);

  useEffect(() => {
    const load = async () => {
      try {
        const [storedStateRaw, storedPointsRaw] = await Promise.all([
          AsyncStorage.getItem(STATE_KEY),
          AsyncStorage.getItem(POINTS_KEY),
        ]);

        if (storedPointsRaw) {
          const parsed = parseInt(storedPointsRaw, 10);
          if (!Number.isNaN(parsed)) setTotalPoints(parsed);
        }

        if (storedStateRaw) {
          const parsed: DailyMissionState = JSON.parse(storedStateRaw);
          if (parsed.date === todayKey && parsed.missionId === mission.id) {
            setState(parsed);
          } else {
            const fresh: DailyMissionState = {
              date: todayKey,
              missionId: mission.id,
              completed: false,
              progress: 0,
            };
            setState(fresh);
            await AsyncStorage.setItem(STATE_KEY, JSON.stringify(fresh));
          }
        } else {
          const fresh: DailyMissionState = {
            date: todayKey,
            missionId: mission.id,
            completed: false,
            progress: 0,
          };
          setState(fresh);
          await AsyncStorage.setItem(STATE_KEY, JSON.stringify(fresh));
        }
      } catch (e) {
        console.error('[DAILY_MISSION] Failed to load state:', e);
      } finally {
        setLoaded(true);
      }
    };
    void load();
  }, [todayKey, mission.id]);

  const todaysTrips = useMemo(() => trips.filter(t => tripIsFromDate(t, today)), [trips, today]);
  const liveProgress = useMemo(() => computeProgress(mission, todaysTrips), [mission, todaysTrips]);
  const met = useMemo(() => isMet(mission, liveProgress), [mission, liveProgress]);

  useEffect(() => {
    if (!loaded || !state) return;
    if (state.completed) return;
    if (!met) {
      if (state.progress !== liveProgress) {
        const updated: DailyMissionState = { ...state, progress: liveProgress };
        setState(updated);
        AsyncStorage.setItem(STATE_KEY, JSON.stringify(updated)).catch(console.error);
      }
      return;
    }

    const updated: DailyMissionState = {
      ...state,
      completed: true,
      completedAt: Date.now(),
      progress: liveProgress,
    };
    setState(updated);
    AsyncStorage.setItem(STATE_KEY, JSON.stringify(updated)).catch(console.error);

    const newPoints = totalPoints + mission.reward;
    setTotalPoints(newPoints);
    AsyncStorage.setItem(POINTS_KEY, String(newPoints)).catch(console.error);

    if (!notifiedRef.current) {
      notifiedRef.current = true;
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Notifications.scheduleNotificationAsync({
          content: {
            title: `${mission.icon} Daily Mission Complete!`,
            body: `${mission.title} — +${mission.reward} pts`,
            sound: true,
            data: { type: 'daily_mission_complete', missionId: mission.id },
          },
          trigger: null,
        }).catch((err) => console.error('[DAILY_MISSION] notification failed:', err));
      }
    }
  }, [loaded, state, met, liveProgress, mission, totalPoints]);

  const progress = state?.progress ?? liveProgress;
  const completed = state?.completed ?? false;

  const progressPercent = useMemo(() => {
    if (completed) return 100;
    if (mission.metric === 'accel0to100') {
      if (progress <= 0) return 0;
      if (progress <= mission.target) return 100;
      const over = progress - mission.target;
      const pct = Math.max(0, 100 - (over / mission.target) * 100);
      return Math.min(100, Math.round(pct));
    }
    if (mission.target <= 0) return 0;
    return Math.min(100, Math.round((progress / mission.target) * 100));
  }, [progress, completed, mission]);

  const reset = useCallback(async () => {
    const fresh: DailyMissionState = {
      date: todayKey,
      missionId: mission.id,
      completed: false,
      progress: 0,
    };
    setState(fresh);
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(fresh));
    notifiedRef.current = false;
  }, [todayKey, mission.id]);

  return useMemo(() => ({
    mission,
    state,
    completed,
    progress,
    progressPercent,
    totalPoints,
    isLoading: !loaded,
    reset,
    allMissions: DAILY_MISSIONS,
  }), [mission, state, completed, progress, progressPercent, totalPoints, loaded, reset]);
});
