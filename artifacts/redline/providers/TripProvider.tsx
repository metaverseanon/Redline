import createContextHook from '@nkzw/create-context-hook';
import * as ExpoLocation from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Alert, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TripStats, Location as LocationType, TripLocation } from '@/types/trip';
import { getNearbyCameras, isSpeedCameraRestricted, SPEED_CAMERA_WARNING_RADIUS_KM } from '@/constants/speedCameras';
import { trpcClient } from '@/lib/trpc';
import { useUser } from '@/providers/UserProvider';

const TRIPS_KEY = 'trips';
const CURRENT_TRIP_KEY = 'current_trip';
const TRACKING_STATE_KEY = 'tracking_state';
const RECORDS_KEY = 'personal_records';
const TOTAL_DISTANCE_KEY = 'total_distance';
const SYNCED_TRIP_IDS_KEY = 'synced_trip_ids';
const SETTINGS_KEY = 'app_settings';

interface UnitPrefs {
  speedUnit: 'kmh' | 'mph';
  distanceUnit: 'km' | 'mi';
}

const getUnitPrefs = async (): Promise<UnitPrefs> => {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        speedUnit: parsed.speedUnit || 'kmh',
        distanceUnit: parsed.distanceUnit || 'km',
      };
    }
  } catch (e) {
    console.error('Failed to read unit preferences:', e);
  }
  return { speedUnit: 'kmh', distanceUnit: 'km' };
};

const formatSpeedWithUnit = (speedKmh: number, prefs: UnitPrefs): string => {
  if (prefs.speedUnit === 'mph') {
    return `${Math.round(speedKmh * 0.621371)} mph`;
  }
  return `${Math.round(speedKmh)} km/h`;
};

const formatDistanceWithUnit = (distanceKm: number, prefs: UnitPrefs): string => {
  if (prefs.distanceUnit === 'mi') {
    return `${(distanceKm * 0.621371).toFixed(1)} mi`;
  }
  return `${distanceKm.toFixed(1)} km`;
};

interface PersonalRecords {
  topSpeed: number;
  longestTrip: number;
  mostCorners: number;
  fastest0to100: number | null;
}

const sendLocalNotification = async (title: string, body: string, data?: Record<string, unknown>) => {
  if (Platform.OS === 'web') return;
  
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data,
      },
      trigger: null,
    });
    console.log('[NOTIFICATION] Sent:', title);
  } catch (error) {
    console.error('[NOTIFICATION] Failed to send:', error);
  }
};
const CORNER_THRESHOLD = 15;
const CORNER_ACCUMULATION_THRESHOLD = 45;
const CORNER_RESET_TIMEOUT = 3000;
const SPEED_NOISE_THRESHOLD = 5;
const BACKGROUND_LOCATION_TASK = 'background-location-task';
const SPEED_STALE_TIMEOUT = 3000;
const MAX_LOCATIONS_MEMORY = 5000;
const MAX_LOCATIONS_SAVE = 2000;
const CURRENT_SPEED_KEY = 'current_speed';
const LAST_LOCATION_TIME_KEY = 'last_location_time';

let backgroundLocationCallback: ((location: ExpoLocation.LocationObject) => void) | null = null;
let processLocationRef: ((location: ExpoLocation.LocationObject) => void) | null = null;

const downsampleLocations = (locations: LocationType[], maxPoints: number): LocationType[] => {
  if (locations.length <= maxPoints) return locations;
  const result: LocationType[] = [locations[0]];
  const step = (locations.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    const idx = Math.round(i * step);
    result.push(locations[idx]);
  }
  result.push(locations[locations.length - 1]);
  return result;
};

const saveBackgroundSpeed = async (speed: number, timestamp: number) => {
  try {
    await AsyncStorage.multiSet([
      [CURRENT_SPEED_KEY, speed.toString()],
      [LAST_LOCATION_TIME_KEY, timestamp.toString()],
    ]);
  } catch (e) {
    console.error('Failed to save background speed:', e);
  }
};

// CRITICAL: TaskManager.defineTask MUST be called at the top level of the module
// This is required by Expo - calling it inside functions/useEffect causes production crashes
if (Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.error('Background location task error:', error);
      return;
    }
    if (data) {
      const { locations } = data as { locations: ExpoLocation.LocationObject[] };
      if (locations && locations.length > 0) {
        console.log('Background task received locations:', locations.length);
        const latestLocation = locations[locations.length - 1];
        const rawSpeed = Math.max(0, (latestLocation.coords.speed ?? 0) * 3.6);
        const speed = rawSpeed < 5 ? 0 : rawSpeed;
        
        await saveBackgroundSpeed(speed, Date.now());
        
        for (const location of locations) {
          if (processLocationRef) {
            processLocationRef(location);
          } else if (backgroundLocationCallback) {
            backgroundLocationCallback(location);
          }
        }
      }
    }
  });
  console.log('Background location task defined at module level');
}

export const [TripProvider, useTrips] = createContextHook(() => {
  const { user } = useUser();
  const [trips, setTrips] = useState<TripStats[]>([]);
  const [currentTrip, setCurrentTrip] = useState<TripStats | null>(null);
  const [_cloudRestoreDone, setCloudRestoreDone] = useState(false);
  const cloudRestoreAttemptedRef = useRef(false);
  const [isTracking, setIsTracking] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<LocationType | null>(null);
  const [lastSavedTrip, setLastSavedTrip] = useState<TripStats | null>(null);
  const locationSubscription = useRef<ExpoLocation.LocationSubscription | null>(null);
  const isBackgroundEnabled = useRef<boolean>(false);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousHeading = useRef<number | null>(null);
  const accumulatedHeadingChange = useRef<number>(0);
  const lastCornerTime = useRef<number>(0);
  const previousSpeed = useRef<number>(0);
  const previousSpeedTime = useRef<number>(0);
  const currentTripRef = useRef<TripStats | null>(null);
  const tripsRef = useRef<TripStats[]>([]);
  const maxAcceleration = useRef<number>(0);
  const maxGForce = useRef<number>(0);
  const accelStartTime = useRef<number | null>(null);
  const reached100 = useRef<boolean>(false);
  const reached200 = useRef<boolean>(false);
  const reached300 = useRef<boolean>(false);
  const time0to100 = useRef<number | null>(null);
  const time0to200 = useRef<number | null>(null);
  const time0to300 = useRef<number | null>(null);
  const time100to200 = useRef<number | null>(null);
  const time100Start = useRef<number | null>(null);
  const driveStartTimestamp = useRef<number>(0);
  const standstillConfirmed = useRef<boolean>(false);
  const consecutiveLowSpeedReadings = useRef<number>(0);
  const detectedCameraIds = useRef<Set<string>>(new Set());
  const warnedCameraIds = useRef<Set<string>>(new Set());
  const speedCamerasCount = useRef<number>(0);
  const currentCountry = useRef<string | null>(null);
  const [speedCameraBlocked, setSpeedCameraBlocked] = useState(false);
  const currentSpeedRef = useRef<number>(0);
  const lastLocationUpdateTime = useRef<number>(0);
  const staleSpeedInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const isTrackingRef = useRef<boolean>(false);
  const pendingLocationsRef = useRef<LocationType[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveTimeRef = useRef<number>(0);

  const refreshSpeedFromStorage = useCallback(async () => {
    if (!isTrackingRef.current) return;
    
    try {
      const [[, speedStr], [, timeStr]] = await AsyncStorage.multiGet([CURRENT_SPEED_KEY, LAST_LOCATION_TIME_KEY]);
      const storedSpeed = speedStr ? parseFloat(speedStr) : 0;
      const storedTime = timeStr ? parseInt(timeStr, 10) : 0;
      const now = Date.now();
      
      console.log('Refreshing speed from storage:', storedSpeed, 'time since update:', now - storedTime, 'ms');
      
      if (storedTime > 0 && (now - storedTime) < SPEED_STALE_TIMEOUT) {
        setCurrentSpeed(storedSpeed);
        currentSpeedRef.current = storedSpeed;
        lastLocationUpdateTime.current = storedTime;
      } else {
        console.log('Stored speed is stale or missing, setting to 0');
        setCurrentSpeed(0);
        currentSpeedRef.current = 0;
      }
      
      const savedTrip = await AsyncStorage.getItem(CURRENT_TRIP_KEY);
      if (savedTrip) {
        const trip = JSON.parse(savedTrip) as TripStats;
        setCurrentTrip(trip);
      }
    } catch (e) {
      console.error('Failed to refresh speed from storage:', e);
    }
  }, []);

  const fetchFreshLocation = useCallback(async () => {
    if (!isTrackingRef.current || Platform.OS === 'web') return;
    
    try {
      console.log('Fetching fresh location after app resume');
      const location = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.BestForNavigation,
      });
      
      const rawSpeed = Math.max(0, (location.coords.speed ?? 0) * 3.6);
      const speed = rawSpeed < SPEED_NOISE_THRESHOLD ? 0 : rawSpeed;
      
      console.log('Fresh location speed:', speed);
      
      const now = Date.now();
      lastLocationUpdateTime.current = now;
      setCurrentSpeed(speed);
      currentSpeedRef.current = speed;
      
      await saveBackgroundSpeed(speed, now);
      
      processLocationUpdateBackground(location);
    } catch (error) {
      console.error('Failed to fetch fresh location:', error);
      setCurrentSpeed(0);
      currentSpeedRef.current = 0;
    }
    // processLocationUpdateBackground uses refs internally and is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      console.log('AppState changed from', appState.current, 'to', nextAppState);
      
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('App came to foreground, refreshing speed and fetching fresh location');
        
        await refreshSpeedFromStorage();
        
        fetchFreshLocation();
        
        if (isTrackingRef.current && staleSpeedInterval.current === null) {
          startStaleSpeedDetection();
        }
      }
      
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [refreshSpeedFromStorage, fetchFreshLocation]);

  useEffect(() => {
    loadTrips().then(() => {
      syncUnsyncedTrips();
    });
    restoreTrackingState();
    
    const syncRetryInterval = setInterval(() => {
      console.log('[TRIP_SYNC] Periodic sync check running...');
      syncUnsyncedTrips();
    }, 60000);
    
    return () => {
      backgroundLocationCallback = null;
      processLocationRef = null;
      clearInterval(syncRetryInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id || cloudRestoreAttemptedRef.current) return;
    cloudRestoreAttemptedRef.current = true;
    void restoreTripsFromCloud(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchWithRetry = async <T,>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T | null> => {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (error) {
        const isLast = i === retries;
        console.warn(`[CLOUD_RESTORE] Fetch attempt ${i + 1}/${retries + 1} failed:`, error instanceof Error ? error.message : 'Unknown error');
        if (isLast) return null;
        await new Promise(r => setTimeout(r, delay * (i + 1)));
      }
    }
    return null;
  };

  const restoreTripsFromCloud = async (userId: string) => {
    try {
      console.log('[CLOUD_RESTORE] Fetching trips from backend for user:', userId);
      const serverTrips = await fetchWithRetry(() => trpcClient.trips.getUserTrips.query({ userId }));
      
      if (!serverTrips || serverTrips.length === 0) {
        console.log('[CLOUD_RESTORE] No trips found on server');
        setCloudRestoreDone(true);
        return;
      }

      console.log('[CLOUD_RESTORE] Found', serverTrips.length, 'trips on server');

      const localTripsRaw = await AsyncStorage.getItem(TRIPS_KEY);
      const localTrips: TripStats[] = localTripsRaw ? JSON.parse(localTripsRaw) : [];
      const localTripIds = new Set(localTrips.map(t => t.id));

      const newTripsFromServer: TripStats[] = [];
      for (const serverTrip of serverTrips) {
        if (!localTripIds.has(serverTrip.id)) {
          const restored: TripStats = {
            id: serverTrip.id,
            startTime: serverTrip.startTime,
            endTime: serverTrip.endTime,
            distance: serverTrip.distance,
            duration: serverTrip.duration,
            avgSpeed: serverTrip.avgSpeed,
            topSpeed: serverTrip.topSpeed,
            corners: serverTrip.corners,
            carModel: serverTrip.carModel,
            locations: (serverTrip.routePoints || []).map((p: { latitude: number; longitude: number }) => ({
              latitude: p.latitude,
              longitude: p.longitude,
              speed: null,
              timestamp: serverTrip.startTime,
            })),
            acceleration: serverTrip.acceleration,
            maxGForce: serverTrip.maxGForce,
            location: serverTrip.location,
            time0to100: serverTrip.time0to100,
            time0to200: serverTrip.time0to200,
            time100to200: serverTrip.time100to200,
            time0to300: serverTrip.time0to300,
          };
          newTripsFromServer.push(restored);
        }
      }

      if (newTripsFromServer.length > 0) {
        console.log('[CLOUD_RESTORE] Restoring', newTripsFromServer.length, 'trips from cloud');
        const merged = [...localTrips, ...newTripsFromServer].sort((a, b) => b.startTime - a.startTime);
        await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(merged));
        setTrips(merged);

        const syncedIds = await getSyncedTripIds();
        const newSyncedIds = [...syncedIds, ...newTripsFromServer.map(t => t.id)];
        await AsyncStorage.setItem(SYNCED_TRIP_IDS_KEY, JSON.stringify(newSyncedIds));

        await rebuildPersonalRecords(merged);
      } else {
        console.log('[CLOUD_RESTORE] All server trips already exist locally');
      }

      setCloudRestoreDone(true);
    } catch (error) {
      console.warn('[CLOUD_RESTORE] Failed to restore trips from cloud, will retry on next app launch:', error instanceof Error ? error.message : 'Unknown error');
      setCloudRestoreDone(true);
    }
  };

  const rebuildPersonalRecords = async (allTrips: TripStats[]) => {
    try {
      const records: PersonalRecords = {
        topSpeed: 0,
        longestTrip: 0,
        mostCorners: 0,
        fastest0to100: null,
      };

      for (const trip of allTrips) {
        if (trip.topSpeed > records.topSpeed) records.topSpeed = trip.topSpeed;
        if (trip.distance > records.longestTrip) records.longestTrip = trip.distance;
        if (trip.corners > records.mostCorners) records.mostCorners = trip.corners;
        if (trip.time0to100 && (records.fastest0to100 === null || trip.time0to100 < records.fastest0to100)) {
          records.fastest0to100 = trip.time0to100;
        }
      }

      await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));

      const totalDistance = allTrips.reduce((sum, t) => sum + t.distance, 0);
      await AsyncStorage.setItem(TOTAL_DISTANCE_KEY, totalDistance.toString());

      console.log('[CLOUD_RESTORE] Personal records rebuilt:', JSON.stringify(records));
    } catch (error) {
      console.error('[CLOUD_RESTORE] Failed to rebuild personal records:', error);
    }
  };

  const loadTrips = async () => {
    try {
      const stored = await AsyncStorage.getItem(TRIPS_KEY);
      if (stored) {
        try {
          const parsedTrips = JSON.parse(stored) as TripStats[];
          // Validate the data structure
          if (Array.isArray(parsedTrips)) {
            // Clean up oversized location arrays to prevent future issues
            const cleanedTrips = parsedTrips.map(trip => ({
              ...trip,
              locations: Array.isArray(trip.locations) 
                ? downsampleLocations(trip.locations, MAX_LOCATIONS_SAVE)
                : [],
            }));
            setTrips(cleanedTrips);
            // Save cleaned data back
            await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(cleanedTrips));
          } else {
            console.error('Invalid trips data format, resetting');
            setTrips([]);
            await AsyncStorage.removeItem(TRIPS_KEY);
          }
        } catch (parseError) {
          console.error('Failed to parse trips JSON, data may be corrupted:', parseError);
          // Data is corrupted, reset it
          setTrips([]);
          await AsyncStorage.removeItem(TRIPS_KEY);
          Alert.alert(
            'Data Recovery',
            'Some trip data was corrupted and has been reset. Your future trips will be saved normally.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.error('Failed to load trips:', error);
    }
  };

  const restoreTrackingState = async () => {
    try {
      const trackingState = await AsyncStorage.getItem(TRACKING_STATE_KEY);
      const savedTrip = await AsyncStorage.getItem(CURRENT_TRIP_KEY);
      
      if (trackingState === 'true' && savedTrip) {
        const trip = JSON.parse(savedTrip) as TripStats;
        setCurrentTrip(trip);
        setIsTracking(true);
        isTrackingRef.current = true;
        
        if (Platform.OS === 'web') {
          resumeTracking(trip);
          return;
        }
        
        let hasTask = false;
        try {
          hasTask = await ExpoLocation.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        } catch (e) {
          console.warn('Could not check background task status:', e);
        }
        
        if (hasTask) {
          console.log('Restoring active background tracking');
          isBackgroundEnabled.current = true;
          setupBackgroundCallback();
          startDurationTimer(trip.startTime);
          
          try {
            const currentLocation = await ExpoLocation.getCurrentPositionAsync({
              accuracy: ExpoLocation.Accuracy.BestForNavigation,
            });
            processLocationUpdateBackground(currentLocation);
          } catch (locError) {
            console.warn('Could not get current position:', locError);
          }
        } else {
          resumeTracking(trip);
        }
      }
    } catch (error) {
      console.error('Failed to restore tracking state:', error);
      // Reset tracking state on error to prevent crash loops
      try {
        await AsyncStorage.removeItem(TRACKING_STATE_KEY);
        await AsyncStorage.removeItem(CURRENT_TRIP_KEY);
      } catch (e) {
        console.warn('Could not clear tracking state:', e);
      }
    }
  };

  const saveTrackingState = async (tracking: boolean, trip: TripStats | null) => {
    try {
      await AsyncStorage.setItem(TRACKING_STATE_KEY, tracking.toString());
      if (trip) {
        await AsyncStorage.setItem(CURRENT_TRIP_KEY, JSON.stringify(trip));
      } else {
        await AsyncStorage.removeItem(CURRENT_TRIP_KEY);
      }
    } catch (error) {
      console.error('Failed to save tracking state:', error);
    }
  };

  useEffect(() => {
    currentTripRef.current = currentTrip;
  }, [currentTrip]);

  useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);

  const setupBackgroundCallback = useCallback(() => {
    console.log('Setting up background callback');
    backgroundLocationCallback = (location: ExpoLocation.LocationObject) => {
      processLocationUpdateBackground(location);
    };
    // processLocationUpdateBackground uses refs internally and is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    processLocationRef = (location: ExpoLocation.LocationObject) => {
      console.log('Background location update received, speed:', location.coords.speed);
      processLocationUpdateBackground(location);
    };
    return () => {
      processLocationRef = null;
    };
    // processLocationUpdateBackground uses refs internally and is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const debouncedSaveTrip = useCallback((trip: TripStats) => {
    const now = Date.now();
    if (now - lastSaveTimeRef.current < 2000) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        lastSaveTimeRef.current = Date.now();
        AsyncStorage.setItem(CURRENT_TRIP_KEY, JSON.stringify(trip)).catch(console.error);
      }, 2000);
      return;
    }
    lastSaveTimeRef.current = now;
    AsyncStorage.setItem(CURRENT_TRIP_KEY, JSON.stringify(trip)).catch(console.error);
  }, []);

  const startDurationTimer = (startTime: number) => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
    }
    durationInterval.current = setInterval(() => {
      const tripData = currentTripRef.current;
      if (!tripData) return;
      const elapsed = Math.max(0, (Date.now() - startTime) / 1000);
      const updated = { ...tripData, duration: elapsed };
      currentTripRef.current = updated;
      setCurrentTrip(updated);
    }, 1000);
  };

  const startStaleSpeedDetection = () => {
    if (staleSpeedInterval.current) {
      clearInterval(staleSpeedInterval.current);
    }
    lastLocationUpdateTime.current = Date.now();
    staleSpeedInterval.current = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastLocationUpdateTime.current;
      if (lastLocationUpdateTime.current > 0 && timeSinceLastUpdate > SPEED_STALE_TIMEOUT && currentSpeedRef.current > 0) {
        console.log('Speed stale detected, no location update for', timeSinceLastUpdate, 'ms, setting speed to 0');
        setCurrentSpeed(0);
        currentSpeedRef.current = 0;
      }
    }, 1000);
  };

  const stopStaleSpeedDetection = () => {
    if (staleSpeedInterval.current) {
      clearInterval(staleSpeedInterval.current);
      staleSpeedInterval.current = null;
    }
  };

  const processLocationUpdateBackground = (location: ExpoLocation.LocationObject) => {
    const rawSpeed = Math.max(0, (location.coords.speed ?? 0) * 3.6);
    const speed = rawSpeed < SPEED_NOISE_THRESHOLD ? 0 : rawSpeed;
    const newLocation: LocationType = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      speed: speed,
      timestamp: location.timestamp,
    };

    console.log('Processing background location - raw speed:', rawSpeed, 'filtered speed:', speed);

    const now = Date.now();
    lastLocationUpdateTime.current = now;
    currentSpeedRef.current = speed;
    
    pendingLocationsRef.current.push(newLocation);
    if (pendingLocationsRef.current.length > 2000) {
      pendingLocationsRef.current = downsampleLocations(pendingLocationsRef.current, 1000);
    }
    
    saveBackgroundSpeed(speed, now).catch(console.error);

    calculateAcceleration(speed, location.timestamp);
    trackAccelerationTimes(speed, location.timestamp);

    const tripData = currentTripRef.current;
    if (!tripData) return;

    let distance = tripData.distance;
    let corners = tripData.corners;

    if (!isSpeedCameraRestricted(currentCountry.current)) {
      const warningCameras = getNearbyCameras(newLocation.latitude, newLocation.longitude, SPEED_CAMERA_WARNING_RADIUS_KM);
      for (const camera of warningCameras) {
        if (!warnedCameraIds.current.has(camera.id)) {
          warnedCameraIds.current.add(camera.id);
          const limitText = camera.speedLimit ? ` (${camera.speedLimit} km/h limit)` : '';
          console.log('[SPEED_CAMERA_WARNING] Approaching camera:', camera.id, camera.description);
          sendLocalNotification(
            '⚠️ Speed Camera Ahead',
            `${camera.description || 'Speed camera'} nearby${limitText}`,
            { type: 'speed_camera_warning', cameraId: camera.id }
          ).catch(console.error);
        }
        if (!detectedCameraIds.current.has(camera.id)) {
          detectedCameraIds.current.add(camera.id);
          speedCamerasCount.current++;
          console.log('[SPEED_CAMERA] Counted camera (via warning radius):', camera.id, camera.description);
        }
      }

      const nearbyCameras = getNearbyCameras(newLocation.latitude, newLocation.longitude);
      for (const camera of nearbyCameras) {
        if (!detectedCameraIds.current.has(camera.id)) {
          detectedCameraIds.current.add(camera.id);
          speedCamerasCount.current++;
          console.log('[SPEED_CAMERA] Detected camera:', camera.id, camera.description);
        }
      }
    }

    const allLocations = [...tripData.locations, ...pendingLocationsRef.current];
    if (allLocations.length > 1) {
      const lastLoc = allLocations[allLocations.length - 2];
      const dist = calculateDistance(
        lastLoc.latitude,
        lastLoc.longitude,
        newLocation.latitude,
        newLocation.longitude
      );
      distance += dist;

      if (location.coords.heading !== undefined && location.coords.heading !== null && location.coords.heading !== -1) {
        if (detectCorner(location.coords.heading, location.timestamp)) {
          corners++;
        }
      }
    }

    const duration = (Date.now() - tripData.startTime) / 1000;
    const topSpeed = Math.max(tripData.topSpeed, speed);
    const rawAvgSpeed = distance > 0 ? (distance / duration) * 3600 : 0;
    const avgSpeed = topSpeed > 0 ? Math.min(rawAvgSpeed, topSpeed) : rawAvgSpeed;

    const updated: TripStats = {
      ...tripData,
      locations: allLocations.length > MAX_LOCATIONS_MEMORY ? downsampleLocations(allLocations, MAX_LOCATIONS_MEMORY) : allLocations,
      distance,
      duration,
      topSpeed,
      avgSpeed,
      corners,
      acceleration: maxAcceleration.current,
      maxGForce: maxGForce.current,
      time0to100: time0to100.current ?? undefined,
      time0to200: time0to200.current ?? undefined,
      time100to200: time100to200.current ?? undefined,
      time0to300: time0to300.current ?? undefined,
      speedCamerasDetected: speedCamerasCount.current,
    };
    
    currentTripRef.current = updated;
    pendingLocationsRef.current = [];
    
    setCurrentSpeed(speed);
    setCurrentLocation(newLocation);
    setCurrentTrip(updated);
    
    debouncedSaveTrip(updated);
  };

  const processLocationUpdate = (location: ExpoLocation.LocationObject) => {
    const rawSpeed = Math.max(0, (location.coords.speed ?? 0) * 3.6);
    const speed = rawSpeed < SPEED_NOISE_THRESHOLD ? 0 : rawSpeed;
    const newLocation: LocationType = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      speed: speed,
      timestamp: location.timestamp,
      heading: location.coords.heading,
    };

    const now = Date.now();
    lastLocationUpdateTime.current = now;
    currentSpeedRef.current = speed;
    
    saveBackgroundSpeed(speed, now).catch(console.error);

    calculateAcceleration(speed, location.timestamp);
    trackAccelerationTimes(speed, location.timestamp);

    const tripData = currentTripRef.current;
    if (!tripData) return;

    const locations = tripData.locations;
    let distance = tripData.distance;
    let corners = tripData.corners;

    if (!isSpeedCameraRestricted(currentCountry.current)) {
      const warningCameras = getNearbyCameras(newLocation.latitude, newLocation.longitude, SPEED_CAMERA_WARNING_RADIUS_KM);
      for (const camera of warningCameras) {
        if (!warnedCameraIds.current.has(camera.id)) {
          warnedCameraIds.current.add(camera.id);
          const limitText = camera.speedLimit ? ` (${camera.speedLimit} km/h limit)` : '';
          console.log('[SPEED_CAMERA_WARNING] Approaching camera:', camera.id, camera.description);
          sendLocalNotification(
            '⚠️ Speed Camera Ahead',
            `${camera.description || 'Speed camera'} nearby${limitText}`,
            { type: 'speed_camera_warning', cameraId: camera.id }
          ).catch(console.error);
        }
        if (!detectedCameraIds.current.has(camera.id)) {
          detectedCameraIds.current.add(camera.id);
          speedCamerasCount.current++;
          console.log('[SPEED_CAMERA] Counted camera (via warning radius):', camera.id, camera.description);
        }
      }

      const nearbyCameras = getNearbyCameras(newLocation.latitude, newLocation.longitude);
      for (const camera of nearbyCameras) {
        if (!detectedCameraIds.current.has(camera.id)) {
          detectedCameraIds.current.add(camera.id);
          speedCamerasCount.current++;
          console.log('[SPEED_CAMERA] Detected camera:', camera.id, camera.description);
        }
      }
    }

    if (locations.length > 0) {
      const lastLoc = locations[locations.length - 1];
      const dist = calculateDistance(
        lastLoc.latitude,
        lastLoc.longitude,
        newLocation.latitude,
        newLocation.longitude
      );
      distance += dist;

      if (location.coords.heading !== undefined && location.coords.heading !== null && location.coords.heading !== -1) {
        if (detectCorner(location.coords.heading, location.timestamp)) {
          corners++;
        }
      }
    }

    const duration = (Date.now() - tripData.startTime) / 1000;
    const topSpeed = Math.max(tripData.topSpeed, speed);
    const rawAvgSpeed = distance > 0 ? (distance / duration) * 3600 : 0;
    const avgSpeed = topSpeed > 0 ? Math.min(rawAvgSpeed, topSpeed) : rawAvgSpeed;

    const allLocs = [...locations, newLocation];
    const updatedLocations = allLocs.length > MAX_LOCATIONS_MEMORY ? downsampleLocations(allLocs, MAX_LOCATIONS_MEMORY) : allLocs;
    
    const updated: TripStats = {
      ...tripData,
      locations: updatedLocations,
      distance,
      duration,
      topSpeed,
      avgSpeed,
      corners,
      acceleration: maxAcceleration.current,
      maxGForce: maxGForce.current,
      time0to100: time0to100.current ?? undefined,
      time0to200: time0to200.current ?? undefined,
      time100to200: time100to200.current ?? undefined,
      time0to300: time0to300.current ?? undefined,
      speedCamerasDetected: speedCamerasCount.current,
    };
    
    currentTripRef.current = updated;
    
    setCurrentSpeed(speed);
    setCurrentLocation(newLocation);
    setCurrentTrip(updated);
    
    debouncedSaveTrip(updated);
  };

  const resumeTracking = async (trip: TripStats) => {
    try {
      await startLocationUpdates(trip.startTime);
    } catch (error) {
      console.error('Failed to resume tracking:', error);
    }
  };

  const saveTrips = async (newTrips: TripStats[]) => {
    try {
      // Limit locations to prevent data bloat
      const tripsToSave = newTrips.map(trip => ({
        ...trip,
        locations: Array.isArray(trip.locations) 
          ? downsampleLocations(trip.locations, MAX_LOCATIONS_SAVE)
          : [],
      }));
      await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(tripsToSave));
      setTrips(tripsToSave);
    } catch (error) {
      console.error('Failed to save trips:', error);
      // If save fails due to size, try saving without locations
      try {
        const minimalTrips = newTrips.map(trip => ({
          ...trip,
          locations: [],
        }));
        await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(minimalTrips));
        setTrips(minimalTrips);
        console.log('Saved trips without locations due to storage constraints');
      } catch (fallbackError) {
        console.error('Failed to save even minimal trips:', fallbackError);
      }
    }
  };

  const markTripSynced = async (tripId: string): Promise<void> => {
    try {
      const stored = await AsyncStorage.getItem(SYNCED_TRIP_IDS_KEY);
      const syncedIds: string[] = stored ? JSON.parse(stored) : [];
      if (!syncedIds.includes(tripId)) {
        syncedIds.push(tripId);
        await AsyncStorage.setItem(SYNCED_TRIP_IDS_KEY, JSON.stringify(syncedIds));
      }
    } catch (e) {
      console.error('[TRIP_SYNC] Failed to mark trip as synced:', e);
    }
  };

  const getSyncedTripIds = async (): Promise<string[]> => {
    try {
      const stored = await AsyncStorage.getItem(SYNCED_TRIP_IDS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('[TRIP_SYNC] Failed to get synced trip IDs:', e);
      return [];
    }
  };

  const syncTripToBackend = async (trip: TripStats): Promise<boolean> => {
    try {
      console.log('[TRIP_SYNC] Starting sync for trip:', trip.id);
      const storedUser = await AsyncStorage.getItem('user_profile');
      console.log('[TRIP_SYNC] Stored user data exists:', !!storedUser);
      
      if (!storedUser) {
        console.warn('[TRIP_SYNC] No user profile in AsyncStorage, cannot sync. User may not have created account yet.');
        return false;
      }
      
      let userData: Record<string, unknown>;
      try {
        userData = JSON.parse(storedUser);
      } catch (parseErr) {
        console.error('[TRIP_SYNC] Failed to parse user profile JSON:', parseErr);
        return false;
      }
      
      const userIdToUse = userData.id as string | undefined;
      const userNameToUse = userData.displayName as string | undefined;
      const userPictureToUse = userData.profilePicture as string | undefined;
      
      console.log('[TRIP_SYNC] User data:', { id: userIdToUse, name: userNameToUse, hasPicture: !!userPictureToUse });
      
      if (!userIdToUse) {
        console.error('[TRIP_SYNC] No user ID in stored profile, skipping sync');
        return false;
      }
      
      const simplifyRoute = (locations: LocationType[], maxPoints: number = 60): { latitude: number; longitude: number }[] => {
        if (locations.length <= maxPoints) {
          return locations.map(l => ({ latitude: l.latitude, longitude: l.longitude }));
        }
        const step = (locations.length - 1) / (maxPoints - 1);
        const result: { latitude: number; longitude: number }[] = [];
        for (let i = 0; i < maxPoints; i++) {
          const idx = Math.round(i * step);
          const loc = locations[idx];
          result.push({ latitude: loc.latitude, longitude: loc.longitude });
        }
        return result;
      };

      const routePoints = trip.locations && trip.locations.length > 1
        ? simplifyRoute(trip.locations)
        : undefined;

      const payload = {
        id: trip.id,
        userId: userIdToUse,
        userName: userNameToUse,
        userProfilePicture: userPictureToUse,
        startTime: trip.startTime,
        endTime: trip.endTime,
        distance: trip.distance,
        duration: trip.duration,
        avgSpeed: trip.avgSpeed,
        topSpeed: trip.topSpeed,
        corners: trip.corners,
        carModel: trip.carModel,
        acceleration: trip.acceleration ?? 0,
        maxGForce: trip.maxGForce ?? 0,
        location: trip.location,
        time0to100: trip.time0to100,
        time0to200: trip.time0to200,
        time100to200: trip.time100to200,
        time0to300: trip.time0to300,
        routePoints,
      };
      
      console.log('[TRIP_SYNC] Sending payload for trip:', trip.id, 'userId:', userIdToUse, 'distance:', trip.distance, 'topSpeed:', trip.topSpeed);
      const result = await trpcClient.trips.syncTrip.mutate(payload);
      console.log('[TRIP_SYNC] Backend response for trip:', trip.id, 'result:', JSON.stringify(result));
      
      if (result.success) {
        await markTripSynced(trip.id);
        console.log('[TRIP_SYNC] Trip marked as synced:', trip.id);
      } else {
        console.error('[TRIP_SYNC] Backend returned success=false for trip:', trip.id, 'message:', (result as { message?: string }).message);
      }
      
      return result.success ?? false;
    } catch (error) {
      console.error('[TRIP_SYNC] Failed to sync trip:', trip.id);
      console.error('[TRIP_SYNC] Error:', error);
      if (error instanceof Error) {
        console.error('[TRIP_SYNC] Error message:', error.message);
        console.error('[TRIP_SYNC] Error stack:', error.stack);
      }
      return false;
    }
  };

  const syncUnsyncedTrips = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user_profile');
      if (!storedUser) {
        console.log('[TRIP_SYNC] No user profile yet, skipping batch sync');
        return;
      }
      
      let userData: Record<string, unknown>;
      try {
        userData = JSON.parse(storedUser);
      } catch {
        console.error('[TRIP_SYNC] Failed to parse user profile, skipping batch sync');
        return;
      }
      
      if (!userData.id) {
        console.log('[TRIP_SYNC] No user ID in profile, skipping batch sync');
        return;
      }
      
      const stored = await AsyncStorage.getItem(TRIPS_KEY);
      if (!stored) return;
      
      const allTrips: TripStats[] = JSON.parse(stored);
      if (!Array.isArray(allTrips) || allTrips.length === 0) return;
      
      const syncedIds = await getSyncedTripIds();
      const unsyncedTrips = allTrips.filter(t => !syncedIds.includes(t.id) && t.endTime);
      
      if (unsyncedTrips.length === 0) {
        console.log('[TRIP_SYNC] All trips are synced');
        return;
      }
      
      console.log('[TRIP_SYNC] Found', unsyncedTrips.length, 'unsynced trips for user:', userData.id, '- syncing now...');
      
      let syncedCount = 0;
      let failedCount = 0;
      for (const trip of unsyncedTrips) {
        const success = await syncTripToBackend(trip);
        if (success) {
          syncedCount++;
        } else {
          failedCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      console.log('[TRIP_SYNC] Batch sync complete:', syncedCount, 'synced,', failedCount, 'failed, out of', unsyncedTrips.length, 'total');
      
      if (failedCount > 0) {
        console.warn('[TRIP_SYNC] Some trips failed to sync. They will be retried on next sync cycle.');
      }
    } catch (error) {
      console.error('[TRIP_SYNC] Failed to sync unsynced trips:', error);
    }
  };

  const detectCorner = (newHeading: number, currentTime: number): boolean => {
    if (previousHeading.current === null) {
      previousHeading.current = newHeading;
      accumulatedHeadingChange.current = 0;
      return false;
    }

    let diff = Math.abs(newHeading - previousHeading.current);
    if (diff > 180) {
      diff = 360 - diff;
    }

    // Reset accumulation if too much time has passed since last significant change
    if (currentTime - lastCornerTime.current > CORNER_RESET_TIMEOUT) {
      accumulatedHeadingChange.current = 0;
    }

    // Accumulate heading changes for gradual turns
    if (diff >= CORNER_THRESHOLD) {
      accumulatedHeadingChange.current += diff;
      lastCornerTime.current = currentTime;
    }

    previousHeading.current = newHeading;

    // Detect corner when accumulated change exceeds threshold
    if (accumulatedHeadingChange.current >= CORNER_ACCUMULATION_THRESHOLD) {
      accumulatedHeadingChange.current = 0;
      return true;
    }

    return false;
  };

  const reverseGeocode = async (latitude: number, longitude: number): Promise<TripLocation> => {
    try {
      if (Platform.OS === 'web') {
        return { country: 'Unknown', city: 'Unknown' };
      }
      
      const results = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
      if (results.length > 0) {
        const result = results[0];
        return {
          country: result.country || 'Unknown',
          city: result.city || result.subregion || result.region || 'Unknown',
        };
      }
    } catch (error) {
      console.error('Reverse geocode failed:', error);
    }
    return { country: 'Unknown', city: 'Unknown' };
  };

  const WARMUP_PERIOD_MS = 3000;

  const calculateAcceleration = (currentSpeedKmh: number, currentTime: number): number => {
    if (previousSpeedTime.current === 0) {
      previousSpeed.current = currentSpeedKmh;
      previousSpeedTime.current = currentTime;
      console.log('[ACCEL] First reading baseline set at', currentSpeedKmh.toFixed(1), 'km/h, skipping G-force calc');
      return 0;
    }

    if (driveStartTimestamp.current > 0 && (currentTime - driveStartTimestamp.current) < WARMUP_PERIOD_MS) {
      previousSpeed.current = currentSpeedKmh;
      previousSpeedTime.current = currentTime;
      console.log('[ACCEL] Warmup period active (' + ((currentTime - driveStartTimestamp.current) / 1000).toFixed(1) + 's), skipping acceleration calc');
      return 0;
    }

    const timeDiff = (currentTime - previousSpeedTime.current) / 1000;
    if (timeDiff <= 0 || timeDiff > 10) {
      previousSpeed.current = currentSpeedKmh;
      previousSpeedTime.current = currentTime;
      console.log('[ACCEL] Time gap too small or large (' + timeDiff.toFixed(2) + 's), resetting baseline');
      return 0;
    }

    const speedDiffMs = (currentSpeedKmh - previousSpeed.current) / 3.6;
    const acceleration = speedDiffMs / timeDiff;

    previousSpeed.current = currentSpeedKmh;
    previousSpeedTime.current = currentTime;

    const absAcceleration = Math.abs(acceleration);
    const MAX_REASONABLE_ACCEL = 29.43;
    const clampedAcceleration = Math.min(absAcceleration, MAX_REASONABLE_ACCEL);

    if (clampedAcceleration > maxAcceleration.current) {
      maxAcceleration.current = clampedAcceleration;
    }

    const gForce = clampedAcceleration / 9.81;
    if (gForce > maxGForce.current) {
      if (absAcceleration > MAX_REASONABLE_ACCEL) {
        console.log('[ACCEL] G-force capped at 3.0G (raw was ' + (absAcceleration / 9.81).toFixed(2) + 'G, speed delta: ' + (currentSpeedKmh - (currentSpeedKmh - speedDiffMs * 3.6)).toFixed(1) + ' km/h in ' + timeDiff.toFixed(2) + 's)');
      }
      maxGForce.current = gForce;
    }

    return acceleration;
  };

  const trackAccelerationTimes = (currentSpeedKmh: number, currentTime: number) => {
    const STANDING_THRESHOLD = 5;
    const SUSTAINED_STANDSTILL_READINGS = 3;
    const MIN_0_TO_100_TIME = 2.0;
    const MIN_0_TO_200_TIME = 5.0;
    const MIN_0_TO_300_TIME = 10.0;

    if (driveStartTimestamp.current > 0 && (currentTime - driveStartTimestamp.current) < WARMUP_PERIOD_MS) {
      return;
    }

    if (currentSpeedKmh < STANDING_THRESHOLD) {
      consecutiveLowSpeedReadings.current += 1;
      if (consecutiveLowSpeedReadings.current >= SUSTAINED_STANDSTILL_READINGS) {
        if (!standstillConfirmed.current) {
          console.log('[ACCEL] Sustained standstill confirmed after ' + consecutiveLowSpeedReadings.current + ' readings');
        }
        standstillConfirmed.current = true;
        accelStartTime.current = currentTime;
        reached100.current = false;
        reached200.current = false;
        reached300.current = false;
        time100Start.current = null;
      }
    } else {
      consecutiveLowSpeedReadings.current = 0;
    }

    if (!standstillConfirmed.current) {
      if (accelStartTime.current === null) {
        console.log('[ACCEL] Drive started at high speed (' + currentSpeedKmh.toFixed(1) + ' km/h), skipping acceleration tracking until sustained standstill');
      }
      return;
    }

    if (accelStartTime.current === null) {
      accelStartTime.current = currentTime;
    }

    if (!reached100.current && currentSpeedKmh >= 100) {
      reached100.current = true;
      time100Start.current = currentTime;
      const timeSeconds = (currentTime - accelStartTime.current) / 1000;
      if (timeSeconds >= MIN_0_TO_100_TIME) {
        if (time0to100.current === null || timeSeconds < time0to100.current) {
          time0to100.current = timeSeconds;
          console.log('[ACCEL] Valid 0-100 time recorded: ' + timeSeconds.toFixed(2) + 's');
        }
      } else {
        console.log('[ACCEL] Rejected 0-100 time ' + timeSeconds.toFixed(2) + 's (below minimum ' + MIN_0_TO_100_TIME + 's)');
      }
    }

    if (!reached200.current && currentSpeedKmh >= 200) {
      reached200.current = true;
      const timeSeconds = (currentTime - accelStartTime.current) / 1000;
      if (timeSeconds >= MIN_0_TO_200_TIME) {
        if (time0to200.current === null || timeSeconds < time0to200.current) {
          time0to200.current = timeSeconds;
          console.log('[ACCEL] Valid 0-200 time recorded: ' + timeSeconds.toFixed(2) + 's');
        }
      } else {
        console.log('[ACCEL] Rejected 0-200 time ' + timeSeconds.toFixed(2) + 's (below minimum ' + MIN_0_TO_200_TIME + 's)');
      }

      if (time100Start.current !== null) {
        const time100to200Seconds = (currentTime - time100Start.current) / 1000;
        const MIN_100_TO_200_TIME = 3.0;
        if (time100to200Seconds >= MIN_100_TO_200_TIME) {
          if (time100to200.current === null || time100to200Seconds < time100to200.current) {
            time100to200.current = time100to200Seconds;
            console.log('[ACCEL] Valid 100-200 time recorded: ' + time100to200Seconds.toFixed(2) + 's');
          }
        } else {
          console.log('[ACCEL] Rejected 100-200 time ' + time100to200Seconds.toFixed(2) + 's (below minimum ' + MIN_100_TO_200_TIME + 's)');
        }
      }
    }

    if (!reached300.current && currentSpeedKmh >= 300) {
      reached300.current = true;
      const timeSeconds = (currentTime - accelStartTime.current) / 1000;
      if (timeSeconds >= MIN_0_TO_300_TIME) {
        if (time0to300.current === null || timeSeconds < time0to300.current) {
          time0to300.current = timeSeconds;
          console.log('[ACCEL] Valid 0-300 time recorded: ' + timeSeconds.toFixed(2) + 's');
        }
      } else {
        console.log('[ACCEL] Rejected 0-300 time ' + timeSeconds.toFixed(2) + 's (below minimum ' + MIN_0_TO_300_TIME + 's)');
      }
    }
  };

  const startLocationUpdates = async (startTime: number) => {
    if (Platform.OS === 'web') {
      const mockInterval = setInterval(() => {
        const mockSpeed = Math.random() * 60 + 20;
        setCurrentSpeed(mockSpeed);
        
        calculateAcceleration(mockSpeed, Date.now());
        trackAccelerationTimes(mockSpeed, Date.now());
        
        setCurrentTrip((prev) => {
          if (!prev) return prev;
          
          const duration = (Date.now() - prev.startTime) / 1000;
          const distance = prev.distance + (mockSpeed / 3600) * 1;
          const topSpeed = Math.max(prev.topSpeed, mockSpeed);
          const corners = prev.corners + (Math.random() > 0.95 ? 1 : 0);
          
          return {
            ...prev,
            distance,
            duration,
            topSpeed,
            avgSpeed: distance > 0 ? Math.min((distance / duration) * 3600, topSpeed) : 0,
            corners,
            acceleration: maxAcceleration.current,
            maxGForce: maxGForce.current,
            time0to100: time0to100.current ?? undefined,
            time0to200: time0to200.current ?? undefined,
            time100to200: time100to200.current ?? undefined,
            time0to300: time0to300.current ?? undefined,
          };
        });
      }, 1000);
      
      (locationSubscription as any).current = { remove: () => clearInterval(mockInterval) };
      return;
    }

    const { status: backgroundStatus } = await ExpoLocation.requestBackgroundPermissionsAsync();
    
    if (backgroundStatus === 'granted') {
      console.log('Background location permission granted, starting background updates');
      isBackgroundEnabled.current = true;
      setupBackgroundCallback();
      
      await ExpoLocation.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: ExpoLocation.Accuracy.BestForNavigation,
        timeInterval: 500,
        distanceInterval: 0,
        showsBackgroundLocationIndicator: true,
        activityType: ExpoLocation.ActivityType.AutomotiveNavigation,
        pausesUpdatesAutomatically: false,
        deferredUpdatesInterval: 500,
        deferredUpdatesDistance: 0,
        foregroundService: {
          notificationTitle: 'TripStats Tracking',
          notificationBody: 'Recording your trip in the background',
          notificationColor: '#CC0000',
        },
      });
      startStaleSpeedDetection();
    } else {
      console.log('Background location not granted, using foreground only');
      isBackgroundEnabled.current = false;
      
      locationSubscription.current = await ExpoLocation.watchPositionAsync(
        {
          accuracy: ExpoLocation.Accuracy.BestForNavigation,
          timeInterval: 500,
          distanceInterval: 0,
        },
        (location) => processLocationUpdate(location)
      );
      startStaleSpeedDetection();
    }
    
    startDurationTimer(startTime);
  };

  const startTracking = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status: foregroundStatus } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
          Alert.alert('Permission Required', 'Location permission is required to track trips.');
          return;
        }
        
        // Request background permission immediately after foreground
        // This shows the "Always Allow" option to the user
        await ExpoLocation.requestBackgroundPermissionsAsync();
      }

      const newTrip: TripStats = {
        id: Date.now().toString(),
        startTime: Date.now(),
        distance: 0,
        duration: 0,
        avgSpeed: 0,
        topSpeed: 0,
        corners: 0,
        acceleration: 0,
        maxGForce: 0,
        speedCamerasDetected: 0,
        locations: [],
      };

      setCurrentTrip(newTrip);
      setIsTracking(true);
      isTrackingRef.current = true;
      await saveTrackingState(true, newTrip);

      previousHeading.current = null;
      accumulatedHeadingChange.current = 0;
      lastCornerTime.current = 0;
      previousSpeed.current = 0;
      previousSpeedTime.current = 0;
      maxAcceleration.current = 0;
      maxGForce.current = 0;
      accelStartTime.current = null;
      reached100.current = false;
      reached200.current = false;
      reached300.current = false;
      time0to100.current = null;
      time0to200.current = null;
      time100to200.current = null;
      time100Start.current = null;
      time0to300.current = null;
      driveStartTimestamp.current = Date.now();
      standstillConfirmed.current = false;
      consecutiveLowSpeedReadings.current = 0;
      detectedCameraIds.current = new Set();
      warnedCameraIds.current = new Set();
      speedCamerasCount.current = 0;
      currentCountry.current = null;
      setSpeedCameraBlocked(false);

      if (Platform.OS !== 'web') {
        try {
          const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
          const geoResults = await ExpoLocation.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (geoResults.length > 0 && geoResults[0].country) {
            currentCountry.current = geoResults[0].country;
            const blocked = isSpeedCameraRestricted(geoResults[0].country);
            setSpeedCameraBlocked(blocked);
            console.log('[GEOFENCE] Country:', geoResults[0].country, 'Speed cameras blocked:', blocked);
          }
        } catch (e) {
          console.warn('[GEOFENCE] Failed to detect country at start:', e);
        }
      }

      await startLocationUpdates(newTrip.startTime);
    } catch (error) {
      console.error('Failed to start tracking:', error);
      Alert.alert('Error', 'Failed to start tracking');
    }
  };

  const checkAndUpdateRecords = async (trip: TripStats): Promise<string[]> => {
    const newRecords: string[] = [];
    
    try {
      const prefs = await getUnitPrefs();
      const storedRecords = await AsyncStorage.getItem(RECORDS_KEY);
      const records: PersonalRecords = storedRecords 
        ? JSON.parse(storedRecords) 
        : { topSpeed: 0, longestTrip: 0, mostCorners: 0, fastest0to100: null };
      
      if (trip.topSpeed > records.topSpeed) {
        records.topSpeed = trip.topSpeed;
        newRecords.push(`🏎️ New top speed: ${formatSpeedWithUnit(trip.topSpeed, prefs)}!`);
      }
      
      if (trip.distance > records.longestTrip) {
        records.longestTrip = trip.distance;
        newRecords.push(`🛣️ Longest trip: ${formatDistanceWithUnit(trip.distance, prefs)}!`);
      }
      
      if (trip.corners > records.mostCorners) {
        records.mostCorners = trip.corners;
        newRecords.push(`🔄 Most corners: ${trip.corners}!`);
      }
      
      if (trip.time0to100 && (records.fastest0to100 === null || trip.time0to100 < records.fastest0to100)) {
        records.fastest0to100 = trip.time0to100;
        newRecords.push(`⚡ Fastest 0-100: ${trip.time0to100.toFixed(1)}s!`);
      }
      
      await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    } catch (error) {
      console.error('Failed to check records:', error);
    }
    
    return newRecords;
  };

  const checkMilestones = async (tripCount: number, totalDistance: number): Promise<string | null> => {
    const distanceMilestones = [100, 500, 1000, 2500, 5000, 10000];
    const tripMilestones = [1, 5, 10, 25, 50, 100, 250, 500];
    
    try {
      const prefs = await getUnitPrefs();
      const storedDistance = await AsyncStorage.getItem(TOTAL_DISTANCE_KEY);
      const previousDistance = storedDistance ? parseFloat(storedDistance) : 0;
      
      for (const milestone of distanceMilestones) {
        if (previousDistance < milestone && totalDistance >= milestone) {
          await AsyncStorage.setItem(TOTAL_DISTANCE_KEY, totalDistance.toString());
          const milestoneStr = formatDistanceWithUnit(milestone, prefs);
          return `🎉 You've driven ${milestoneStr}+ total!`;
        }
      }
      
      await AsyncStorage.setItem(TOTAL_DISTANCE_KEY, totalDistance.toString());
      
      for (const milestone of tripMilestones) {
        if (tripCount === milestone) {
          return tripCount === 1 
            ? `🎊 First trip completed! Welcome to the road!`
            : `🏆 ${milestone} trips completed!`;
        }
      }
    } catch (error) {
      console.error('Failed to check milestones:', error);
    }
    
    return null;
  };

  const stopTracking = useCallback(async (carModel?: string) => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    if (isBackgroundEnabled.current && Platform.OS !== 'web') {
      try {
        const hasTask = await ExpoLocation.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (hasTask) {
          await ExpoLocation.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
      } catch (error) {
        console.error('Failed to stop background location:', error);
      }
      isBackgroundEnabled.current = false;
      backgroundLocationCallback = null;
    }

    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }

    stopStaleSpeedDetection();
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingLocationsRef.current = [];

    const tripToSave = currentTripRef.current || currentTrip;
    console.log('[STOP_TRACKING] currentTrip:', !!currentTrip, 'currentTripRef:', !!currentTripRef.current);
    
    if (tripToSave) {
      const finalTrip: TripStats = {
        ...tripToSave,
        endTime: Date.now(),
        acceleration: maxAcceleration.current,
        maxGForce: maxGForce.current,
        location: tripToSave.location ?? { country: 'Unknown', city: 'Unknown' },
        carModel: carModel || tripToSave.carModel,
        time0to100: time0to100.current ?? undefined,
        time0to200: time0to200.current ?? undefined,
        time100to200: time100to200.current ?? undefined,
        time0to300: time0to300.current ?? undefined,
      };

      console.log('[STOP_TRACKING] Final trip data:', { id: finalTrip.id, distance: finalTrip.distance, topSpeed: finalTrip.topSpeed, duration: finalTrip.duration });

      const updatedTrips = [finalTrip, ...trips];
      saveTrips(updatedTrips);
      setLastSavedTrip(finalTrip);

      const doBackgroundWork = async () => {
        try {
          if (finalTrip.locations.length > 0) {
            const firstLocation = finalTrip.locations[0];
            const tripLocation = await reverseGeocode(firstLocation.latitude, firstLocation.longitude);
            const tripWithLocation: TripStats = { ...finalTrip, location: tripLocation };
            const tripsWithLocation = [tripWithLocation, ...trips];
            saveTrips(tripsWithLocation);
            setLastSavedTrip(tripWithLocation);

            await syncTripToBackend(tripWithLocation);
          } else {
            await syncTripToBackend(finalTrip);
          }
        } catch (e) {
          console.error('[STOP_TRACKING] Background sync/geocode failed:', e);
        }

        try {
          const prefs = await getUnitPrefs();
          const durationMins = Math.round(finalTrip.duration / 60);
          const distanceStr = formatDistanceWithUnit(finalTrip.distance, prefs);
          const speedStr = formatSpeedWithUnit(finalTrip.topSpeed, prefs);
          sendLocalNotification(
            '🏁 Trip Complete!',
            `${distanceStr} in ${durationMins} min • Top speed: ${speedStr}`,
            { type: 'trip_complete', tripId: finalTrip.id }
          ).catch(console.error);

          await checkAndUpdateRecords(finalTrip);
        } catch (e) {
          console.error('[STOP_TRACKING] Background tasks failed:', e);
        }
      };
      doBackgroundWork();
      const totalDistance = updatedTrips.reduce((sum, t) => sum + t.distance, 0);
      checkMilestones(updatedTrips.length, totalDistance).catch(console.error);
    }

    setIsTracking(false);
    isTrackingRef.current = false;
    setCurrentTrip(null);
    setCurrentSpeed(0);
    setCurrentLocation(null);
    await saveTrackingState(false, null);
    await AsyncStorage.multiRemove([CURRENT_SPEED_KEY, LAST_LOCATION_TIME_KEY]).catch(console.error);
    previousHeading.current = null;
    accumulatedHeadingChange.current = 0;
    lastCornerTime.current = 0;
    previousSpeed.current = 0;
    previousSpeedTime.current = 0;
    maxAcceleration.current = 0;
    maxGForce.current = 0;
    accelStartTime.current = null;
    reached100.current = false;
    reached200.current = false;
    reached300.current = false;
    time0to100.current = null;
    time0to200.current = null;
    time100to200.current = null;
    time100Start.current = null;
    time0to300.current = null;
    driveStartTimestamp.current = 0;
    standstillConfirmed.current = false;
    consecutiveLowSpeedReadings.current = 0;
    detectedCameraIds.current = new Set();
    warnedCameraIds.current = new Set();
    speedCamerasCount.current = 0;
    currentCountry.current = null;
    setSpeedCameraBlocked(false);
    lastLocationUpdateTime.current = 0;
    pendingLocationsRef.current = [];
  }, [currentTrip, trips]);

  const cancelTracking = useCallback(async () => {
    console.log('[CANCEL_TRACKING] Discarding current trip without saving');

    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    if (isBackgroundEnabled.current && Platform.OS !== 'web') {
      try {
        const hasTask = await ExpoLocation.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (hasTask) {
          await ExpoLocation.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
      } catch (error) {
        console.error('Failed to stop background location:', error);
      }
      isBackgroundEnabled.current = false;
      backgroundLocationCallback = null;
    }

    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }

    stopStaleSpeedDetection();

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingLocationsRef.current = [];

    setIsTracking(false);
    isTrackingRef.current = false;
    setCurrentTrip(null);
    setCurrentSpeed(0);
    setCurrentLocation(null);
    currentTripRef.current = null;
    await saveTrackingState(false, null);
    await AsyncStorage.multiRemove([CURRENT_SPEED_KEY, LAST_LOCATION_TIME_KEY]).catch(console.error);
    previousHeading.current = null;
    accumulatedHeadingChange.current = 0;
    lastCornerTime.current = 0;
    previousSpeed.current = 0;
    previousSpeedTime.current = 0;
    maxAcceleration.current = 0;
    maxGForce.current = 0;
    accelStartTime.current = null;
    reached100.current = false;
    reached200.current = false;
    reached300.current = false;
    time0to100.current = null;
    time0to200.current = null;
    time100to200.current = null;
    time100Start.current = null;
    time0to300.current = null;
    driveStartTimestamp.current = 0;
    standstillConfirmed.current = false;
    consecutiveLowSpeedReadings.current = 0;
    detectedCameraIds.current = new Set();
    warnedCameraIds.current = new Set();
    speedCamerasCount.current = 0;
    currentCountry.current = null;
    setSpeedCameraBlocked(false);
    lastLocationUpdateTime.current = 0;
    pendingLocationsRef.current = [];
  }, []);

  const clearLastSavedTrip = useCallback(() => {
    setLastSavedTrip(null);
  }, []);

  const updateTripCarModel = useCallback(async (tripId: string, carModel: string) => {
    const updatedTrips = trips.map((trip) =>
      trip.id === tripId ? { ...trip, carModel } : trip
    );
    await saveTrips(updatedTrips);
  }, [trips]);

  const getUniqueCountries = useCallback(() => {
    const countries = trips
      .map((trip) => trip.location?.country)
      .filter((country): country is string => !!country && country !== 'Unknown');
    return [...new Set(countries)];
  }, [trips]);

  const getUniqueCities = useCallback((country?: string) => {
    const filteredTrips = country
      ? trips.filter((trip) => trip.location?.country === country)
      : trips;
    const cities = filteredTrips
      .map((trip) => trip.location?.city)
      .filter((city): city is string => !!city && city !== 'Unknown');
    return [...new Set(cities)];
  }, [trips]);

  const getUniqueCarModels = useCallback(() => {
    const models = trips
      .map((trip) => trip.carModel)
      .filter((model): model is string => !!model);
    return [...new Set(models)];
  }, [trips]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const toRad = (value: number): number => {
    return (value * Math.PI) / 180;
  };

  return {
    trips,
    currentTrip,
    isTracking,
    currentSpeed,
    currentLocation,
    lastSavedTrip,
    startTracking,
    stopTracking,
    cancelTracking,
    updateTripCarModel,
    getUniqueCountries,
    getUniqueCities,
    getUniqueCarModels,
    clearLastSavedTrip,
    syncUnsyncedTrips,
    speedCameraBlocked,
  };
});
