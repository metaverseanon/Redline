import React, { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, Pressable, TextInput, Image, Platform, Alert, ActivityIndicator, Linking, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Trophy, Zap, Navigation, Gauge, ChevronDown, X, MapPin, Car, Filter, Activity, Route, Search, Clock, Calendar, CornerDownRight, ChevronRight, Timer, Users, Send, Bell, Check, XCircle, Share2, Navigation2, MessageCircle, AlertCircle, UserPlus, UserCheck } from 'lucide-react-native';
import * as Location from 'expo-location';
import type { DriveMeetup } from '@/types/meetup';
import * as Haptics from 'expo-haptics';
import { trpc } from '@/lib/trpc';
import { keepPreviousData } from '@tanstack/react-query';
import { router } from 'expo-router';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { useTrips } from '@/providers/TripProvider';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';
import { useNotifications } from '@/providers/NotificationProvider';
import AnimatedCard from '@/components/AnimatedCard';
import { COUNTRIES } from '@/constants/countries';
import { CAR_BRANDS, getModelsForBrand } from '@/constants/cars';
import { LeaderboardCategory, LeaderboardFilters, TripStats } from '@/types/trip';
import { ThemeColors } from '@/constants/colors';

interface RoutePoint {
  latitude: number;
  longitude: number;
}

interface LeaderboardTrip extends TripStats {
  userId?: string;
  userName?: string;
  userProfilePicture?: string;
  routePoints?: RoutePoint[];
}

type FilterType = 'country' | 'city' | 'carBrand' | 'carModel';
type TimePeriod = 'today' | 'week' | 'month' | 'year' | 'all';

const MEETUP_DURATION_MS = 60 * 60 * 1000;

const MeetupCountdownBar = memo(function MeetupCountdownBar({ createdAt, expiresAt, colors }: { createdAt: number; expiresAt: number; colors: ThemeColors }) {
  const [now, setNow] = useState(Date.now());
  const barWidth = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  const totalDuration = expiresAt - createdAt;
  const remaining = Math.max(0, expiresAt - now);
  const progress = totalDuration > 0 ? remaining / totalDuration : 0;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const isUrgent = remaining < 10 * 60 * 1000;
  const barColor = isUrgent ? colors.danger : colors.primary;

  if (remaining <= 0) {
    return (
      <View style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <AlertCircle size={10} color={colors.danger} />
          <Text style={{ fontSize: 10, fontFamily: 'Orbitron_500Medium', color: colors.danger }}>Expired</Text>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: `${colors.danger}30` }} />
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Timer size={10} color={isUrgent ? colors.danger : colors.textLight} />
          <Text style={{ fontSize: 10, fontFamily: 'Orbitron_500Medium', color: isUrgent ? colors.danger : colors.textLight }}>
            {timeString} left
          </Text>
        </View>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: `${barColor}20`, overflow: 'hidden' as const }}>
        <Animated.View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: barColor,
            width: barWidth.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          }}
        />
      </View>
    </View>
  );
});

export default function LeaderboardScreen() {
  const { trips } = useTrips();
  const { convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel, getAccelerationLabel, colors } = useSettings();
  const { user } = useUser();
  const { pendingAction, clearPendingAction } = useNotifications();
  const [activeCategory, setActiveCategory] = useState<LeaderboardCategory>('topSpeed');
  const [filters, setFilters] = useState<LeaderboardFilters>({});
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilterType, setActiveFilterType] = useState<FilterType | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [carBrandSearch, setCarBrandSearch] = useState('');
  const [carModelSearch, setCarModelSearch] = useState('');
  const [selectedTrip, setSelectedTrip] = useState<LeaderboardTrip | null>(null);
  const [showTripDetail, setShowTripDetail] = useState(false);
  const [showNearbyDrivers, setShowNearbyDrivers] = useState(false);
  const [pingingUserId, setPingingUserId] = useState<string | null>(null);
  const [showMeetupsModal, setShowMeetupsModal] = useState(false);
  const [respondingMeetupId, setRespondingMeetupId] = useState<string | null>(null);
  const [sharingLocationMeetupId, setSharingLocationMeetupId] = useState<string | null>(null);
  const [selectedMeetup, setSelectedMeetup] = useState<DriveMeetup | null>(null);
  const [meetupView, setMeetupView] = useState<'list' | 'detail'>('list');
  const selectedMeetupId = useRef<string | null>(null);
  const [viewLocationCoords, setViewLocationCoords] = useState<{ latitude: number; longitude: number; name: string } | null>(null);
  const [showLocationMapModal, setShowLocationMapModal] = useState(false);
  const [showNavChooser, setShowNavChooser] = useState(false);
  const [navTarget, setNavTarget] = useState<{ latitude: number; longitude: number; name: string } | null>(null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearbyModalReady, setNearbyModalReady] = useState(false);
  const [meetupsModalReady, setMeetupsModalReady] = useState(false);
  const pendingNavRef = useRef<{ latitude: number; longitude: number; name: string } | null>(null);
  const [followingUsers, setFollowingUsers] = useState<Record<string, boolean>>({});
  const [followLoadingUserId, setFollowLoadingUserId] = useState<string | null>(null);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());

  const handleAvatarError = useCallback((uri: string) => {
    setFailedAvatars(prev => {
      const next = new Set(prev);
      next.add(uri);
      return next;
    });
  }, []);

  const isValidAvatar = useCallback((uri?: string): uri is string => {
    return !!uri && uri.trim().length > 0 && !failedAvatars.has(uri);
  }, [failedAvatars]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const meetupsRefetchRef = useRef<(() => void) | null>(null);

  const updateLocationMutation = trpc.user.updateUserLocation.useMutation();

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        if (Platform.OS === 'web') {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const coords = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                };
                console.log('[NEARBY] Got web location:', coords);
                setUserCoords(coords);
                if (user?.id) {
                  updateLocationMutation.mutate({ userId: user.id, ...coords });
                }
              },
              (err) => console.log('[NEARBY] Web geolocation error:', err.message),
              { enableHighAccuracy: false, timeout: 10000 }
            );
          }
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            console.log('[NEARBY] Location permission denied');
            return;
          }
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          console.log('[NEARBY] Got native location:', coords);
          setUserCoords(coords);
          if (user?.id) {
            updateLocationMutation.mutate({ userId: user.id, ...coords });
          }
        }
      } catch (error) {
        console.log('[NEARBY] Failed to get location:', error);
      }
    };

    if (user?.id) {
      fetchLocation();
    }
  }, [user?.id]);

  const nearbyUsersQuery = trpc.user.getNearbyUsers.useQuery(
    {
      userId: user?.id || '',
      latitude: userCoords?.latitude,
      longitude: userCoords?.longitude,
      country: user?.country,
      city: user?.city,
    },
    {
      enabled: !!user?.id && userCoords != null,
    }
  );

  const meetupsQuery = trpc.notifications.getMeetups.useQuery(
    { userId: user?.id || '' },
    { enabled: !!user?.id, refetchInterval: 30000 }
  );

  meetupsRefetchRef.current = meetupsQuery.refetch;

  const lastHandledActionRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingAction?.type === 'open_meetups') {
      const actionKey = `${pendingAction.meetupId || ''}_${Date.now()}`;
      if (lastHandledActionRef.current === pendingAction.meetupId && pendingAction.meetupId) {
        console.log('[LEADERBOARD] Already handled this meetup action:', pendingAction.meetupId);
        clearPendingAction();
        return;
      }
      lastHandledActionRef.current = pendingAction.meetupId || null;
      const actionMeetupId = pendingAction.meetupId;
      const actionFromUserName = pendingAction.fromUserName;
      console.log('[LEADERBOARD] Pending action detected, meetupId:', actionMeetupId, 'from:', actionFromUserName);
      clearPendingAction();

      const openModal = () => {
        console.log('[LEADERBOARD] Opening meetups modal from notification');
        setMeetupView('list');
        setShowMeetupsModal(true);
        setMeetupsModalReady(true);
      };

      const doRefetchAndOpen = async () => {
        console.log('[LEADERBOARD] Refetching meetups after notification open...');
        try {
          const result = await meetupsQuery.refetch();
          console.log('[LEADERBOARD] Meetups refetch complete, count:', result.data?.length);
          openModal();
        } catch (e) {
          console.error('[LEADERBOARD] Meetups refetch failed:', e);
          openModal();
        }
      };

      setTimeout(() => doRefetchAndOpen(), 300);
    }
  }, [pendingAction, clearPendingAction]);

  useEffect(() => {
    if (pendingNavRef.current && !showMeetupsModal) {
      const target = pendingNavRef.current;
      pendingNavRef.current = null;
      console.log('[MEETUP] Opening nav chooser after modal closed for:', target.name);
      setTimeout(() => {
        setNavTarget(target);
        setShowNavChooser(true);
      }, 400);
    }
  }, [showMeetupsModal]);

  const sendPingMutation = trpc.notifications.sendDrivePing.useMutation({
    onSuccess: (data) => {
      setPingingUserId(null);
      const wasSuccess = data.success;
      const failMessage = data.message;
      
      setShowNearbyDrivers(false);
      setNearbyModalReady(false);
      
      setTimeout(() => {
        if (wasSuccess) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Ping Sent!', 'Your drive invite has been sent.');
          meetupsQuery.refetch();
        } else {
          Alert.alert('Could not send', failMessage || 'User may not have notifications enabled.');
        }
      }, 400);
    },
    onError: (error) => {
      console.error('Failed to send ping:', error);
      setPingingUserId(null);
      
      setShowNearbyDrivers(false);
      setNearbyModalReady(false);
      
      setTimeout(() => {
        Alert.alert('Error', 'Failed to send drive invite. Please try again.');
      }, 400);
    },
  });

  const autoShareLocationRef = useRef<string | null>(null);
  const autoSharedMeetupIds = useRef<Set<string>>(new Set());

  const acceptedMeetupIdRef = useRef<string | null>(null);

  const respondToPingMutation = trpc.notifications.respondToPing.useMutation({
    onSuccess: async (data: any) => {
      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (data.status === 'accepted') {
          const acceptedId = respondingMeetupId;
          acceptedMeetupIdRef.current = acceptedId;
          console.log('[MEETUP] Accepted meetup:', acceptedId);

          const meetup = meetups.find(m => m.id === acceptedId);
          const pingerName = meetup?.fromUserName || 'Driver';

          const fromLoc = data.fromUserLocation;
          
          const openNavForLocation = (lat: number, lng: number, name: string) => {
            console.log('[MEETUP] Scheduling nav chooser for:', name, lat, lng);
            const navData = { latitude: lat, longitude: lng, name };
            if (showMeetupsModal) {
              pendingNavRef.current = navData;
              setShowMeetupsModal(false);
              setMeetupsModalReady(false);
            } else {
              setTimeout(() => {
                setNavTarget(navData);
                setShowNavChooser(true);
              }, 300);
            }
          };

          try {
            const result = await meetupsQuery.refetch();
            console.log('[MEETUP] Refetched meetups after accept, count:', result.data?.length);
            
            if (fromLoc && fromLoc.latitude && fromLoc.longitude) {
              console.log('[MEETUP] Pinger location available from response');
              openNavForLocation(fromLoc.latitude, fromLoc.longitude, pingerName);
            } else if (acceptedId) {
              const freshMeetup = result.data?.find((m: DriveMeetup) => m.id === acceptedId);
              if (freshMeetup?.fromUserLocation) {
                console.log('[MEETUP] Pinger location found after refetch');
                openNavForLocation(
                  freshMeetup.fromUserLocation!.latitude,
                  freshMeetup.fromUserLocation!.longitude,
                  freshMeetup.fromUserName
                );
              } else {
                console.log('[MEETUP] Pinger location not available yet');
                Alert.alert(
                  'Drive Accepted!',
                  `You accepted ${pingerName}'s invite! Their location will appear once they share it. You can navigate to them from the meetup details.`,
                  [{ text: 'OK' }]
                );
              }
            }
            acceptedMeetupIdRef.current = null;
          } catch (e) {
            console.error('[MEETUP] Refetch after accept failed:', e);
            if (fromLoc && fromLoc.latitude && fromLoc.longitude) {
              openNavForLocation(fromLoc.latitude, fromLoc.longitude, pingerName);
            }
            acceptedMeetupIdRef.current = null;
          }
        } else {
          await meetupsQuery.refetch();
        }
      }
      setRespondingMeetupId(null);
    },
    onError: (error) => {
      console.error('Failed to respond to ping:', error);
      Alert.alert('Error', 'Failed to respond. Please try again.');
      setRespondingMeetupId(null);
      acceptedMeetupIdRef.current = null;
    },
  });

  const shareLocationMutation = trpc.notifications.shareLocation.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        meetupsQuery.refetch();
        console.log('[MEETUP] Location shared successfully');
      } else {
        Alert.alert('Error', data.message || 'Failed to share location.');
      }
      setSharingLocationMeetupId(null);
    },
    onError: (error) => {
      console.error('Failed to share location:', error);
      Alert.alert('Error', 'Failed to share location. Please try again.');
      setSharingLocationMeetupId(null);
    },
  });

  const cancelMeetupMutation = trpc.notifications.cancelMeetup.useMutation({
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      meetupsQuery.refetch();
      setMeetupView('list');
      setSelectedMeetup(null);
      selectedMeetupId.current = null;
    },
  });

  const getLocationWithTimeout = useCallback(async (timeoutMs: number = 8000): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      if (Platform.OS === 'web') {
        return new Promise((resolve) => {
          if (!navigator.geolocation) { resolve(null); return; }
          const timer = setTimeout(() => resolve(null), timeoutMs);
          navigator.geolocation.getCurrentPosition(
            (pos) => { clearTimeout(timer); resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); },
            () => { clearTimeout(timer); resolve(null); },
            { enableHighAccuracy: false, timeout: timeoutMs }
          );
        });
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;

      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
      const result = await Promise.race([locationPromise, timeoutPromise]);
      if (result && 'coords' in result) {
        return { latitude: result.coords.latitude, longitude: result.coords.longitude };
      }

      console.log('[MEETUP] High accuracy timed out, trying last known...');
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        return { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
      }
      return userCoords;
    } catch (error) {
      console.error('[MEETUP] Location error:', error);
      return userCoords;
    }
  }, [userCoords]);

  const handlePingUser = useCallback((targetUserId: string, targetUserName: string, targetUserCar?: string) => {
    if (!user || targetUserId === user.id || targetUserName === user.displayName) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPingingUserId(targetUserId);
    
    const carInfo = user.carBrand && user.carModel 
      ? `${user.carBrand} ${user.carModel}` 
      : undefined;
    
    sendPingMutation.mutate({
      fromUserId: user.id,
      fromUserName: user.displayName,
      fromUserCar: carInfo,
      toUserId: targetUserId,
      toUserName: targetUserName,
      toUserCar: targetUserCar,
    });
  }, [user, sendPingMutation]);

  const handleRespondToPing = useCallback(async (meetupId: string, response: 'accepted' | 'declined') => {
    if (!user) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRespondingMeetupId(meetupId);
    
    respondToPingMutation.mutate({
      meetupId,
      response,
      responderId: user.id,
      responderName: user.displayName,
    });
  }, [user, respondToPingMutation]);

  const handleShareLocation = useCallback(async (meetup: DriveMeetup, silent: boolean = false) => {
    if (!user) return;
    
    if (!silent) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharingLocationMeetupId(meetup.id);
    
    try {
      console.log('[MEETUP] Getting location for sharing...');
      const coords = await getLocationWithTimeout(8000);

      if (!coords) {
        if (!silent) Alert.alert('Location Error', 'Could not get your location. Please try again.');
        setSharingLocationMeetupId(null);
        return;
      }

      console.log('[MEETUP] Sharing location:', coords);
      shareLocationMutation.mutate({
        meetupId: meetup.id,
        userId: user.id,
        userName: user.displayName,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } catch (error) {
      console.error('[MEETUP] Failed to share location:', error);
      if (!silent) Alert.alert('Error', 'Failed to get your location. Please try again.');
      setSharingLocationMeetupId(null);
    }
  }, [user, shareLocationMutation, getLocationWithTimeout]);

  const handleShareLocationRef = useRef(handleShareLocation);
  useEffect(() => { handleShareLocationRef.current = handleShareLocation; }, [handleShareLocation]);

  useEffect(() => {
    const meetupIdToAutoShare = autoShareLocationRef.current;
    if (!meetupIdToAutoShare || !user) return;
    autoShareLocationRef.current = null;

    const refetchAndShare = async () => {
      console.log('[MEETUP] Auto-sharing location after accepting meetup:', meetupIdToAutoShare);
      try {
        const result = await meetupsQuery.refetch();
        const freshMeetups = result.data || [];
        const acceptedMeetup = freshMeetups.find((m: DriveMeetup) => m.id === meetupIdToAutoShare && m.status === 'accepted');
        if (acceptedMeetup) {
          const isAccepter = acceptedMeetup.toUserId === user.id;
          const myLoc = isAccepter ? acceptedMeetup.toUserLocation : acceptedMeetup.fromUserLocation;
          if (!myLoc) {
            autoSharedMeetupIds.current.add(meetupIdToAutoShare);
            handleShareLocationRef.current(acceptedMeetup, true);
          }
        }
      } catch (e) {
        console.error('[MEETUP] Auto-share refetch failed:', e);
      }
    };

    const timer = setTimeout(refetchAndShare, 800);
    return () => clearTimeout(timer);
  }, [respondToPingMutation.isSuccess]);

  const autoShareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !meetupsQuery.data) return;
    if (shareLocationMutation.isPending) return;

    if (autoShareTimerRef.current) {
      clearTimeout(autoShareTimerRef.current);
    }

    autoShareTimerRef.current = setTimeout(() => {
      if (shareLocationMutation.isPending) return;
      const acceptedMeetups = meetupsQuery.data!.filter((m: DriveMeetup) => m.status === 'accepted');
      
      for (const meetup of acceptedMeetups) {
        if (autoSharedMeetupIds.current.has(meetup.id)) continue;
        
        const isFromUser = meetup.fromUserId === user!.id;
        const isToUser = meetup.toUserId === user!.id;
        if (!isFromUser && !isToUser) continue;

        const myLoc = isToUser ? meetup.toUserLocation : meetup.fromUserLocation;
        if (!myLoc) {
          console.log('[MEETUP] Auto-sharing location for accepted meetup:', meetup.id, isFromUser ? '(sender)' : '(accepter)');
          autoSharedMeetupIds.current.add(meetup.id);
          handleShareLocationRef.current(meetup, true);
          break;
        }
      }
    }, 1000);

    return () => {
      if (autoShareTimerRef.current) {
        clearTimeout(autoShareTimerRef.current);
      }
    };
  }, [meetupsQuery.data, user, shareLocationMutation.isPending]);



  const handleNavigateToLocation = useCallback((latitude: number, longitude: number, name?: string) => {
    console.log('[MEETUP] Opening nav chooser for:', name, latitude, longitude);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const navData = { latitude, longitude, name: name || 'Driver' };
    if (showMeetupsModal) {
      pendingNavRef.current = navData;
      setShowMeetupsModal(false);
      setMeetupsModalReady(false);
    } else {
      setNavTarget(navData);
      setShowNavChooser(true);
    }
  }, [showMeetupsModal]);

  const handleOpenExternalMaps = useCallback((latitude: number, longitude: number) => {
    setNavTarget({ latitude, longitude, name: 'Driver' });
    setShowNavChooser(true);
  }, []);

  const openNavApp = useCallback(async (app: 'apple' | 'google' | 'waze' | 'web') => {
    if (!navTarget) return;
    const { latitude, longitude } = navTarget;
    let url = '';
    
    switch (app) {
      case 'apple':
        url = `maps://app?daddr=${latitude},${longitude}&dirflg=d`;
        break;
      case 'google':
        url = `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`;
        break;
      case 'waze':
        url = `waze://?ll=${latitude},${longitude}&navigate=yes`;
        break;
      case 'web':
        url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
        break;
    }

    try {
      if (app === 'web') {
        await Linking.openURL(url);
      } else {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        } else {
          if (app === 'google') {
            await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`);
          } else if (app === 'waze') {
            await Linking.openURL(`https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`);
          } else {
            await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`);
          }
        }
      }
    } catch {
      await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`);
    }
    setShowNavChooser(false);
    setNavTarget(null);
  }, [navTarget]);

  const handleCancelMeetup = useCallback((meetup: DriveMeetup) => {
    if (!user) return;
    
    Alert.alert(
      'Cancel Meetup',
      'Are you sure you want to cancel this meetup?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => {
            cancelMeetupMutation.mutate({
              meetupId: meetup.id,
              userId: user.id,
              userName: user.displayName,
            });
          },
        },
      ]
    );
  }, [user, cancelMeetupMutation]);

  const nearbyUsers = useMemo(() => (nearbyUsersQuery.data || []).filter(d => String(d.id) !== String(user?.id) && d.displayName !== user?.displayName), [nearbyUsersQuery.data, user?.id, user?.displayName]);
  const meetups = useMemo(() => meetupsQuery.data || [], [meetupsQuery.data]);

  const pendingIncomingPings = useMemo(() => {
    return meetups.filter(m => m.status === 'pending' && m.toUserId === user?.id);
  }, [meetups, user?.id]);

  const activeMeetups = useMemo(() => {
    return meetups.filter(m => m.status === 'accepted');
  }, [meetups]);

  const pendingOutgoingPings = useMemo(() => {
    return meetups.filter(m => m.status === 'pending' && m.fromUserId === user?.id);
  }, [meetups, user?.id]);

  useEffect(() => {
    if (selectedMeetupId.current && meetupsQuery.data) {
      const fresh = meetupsQuery.data.find((m: DriveMeetup) => m.id === selectedMeetupId.current);
      if (fresh) {
        setSelectedMeetup(fresh);
      }
    }
  }, [meetupsQuery.data]);

  const CATEGORIES = useMemo(() => [
    { key: 'topSpeed' as LeaderboardCategory, label: 'Top Speed', icon: <Zap size={16} color={colors.warning} /> },
    { key: 'distance' as LeaderboardCategory, label: 'Trip Distance', icon: <Navigation size={16} color={colors.accent} /> },
    { key: 'totalDistance' as LeaderboardCategory, label: 'All-Time Distance', icon: <Route size={16} color={colors.primary} /> },
    { key: 'acceleration' as LeaderboardCategory, label: 'Acceleration', icon: <Gauge size={16} color={colors.success} /> },
    { key: 'gForce' as LeaderboardCategory, label: 'Max G-Force', icon: <Activity size={16} color={colors.danger} /> },
    { key: 'zeroToHundred' as LeaderboardCategory, label: getAccelerationLabel('0-100'), icon: <Timer size={16} color={colors.primary} /> },
    { key: 'zeroToTwoHundred' as LeaderboardCategory, label: getAccelerationLabel('0-200'), icon: <Timer size={16} color={colors.accent} /> },
    { key: 'hundredToTwoHundred' as LeaderboardCategory, label: getAccelerationLabel('100-200'), icon: <Timer size={16} color={colors.warning} /> },
    { key: 'challengesCompleted' as LeaderboardCategory, label: 'Challenges %', icon: <Trophy size={16} color="#FFD700" /> },
  ], [colors, getAccelerationLabel]);

  const activeCategory_data = useMemo(() => {
    return CATEGORIES.find(c => c.key === activeCategory);
  }, [CATEGORIES, activeCategory]);

  const countries = useMemo(() => COUNTRIES.map(c => ({ code: c.code, name: c.name, flag: c.flag })), []);
  
  const cities = useMemo(() => {
    if (!filters.country) return [];
    const countryData = COUNTRIES.find(c => c.name === filters.country);
    if (countryData) {
      return [...countryData.cities].sort((a, b) => a.localeCompare(b));
    }
    const citiesFromTrips = trips
      .filter(trip => trip.location?.country === filters.country)
      .map(trip => trip.location?.city)
      .filter((city): city is string => !!city && city !== 'Unknown');
    return [...new Set(citiesFromTrips)].sort((a, b) => a.localeCompare(b));
  }, [trips, filters.country]);
  
  const carBrands = useMemo(() => {
    return CAR_BRANDS.map(brand => brand.name);
  }, []);

  const carModels = useMemo(() => {
    if (!filters.carBrand) return [];
    return getModelsForBrand(filters.carBrand);
  }, [filters.carBrand]);

  const TIME_PERIODS: { key: TimePeriod; label: string }[] = useMemo(() => [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'all', label: 'All Time' },
  ], []);

  const getTimePeriodStart = useCallback((period: TimePeriod): number => {
    const now = new Date();
    switch (period) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      case 'week':
        const dayOfWeek = (now.getDay() + 6) % 7;
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        return startOfWeek.getTime();
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      case 'year':
        return new Date(now.getFullYear(), 0, 1).getTime();
      case 'all':
      default:
        return 0;
    }
  }, []);

  const matchesCountryFilter = useCallback((tripCountry: string | undefined, filterCountry: string) => {
    if (!tripCountry) return false;
    if (tripCountry === filterCountry) return true;
    
    const tripCountryLower = tripCountry.toLowerCase();
    const filterCountryLower = filterCountry.toLowerCase();
    if (tripCountryLower === filterCountryLower) return true;
    
    const selectedCountry = COUNTRIES.find(c => c.name === filterCountry);
    if (!selectedCountry) return false;
    
    const nativeNames: Record<string, string[]> = {
      'HR': ['hrvatska', 'croatia'],
      'DE': ['deutschland', 'germany'],
      'ES': ['españa', 'spain'],
      'FR': ['france'],
      'IT': ['italia', 'italy'],
      'PL': ['polska', 'poland'],
      'NL': ['nederland', 'netherlands'],
      'PT': ['portugal'],
      'AT': ['österreich', 'austria'],
      'CH': ['schweiz', 'suisse', 'svizzera', 'switzerland'],
      'BE': ['belgique', 'belgië', 'belgium'],
      'CZ': ['česko', 'czech republic', 'czechia'],
      'HU': ['magyarország', 'hungary'],
      'SK': ['slovensko', 'slovakia'],
      'SI': ['slovenija', 'slovenia'],
      'RS': ['srbija', 'serbia'],
      'BA': ['bosna i hercegovina', 'bosnia and herzegovina'],
      'ME': ['crna gora', 'montenegro'],
      'MK': ['северна македонија', 'north macedonia'],
      'AL': ['shqipëria', 'albania'],
      'GR': ['ελλάδα', 'greece'],
      'BG': ['българия', 'bulgaria'],
      'RO': ['românia', 'romania'],
      'UA': ['україна', 'ukraine'],
      'RU': ['россия', 'russia'],
      'TR': ['türkiye', 'turkey'],
      'SE': ['sverige', 'sweden'],
      'NO': ['norge', 'norway'],
      'DK': ['danmark', 'denmark'],
      'FI': ['suomi', 'finland'],
      'JP': ['日本', 'japan'],
      'CN': ['中国', 'china'],
      'KR': ['대한민국', 'south korea'],
      'BR': ['brasil', 'brazil'],
      'MX': ['méxico', 'mexico'],
      'AR': ['argentina'],
    };
    
    const alternateNames = nativeNames[selectedCountry.code] || [];
    return alternateNames.some(name => tripCountryLower === name || tripCountryLower.includes(name));
  }, []);

  const timePeriodStart = useMemo(() => getTimePeriodStart(timePeriod), [timePeriod, getTimePeriodStart]);

  const leaderboardTripsQuery = trpc.trips.getLeaderboardTrips.useQuery(
    {
      category: activeCategory === 'challengesCompleted' ? 'topSpeed' : activeCategory,
      country: filters.country,
      city: filters.city,
      carBrand: filters.carBrand,
      carModel: filters.carModel,
      timePeriod: timePeriod,
      timePeriodStart: timePeriodStart > 0 ? timePeriodStart : undefined,
      limit: 10,
    },
    {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      placeholderData: keepPreviousData,
      enabled: activeCategory !== 'challengesCompleted',
    }
  );

  const challengesLeaderboardQuery = trpc.social.getChallengesLeaderboard.useQuery(
    { limit: 10 },
    {
      enabled: activeCategory === 'challengesCompleted',
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      placeholderData: keepPreviousData,
    }
  );

  const filteredLocalTrips = useMemo(() => {
    const timePeriodStart = getTimePeriodStart(timePeriod);
    
    return trips.filter((trip) => {
      if (timePeriod !== 'all' && trip.startTime < timePeriodStart) return false;
      if (filters.country && !matchesCountryFilter(trip.location?.country, filters.country)) return false;
      if (filters.city && trip.location?.city !== filters.city) return false;
      if (filters.carBrand && filters.carModel) {
        const fullCarModel = `${filters.carBrand} ${filters.carModel}`;
        if (trip.carModel !== fullCarModel) return false;
      } else if (filters.carBrand) {
        if (!trip.carModel?.startsWith(filters.carBrand)) return false;
      }
      return true;
    }).map(trip => ({
      ...trip,
      userId: user?.id,
      userName: user?.displayName,
      userProfilePicture: user?.profilePicture,
    })) as LeaderboardTrip[];
  }, [trips, filters, timePeriod, getTimePeriodStart, matchesCountryFilter, user]);

  const challengesLeaderboardData = useMemo(() => {
    if (activeCategory !== 'challengesCompleted') return [];
    return (challengesLeaderboardQuery.data || []) as Array<{
      userId: string;
      userName: string;
      userProfilePicture?: string;
      achievementCount: number;
      totalAchievements: number;
      completionPercent: number;
    }>;
  }, [activeCategory, challengesLeaderboardQuery.data]);

  const leaderboardData = useMemo(() => {
    if (activeCategory === 'challengesCompleted') return [];
    const backendTrips: LeaderboardTrip[] = (leaderboardTripsQuery.data || []).map(t => ({
      ...t,
      locations: [],
    }));
    
    const allTrips = [...backendTrips];
    
    filteredLocalTrips.forEach(localTrip => {
      const backendIdx = allTrips.findIndex(t => t.id === localTrip.id);
      if (backendIdx !== -1) {
        const updates: Partial<LeaderboardTrip> = {};
        if (localTrip.locations && localTrip.locations.length > 1) {
          updates.locations = localTrip.locations;
        }
        if (Object.keys(updates).length > 0) {
          allTrips[backendIdx] = { ...allTrips[backendIdx], ...updates };
        }
      } else {
        allTrips.push(localTrip);
      }
    });

    if (activeCategory === 'totalDistance') {
      return allTrips.slice(0, 10);
    }
    
    let sorted: LeaderboardTrip[] = [];

    switch (activeCategory) {
      case 'topSpeed':
        sorted = [...allTrips]
          .filter((t) => t.topSpeed > 0)
          .sort((a, b) => b.topSpeed - a.topSpeed);
        break;
      case 'distance':
        sorted = [...allTrips]
          .filter((t) => t.distance > 0)
          .sort((a, b) => b.distance - a.distance);
        break;
      case 'acceleration':
        sorted = [...allTrips]
          .filter((t) => (t.acceleration ?? 0) > 0 && (t.acceleration ?? 0) <= 20)
          .sort((a, b) => (b.acceleration ?? 0) - (a.acceleration ?? 0));
        break;
      case 'gForce':
        sorted = [...allTrips]
          .filter((t) => (t.maxGForce ?? 0) > 0 && (t.maxGForce ?? 0) <= 4.0)
          .sort((a, b) => (b.maxGForce ?? 0) - (a.maxGForce ?? 0));
        break;
      case 'zeroToHundred':
        sorted = [...allTrips]
          .filter((t) => (t.time0to100 ?? 0) >= 2.0)
          .sort((a, b) => (a.time0to100 ?? Infinity) - (b.time0to100 ?? Infinity));
        break;
      case 'zeroToTwoHundred':
        sorted = [...allTrips]
          .filter((t) => (t.time0to200 ?? 0) >= 5.0)
          .sort((a, b) => (a.time0to200 ?? Infinity) - (b.time0to200 ?? Infinity));
        break;
      case 'hundredToTwoHundred':
        sorted = [...allTrips]
          .filter((t) => (t.time100to200 ?? 0) >= 3.0)
          .sort((a, b) => (a.time100to200 ?? Infinity) - (b.time100to200 ?? Infinity));
        break;
    }

    return sorted.slice(0, 10);
  }, [filteredLocalTrips, leaderboardTripsQuery.data, activeCategory]);

  const leaderboardUserIds = useMemo(() => {
    const ids = leaderboardData
      .map(t => t.userId)
      .filter((id): id is string => !!id && id !== user?.id);
    return [...new Set(ids)];
  }, [leaderboardData, user?.id]);

  const leaderboardTripIds = useMemo(() => {
    const ids = leaderboardData
      .map(t => t.id)
      .filter((id): id is string => !!id)
      .filter(id => {
        const t = leaderboardData.find(x => x.id === id);
        const hasLocal = (t?.locations && t.locations.length > 1) || (t?.routePoints && t.routePoints.length > 1);
        return !hasLocal;
      });
    return [...new Set(ids)].slice(0, 20);
  }, [leaderboardData]);

  const batchRoutesQuery = trpc.trips.getBatchRoutePoints.useQuery(
    { tripIds: leaderboardTripIds },
    {
      enabled: leaderboardTripIds.length > 0,
      staleTime: 5 * 60_000,
      gcTime: 10 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );

  const batchRoutes = batchRoutesQuery.data?.routes ?? {};

  const getTripRoute = useCallback((trip: LeaderboardTrip): RoutePoint[] => {
    if (trip.locations && trip.locations.length > 1) {
      return trip.locations.map(l => ({ latitude: l.latitude, longitude: l.longitude }));
    }
    if (trip.routePoints && trip.routePoints.length > 1) {
      return trip.routePoints;
    }
    const remote = trip.id ? batchRoutes[trip.id] : undefined;
    if (remote && remote.length > 1) return remote;
    return [];
  }, [batchRoutes]);

  const batchFollowQuery = trpc.social.batchIsFollowing.useQuery(
    { followerId: user?.id || '', followingIds: leaderboardUserIds },
    { enabled: !!user?.id && leaderboardUserIds.length > 0 }
  );

  useEffect(() => {
    if (batchFollowQuery.data?.followingMap) {
      setFollowingUsers(prev => ({ ...prev, ...batchFollowQuery.data.followingMap }));
    }
  }, [batchFollowQuery.data]);

  const followMutation = trpc.social.follow.useMutation({
    onSuccess: (data, variables) => {
      if (data.success) {
        setFollowingUsers(prev => ({ ...prev, [variables.followingId]: true }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setFollowLoadingUserId(null);
    },
    onError: () => {
      setFollowLoadingUserId(null);
      Alert.alert('Error', 'Failed to follow user.');
    },
  });

  const unfollowMutation = trpc.social.unfollow.useMutation({
    onSuccess: (data, variables) => {
      if (data.success) {
        setFollowingUsers(prev => ({ ...prev, [variables.followingId]: false }));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setFollowLoadingUserId(null);
    },
    onError: () => {
      setFollowLoadingUserId(null);
      Alert.alert('Error', 'Failed to unfollow user.');
    },
  });

  const handleFollowToggle = useCallback((targetUserId: string, targetUserName?: string) => {
    if (!user?.id || followLoadingUserId || targetUserId === user.id || (targetUserName && targetUserName === user.displayName)) return;
    setFollowLoadingUserId(targetUserId);
    const isCurrentlyFollowing = followingUsers[targetUserId] === true;
    if (isCurrentlyFollowing) {
      unfollowMutation.mutate({ followerId: user.id, followingId: targetUserId });
    } else {
      followMutation.mutate({ followerId: user.id, followingId: targetUserId });
    }
  }, [user?.id, followingUsers, followLoadingUserId, followMutation, unfollowMutation]);


  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatValue = (trip: TripStats) => {
    switch (activeCategory) {
      case 'topSpeed':
        return `${Math.round(convertSpeed(trip.topSpeed))} ${getSpeedLabel()}`;
      case 'distance':
      case 'totalDistance':
        return `${convertDistance(trip.distance).toFixed(2)} ${getDistanceLabel()}`;
      case 'acceleration':
        return `${(trip.acceleration ?? 0).toFixed(2)} m/s²`;
      case 'gForce':
        return `${(trip.maxGForce ?? 0).toFixed(2)} G`;
      case 'zeroToHundred':
        return `${(trip.time0to100 ?? 0).toFixed(2)}s`;
      case 'zeroToTwoHundred':
        return `${(trip.time0to200 ?? 0).toFixed(2)}s`;
      case 'hundredToTwoHundred':
        return `${(trip.time100to200 ?? 0).toFixed(2)}s`;
      case 'challengesCompleted':
        return '';
    }
  };

  const openTripDetail = useCallback((trip: LeaderboardTrip) => {
    setSelectedTrip(trip);
    setShowTripDetail(true);
  }, []);

  const batchRouteForSelected = selectedTrip?.id ? batchRoutes[selectedTrip.id] : undefined;

  const needsRemoteRoutePoints = !!selectedTrip
    && (!selectedTrip.locations || selectedTrip.locations.length <= 1)
    && (!selectedTrip.routePoints || selectedTrip.routePoints.length <= 1)
    && (!batchRouteForSelected || batchRouteForSelected.length <= 1);

  const tripRoutePointsQuery = trpc.trips.getTripRoutePoints.useQuery(
    { tripId: selectedTrip?.id || '' },
    {
      enabled: showTripDetail && needsRemoteRoutePoints && !!selectedTrip?.id,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );

  const remoteRoutePoints = tripRoutePointsQuery.data?.routePoints as RoutePoint[] | undefined;

  const closeTripDetail = useCallback(() => {
    setShowTripDetail(false);
    setSelectedTrip(null);
  }, []);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  const getMapRegion = (locations: { latitude: number; longitude: number }[]) => {
    if (locations.length === 0) {
      return { latitude: 0, longitude: 0, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    }
    const lats = locations.map(l => l.latitude);
    const lngs = locations.map(l => l.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latDelta = Math.max((maxLat - minLat) * 1.3, 0.01);
    const lngDelta = Math.max((maxLng - minLng) * 1.3, 0.01);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  };

  const getSecondaryStats = useCallback((trip: TripStats) => {
    const stats: { label: string; value: string; iconType: 'speed' | 'distance' | 'gforce' | 'accel' }[] = [];
    
    if (activeCategory !== 'topSpeed' && trip.topSpeed > 0) {
      stats.push({
        label: 'Top Speed',
        value: `${Math.round(convertSpeed(trip.topSpeed))} ${getSpeedLabel()}`,
        iconType: 'speed',
      });
    }
    if (activeCategory !== 'distance' && activeCategory !== 'totalDistance' && trip.distance > 0) {
      stats.push({
        label: 'Distance',
        value: `${convertDistance(trip.distance).toFixed(1)} ${getDistanceLabel()}`,
        iconType: 'distance',
      });
    }
    if (activeCategory !== 'gForce' && (trip.maxGForce ?? 0) > 0) {
      stats.push({
        label: 'G-Force',
        value: `${(trip.maxGForce ?? 0).toFixed(2)} G`,
        iconType: 'gforce',
      });
    }
    if (activeCategory !== 'acceleration' && (trip.acceleration ?? 0) > 0) {
      stats.push({
        label: 'Accel',
        value: `${(trip.acceleration ?? 0).toFixed(1)} m/s²`,
        iconType: 'accel',
      });
    }

    return stats;
  }, [activeCategory, convertSpeed, getSpeedLabel, convertDistance, getDistanceLabel]);

  const statIconMap = useMemo(() => ({
    speed: <Zap size={12} color={colors.warning} />,
    distance: <Navigation size={12} color={colors.accent} />,
    gforce: <Activity size={12} color={colors.danger} />,
    accel: <Gauge size={12} color={colors.success} />,
  }), [colors]);

  const openFilterModal = useCallback((type: FilterType) => {
    setActiveFilterType(type);
    setCountrySearch('');
    setShowFilterModal(true);
  }, []);

  const selectFilter = useCallback((value: string | undefined) => {
    if (!activeFilterType) return;

    setFilters((prev) => {
      const newFilters = { ...prev };
      
      if (value === undefined) {
        delete newFilters[activeFilterType];
        if (activeFilterType === 'country') {
          delete newFilters.city;
        }
        if (activeFilterType === 'carBrand') {
          delete newFilters.carModel;
        }
      } else {
        newFilters[activeFilterType] = value;
        if (activeFilterType === 'country') {
          delete newFilters.city;
        }
        if (activeFilterType === 'carBrand') {
          delete newFilters.carModel;
        }
      }
      
      return newFilters;
    });
    
    setShowFilterModal(false);
    setActiveFilterType(null);
  }, [activeFilterType]);

  const filterOptions = useMemo((): { value: string; label: string }[] => {
    switch (activeFilterType) {
      case 'country': {
        const filteredCountries = countrySearch
          ? countries.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
          : countries;
        return filteredCountries.map(c => ({ value: c.name, label: `${c.flag} ${c.name}` }));
      }
      case 'city':
        return cities.map(c => ({ value: c, label: c }));
      case 'carBrand': {
        const filteredBrands = carBrandSearch
          ? carBrands.filter(b => b.toLowerCase().includes(carBrandSearch.toLowerCase()))
          : carBrands;
        return filteredBrands.map(b => ({ value: b, label: b }));
      }
      case 'carModel': {
        const filteredModels = carModelSearch
          ? carModels.filter(m => m.toLowerCase().includes(carModelSearch.toLowerCase()))
          : carModels;
        return filteredModels.map(m => ({ value: m, label: m }));
      }
      default:
        return [];
    }
  }, [activeFilterType, countrySearch, carBrandSearch, carModelSearch, countries, cities, carBrands, carModels]);

  const getFilterTitle = () => {
    switch (activeFilterType) {
      case 'country':
        return 'Select Country';
      case 'city':
        return 'Select City';
      case 'carBrand':
        return 'Select Brand';
      case 'carModel':
        return 'Select Model';
      default:
        return '';
    }
  };

  const activeFiltersCount = Object.keys(filters).length;

  const userLocation = useMemo(() => {
    if (user?.city && user?.country) {
      return `${user.city}, ${user.country}`;
    } else if (user?.city) {
      return user.city;
    } else if (user?.country) {
      return user.country;
    }
    return null;
  }, [user?.city, user?.country]);

  const userPrimaryCar = useMemo(() => {
    if (user?.cars && user.cars.length > 0) {
      const primary = user.cars.find(c => c.isPrimary);
      return primary || user.cars[0];
    }
    if (user?.carBrand) {
      return { brand: user.carBrand, model: user.carModel || '' };
    }
    return null;
  }, [user?.cars, user?.carBrand, user?.carModel]);

  const getCarInfo = useCallback((trip: LeaderboardTrip) => {
    if (trip.carModel) {
      const parts = trip.carModel.split(' ');
      const brand = parts[0];
      const model = parts.slice(1).join(' ');
      return { brand, model, full: trip.carModel };
    }
    if (trip.userId === user?.id && userPrimaryCar) {
      return { 
        brand: userPrimaryCar.brand, 
        model: userPrimaryCar.model, 
        full: `${userPrimaryCar.brand} ${userPrimaryCar.model}` 
      };
    }
    return null;
  }, [userPrimaryCar, user?.id]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navHeader}>
        <Text style={styles.navTitle}>Leaderboard</Text>
      </View>

      {pendingIncomingPings.length > 0 && (
        <View style={styles.incomingPingBanner}>
          <View style={styles.incomingPingBannerContent}>
            <View style={styles.incomingPingIcon}>
              <Bell size={18} color={colors.textInverted} />
            </View>
            <View style={styles.incomingPingInfo}>
              <Text style={styles.incomingPingTitle}>
                {pendingIncomingPings.length === 1
                  ? `${pendingIncomingPings[0].fromUserName} wants to drive!`
                  : `${pendingIncomingPings.length} drive invites`}
              </Text>
              {pendingIncomingPings.length === 1 && pendingIncomingPings[0].fromUserCar && (
                <Text style={styles.incomingPingCar}>{pendingIncomingPings[0].fromUserCar}</Text>
              )}
            </View>
          </View>
          {pendingIncomingPings.length === 1 ? (
            <View style={styles.incomingPingActions}>
              <TouchableOpacity
                style={styles.incomingPingAccept}
                onPress={() => handleRespondToPing(pendingIncomingPings[0].id, 'accepted')}
                disabled={respondingMeetupId === pendingIncomingPings[0].id}
                activeOpacity={0.7}
              >
                {respondingMeetupId === pendingIncomingPings[0].id ? (
                  <ActivityIndicator size="small" color={colors.textInverted} />
                ) : (
                  <>
                    <Check size={16} color={colors.textInverted} />
                    <Text style={styles.incomingPingAcceptText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.incomingPingDecline}
                onPress={() => handleRespondToPing(pendingIncomingPings[0].id, 'declined')}
                disabled={respondingMeetupId === pendingIncomingPings[0].id}
                activeOpacity={0.7}
              >
                <X size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.incomingPingViewAll}
              onPress={() => { setMeetupView('list'); setShowMeetupsModal(true); }}
              activeOpacity={0.7}
            >
              <Text style={styles.incomingPingViewAllText}>View All</Text>
              <ChevronRight size={16} color={colors.textInverted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {userLocation && (
        <View style={styles.userLocationBanner}>
          <MapPin size={14} color={colors.primary} />
          <Text style={styles.userLocationText}>{userLocation}</Text>
          <View style={styles.bannerButtonsRow}>
            {nearbyUsers.length > 0 && (
              <TouchableOpacity
                style={styles.nearbyDriversButton}
                onPress={() => { setShowNearbyDrivers(true); requestAnimationFrame(() => setNearbyModalReady(true)); }}
                activeOpacity={0.7}
              >
                <Users size={14} color={colors.textInverted} />
                <Text style={styles.nearbyDriversButtonText}>{nearbyUsers.length} Nearby</Text>
              </TouchableOpacity>
            )}
            {activeMeetups.length > 0 && (
              <TouchableOpacity
                style={styles.activeMeetupBannerButton}
                onPress={() => { setMeetupView('list'); setShowMeetupsModal(true); }}
                activeOpacity={0.7}
              >
                <Navigation2 size={14} color={colors.textInverted} />
                <Text style={styles.activeMeetupBannerText}>Active</Text>
              </TouchableOpacity>
            )}
            {pendingIncomingPings.length > 0 && activeMeetups.length === 0 && (
              <TouchableOpacity
                style={styles.pendingPingBannerButton}
                onPress={() => { setMeetupView('list'); setShowMeetupsModal(true); }}
                activeOpacity={0.7}
              >
                <Bell size={14} color={colors.textInverted} />
                <Text style={styles.pendingPingBannerText}>{pendingIncomingPings.length}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={styles.filtersContainer}>
        <Text style={styles.sectionLabel}>Choose Category</Text>
        <TouchableOpacity
          style={styles.categoryDropdownButton}
          onPress={() => setShowCategoryDropdown(true)}
          activeOpacity={0.7}
        >
          <View style={styles.categoryDropdownLeft}>
            {activeCategory_data?.icon}
            <Text style={styles.categoryDropdownText}>{activeCategory_data?.label}</Text>
          </View>
          <ChevronDown size={18} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Time Period</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timePeriodScroll} contentContainerStyle={styles.timePeriodContent}>
          {TIME_PERIODS.map((period) => (
            <TouchableOpacity
              key={period.key}
              style={[styles.timePeriodChip, timePeriod === period.key && styles.timePeriodChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTimePeriod(period.key);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.timePeriodChipText, timePeriod === period.key && styles.timePeriodChipTextActive]}>
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionLabel}>Filters</Text>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filters.country && styles.filterChipActive]}
            onPress={() => openFilterModal('country')}
            activeOpacity={0.7}
          >
            <MapPin size={14} color={filters.country ? colors.textInverted : colors.text} />
            <Text style={[styles.filterChipText, filters.country && styles.filterChipTextActive]} numberOfLines={1}>
              {filters.country || 'Country'}
            </Text>
            <ChevronDown size={12} color={filters.country ? colors.textInverted : colors.textLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filters.city && styles.filterChipActive, !filters.country && styles.filterChipDisabled]}
            onPress={() => filters.country && openFilterModal('city')}
            activeOpacity={0.7}
            disabled={!filters.country}
          >
            <Text style={[styles.filterChipText, filters.city && styles.filterChipTextActive, !filters.country && styles.filterChipTextDisabled]} numberOfLines={1}>
              {filters.city || 'City'}
            </Text>
            <ChevronDown size={12} color={filters.city ? colors.textInverted : colors.textLight} />
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filters.carBrand && styles.filterChipActive]}
            onPress={() => openFilterModal('carBrand')}
            activeOpacity={0.7}
          >
            <Car size={14} color={filters.carBrand ? colors.textInverted : colors.text} />
            <Text style={[styles.filterChipText, filters.carBrand && styles.filterChipTextActive]} numberOfLines={1}>
              {filters.carBrand || 'Brand'}
            </Text>
            <ChevronDown size={12} color={filters.carBrand ? colors.textInverted : colors.textLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filters.carModel && styles.filterChipActive, !filters.carBrand && styles.filterChipDisabled]}
            onPress={() => filters.carBrand && openFilterModal('carModel')}
            activeOpacity={0.7}
            disabled={!filters.carBrand}
          >
            <Text style={[styles.filterChipText, filters.carModel && styles.filterChipTextActive, !filters.carBrand && styles.filterChipTextDisabled]} numberOfLines={1}>
              {filters.carModel || 'Model'}
            </Text>
            <ChevronDown size={12} color={filters.carModel ? colors.textInverted : colors.textLight} />
          </TouchableOpacity>

          {activeFiltersCount > 0 && (
            <TouchableOpacity
              style={styles.clearFiltersChip}
              onPress={() => setFilters({})}
              activeOpacity={0.7}
            >
              <X size={12} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {activeCategory === 'challengesCompleted' ? (
          challengesLeaderboardData.length === 0 ? (
            <View style={styles.emptyState}>
              <Trophy size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>No challenge data yet</Text>
              <Text style={styles.emptySubtext}>Complete challenges to appear on this leaderboard</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {challengesLeaderboardData.map((entry, index) => {
                const rank = index + 1;
                const isCurrentUser = entry.userId === user?.id;
                const ringColor = rank === 1 ? colors.accent : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : colors.textLight;

                return (
                  <TouchableOpacity
                    key={entry.userId}
                    style={[styles.competitorCard, isCurrentUser && styles.competitorCardActive]}
                    onPress={() => {
                      if (entry.userId) {
                        router.push({ pathname: '/user-profile', params: { userId: entry.userId } } as any);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    {isCurrentUser && <View style={styles.competitorActiveBar} />}
                    <Text style={[styles.competitorRank, isCurrentUser && styles.competitorRankActive]}>
                      {rank < 10 ? `0${rank}` : rank}
                    </Text>
                    <View style={styles.competitorAvatarWrap}>
                      {isValidAvatar(entry.userProfilePicture) ? (
                        <Image source={{ uri: entry.userProfilePicture }} style={styles.competitorAvatar} onError={() => handleAvatarError(entry.userProfilePicture!)} />
                      ) : (
                        <View style={styles.competitorAvatarPlaceholder}>
                          <Text style={styles.competitorAvatarInitial}>
                            {(entry.userName || 'D')[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.competitorInfo}>
                      <View style={styles.competitorNameRow}>
                        <Text style={styles.competitorName} numberOfLines={1}>
                          {isCurrentUser ? 'You' : (entry.userName || 'Driver')}
                        </Text>
                        {isCurrentUser && (
                          <View style={styles.activeBadge}>
                            <Text style={styles.activeBadgeText}>YOU</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.competitorStatText} numberOfLines={1}>
                        {entry.achievementCount}/{entry.totalAchievements} challenges
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' as const }}>
                      <Text style={[styles.competitorValue, { color: ringColor }]}>{entry.completionPercent}%</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        ) : leaderboardData.length === 0 ? (
          <View style={styles.emptyState}>
            <Filter size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>No records found</Text>
            <Text style={styles.emptySubtext}>
              {activeFiltersCount > 0 ? 'Try adjusting your filters' : 'Complete trips to see rankings'}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {leaderboardData.length >= 1 && (() => {
              const top3 = leaderboardData.slice(0, Math.min(3, leaderboardData.length));
              const first = top3[0];
              const second = top3.length > 1 ? top3[1] : null;
              const third = top3.length > 2 ? top3[2] : null;

              const renderPodiumUser = (trip: LeaderboardTrip, rank: number) => {
                const isMe = trip.userId === user?.id || trip.userName === user?.displayName;
                const pic = isMe ? (user?.profilePicture || trip.userProfilePicture) : trip.userProfilePicture;
                const car = getCarInfo(trip);
                const isFirst = rank === 1;
                const avatarSize = isFirst ? 80 : 56;
                const ringSize = avatarSize + 8;
                const ringColor = rank === 1 ? colors.accent : rank === 2 ? '#C0C0C0' : '#CD7F32';
                const podiumStats = getSecondaryStats(trip);
                const tripLocation = trip.location?.city && trip.location.city !== 'Unknown' ? trip.location.city : null;
                const podiumRoute = getTripRoute(trip);
                const hasPodiumMap = podiumRoute.length > 1 && Platform.OS !== 'web';

                return (
                  <TouchableOpacity
                    style={[styles.podiumUser, isFirst && styles.podiumUserFirst]}
                    onPress={() => openTripDetail(trip)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.podiumAvatarWrap}>
                      <View style={[styles.podiumAvatarRing, { width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderColor: ringColor }]}>
                        {isValidAvatar(pic) ? (
                          <Image source={{ uri: pic }} style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }} onError={() => handleAvatarError(pic)} />
                        ) : (
                          <View style={[styles.podiumAvatarPlaceholder, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
                            <Text style={[styles.podiumAvatarInitial, isFirst && { fontSize: 28 }]}>
                              {(trip.userName || 'D')[0].toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      {isFirst && (
                        <View style={styles.podiumTrophyBadge}>
                          <Trophy size={16} color="#FFD700" fill="#FFD700" />
                        </View>
                      )}
                      <View style={[styles.podiumRankBadge, { backgroundColor: ringColor }]}>
                        <Text style={styles.podiumRankBadgeText}>{rank}</Text>
                      </View>
                    </View>
                    <Text style={[styles.podiumName, isFirst && styles.podiumNameFirst]} numberOfLines={1}>
                      {isMe ? 'You' : (trip.userName || 'Driver')}
                    </Text>
                    <Text style={[styles.podiumValue, isFirst && styles.podiumValueFirst]}>{formatValue(trip)}</Text>
                    {car && (
                      <Text style={styles.podiumCarText} numberOfLines={1}>{car.full}</Text>
                    )}
                    {podiumStats.length > 0 && (
                      <View style={styles.podiumMiniStats}>
                        {podiumStats.slice(0, isFirst ? 3 : 2).map((stat, si) => (
                          <View key={si} style={styles.podiumMiniStatItem}>
                            {statIconMap[stat.iconType]}
                            <Text style={styles.podiumMiniStatValue} numberOfLines={1}>{stat.value}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {tripLocation && (
                      <View style={styles.podiumLocationChip}>
                        <MapPin size={8} color={colors.textLight} />
                        <Text style={styles.podiumLocationText} numberOfLines={1}>{tripLocation}</Text>
                      </View>
                    )}
                    {hasPodiumMap && (
                      <View style={[styles.podiumMap, isFirst && styles.podiumMapFirst]} pointerEvents="none">
                        <MapView
                          style={styles.podiumMapView}
                          initialRegion={getMapRegion(podiumRoute)}
                          scrollEnabled={false}
                          zoomEnabled={false}
                          rotateEnabled={false}
                          pitchEnabled={false}
                          liteMode
                          toolbarEnabled={false}
                          pointerEvents="none"
                        >
                          <Polyline coordinates={podiumRoute} strokeColor="#CC0000" strokeWidth={3} />
                        </MapView>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              };

              return (
                <>
                  <AnimatedCard index={0} slideDistance={30} duration={400}>
                    <View style={styles.podiumContainer}>
                      <View style={styles.podiumRow}>
                        {second && (
                          <View style={styles.podiumSide}>
                            {renderPodiumUser(second, 2)}
                          </View>
                        )}
                        <View style={styles.podiumCenter}>
                          {renderPodiumUser(first, 1)}
                        </View>
                        {third && (
                          <View style={styles.podiumSide}>
                            {renderPodiumUser(third, 3)}
                          </View>
                        )}
                      </View>
                    </View>
                  </AnimatedCard>

                  {leaderboardData.length > 3 && (
                    <AnimatedCard index={1} slideDistance={20} duration={350}>
                      <View style={styles.risingHeader}>
                        <Text style={styles.risingTitle}>Rising Competitors</Text>
                        <Text style={styles.risingSubtitle}>GLOBAL TOP 10</Text>
                      </View>
                    </AnimatedCard>
                  )}
                </>
              );
            })()}

            {leaderboardData.slice(3).map((trip, index) => {
              const rank = index + 4;
              const carInfo = getCarInfo(trip);
              const isCurrentUser = trip.userId === user?.id || trip.userName === user?.displayName;
              const displayProfilePic = isCurrentUser ? (user?.profilePicture || trip.userProfilePicture) : trip.userProfilePicture;
              const route = getTripRoute(trip);
              const hasMap = route.length > 1 && Platform.OS !== 'web';

              return (
                <AnimatedCard key={trip.id || `trip-${rank}`} index={index + 2} slideDistance={20} duration={300}>
                <TouchableOpacity
                  style={[styles.competitorCard, isCurrentUser && styles.competitorCardActive]}
                  onPress={() => openTripDetail(trip)}
                  activeOpacity={0.7}
                >
                  {isCurrentUser && <View style={styles.competitorActiveBar} />}
                  <Text style={[styles.competitorRank, isCurrentUser && styles.competitorRankActive]}>
                    {rank < 10 ? `0${rank}` : rank}
                  </Text>
                  <TouchableOpacity
                    style={styles.competitorAvatarWrap}
                    onPress={() => {
                      if (trip.userId) {
                        router.push({ pathname: '/user-profile', params: { userId: trip.userId } } as any);
                      }
                    }}
                    disabled={!trip.userId}
                  >
                    {isValidAvatar(displayProfilePic) ? (
                      <Image source={{ uri: displayProfilePic }} style={styles.competitorAvatar} onError={() => handleAvatarError(displayProfilePic)} />
                    ) : (
                      <View style={styles.competitorAvatarPlaceholder}>
                        <Text style={styles.competitorAvatarInitial}>
                          {(trip.userName || 'D')[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.competitorInfo}>
                    <View style={styles.competitorNameRow}>
                      <Text style={styles.competitorName} numberOfLines={1}>
                        {isCurrentUser ? 'You' : (trip.userName || 'Driver')}
                      </Text>
                      {isCurrentUser && (
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>ACTIVE</Text>
                        </View>
                      )}
                      {!isCurrentUser && trip.userId && trip.userId !== user?.id && (
                        <TouchableOpacity
                          style={[
                            styles.followButton,
                            followingUsers[trip.userId] && styles.followButtonActive,
                          ]}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleFollowToggle(trip.userId!, trip.userName);
                          }}
                          activeOpacity={0.7}
                          disabled={followLoadingUserId === trip.userId}
                          testID={`follow-btn-${trip.userId}`}
                        >
                          {followLoadingUserId === trip.userId ? (
                            <ActivityIndicator size="small" color={colors.accent} />
                          ) : followingUsers[trip.userId] ? (
                            <UserCheck size={14} color={colors.accent} />
                          ) : (
                            <UserPlus size={14} color={colors.textLight} />
                          )}
                        </TouchableOpacity>
                      )}
                      <View style={styles.competitorValueInline}>
                        <Text style={styles.competitorValue}>{formatValue(trip)}</Text>
                      </View>
                    </View>
                    {carInfo && (
                      <Text style={styles.competitorCar} numberOfLines={1}>
                        {carInfo.full}
                      </Text>
                    )}
                    <View style={styles.competitorStatsRow}>
                      {getSecondaryStats(trip).slice(0, 3).map((stat, si) => (
                        <View key={si} style={styles.competitorStatChip}>
                          {statIconMap[stat.iconType]}
                          <Text style={styles.competitorStatText}>{stat.value}</Text>
                        </View>
                      ))}
                    </View>
                    {trip.location?.city && trip.location.city !== 'Unknown' && (
                      <View style={styles.competitorLocationRow}>
                        <MapPin size={10} color={colors.textLight} />
                        <Text style={styles.competitorLocationText} numberOfLines={1}>
                          {trip.location.city}{trip.location.country && trip.location.country !== 'Unknown' ? `, ${trip.location.country}` : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                  {hasMap ? (
                    <View style={styles.competitorMap} pointerEvents="none">
                      <MapView
                        style={styles.competitorMapView}
                        initialRegion={getMapRegion(route)}
                        scrollEnabled={false}
                        zoomEnabled={false}
                        rotateEnabled={false}
                        pitchEnabled={false}
                        liteMode
                        toolbarEnabled={false}
                        pointerEvents="none"
                      >
                        <Polyline coordinates={route} strokeColor="#CC0000" strokeWidth={3} />
                      </MapView>
                    </View>
                  ) : (
                    <View style={styles.competitorMapPlaceholder}>
                      <Route size={18} color={colors.textLight} />
                    </View>
                  )}
                </TouchableOpacity>
                </AnimatedCard>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{getFilterTitle()}</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} activeOpacity={0.7}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {(activeFilterType === 'country' || activeFilterType === 'carBrand' || activeFilterType === 'carModel') && (
              <View style={styles.searchContainer}>
                <Search size={18} color={colors.textLight} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={activeFilterType === 'country' ? 'Search country...' : activeFilterType === 'carBrand' ? 'Search brand...' : 'Search model...'}
                  placeholderTextColor={colors.textLight}
                  value={activeFilterType === 'country' ? countrySearch : activeFilterType === 'carBrand' ? carBrandSearch : carModelSearch}
                  onChangeText={activeFilterType === 'country' ? setCountrySearch : activeFilterType === 'carBrand' ? setCarBrandSearch : setCarModelSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {(activeFilterType === 'country' ? countrySearch : activeFilterType === 'carBrand' ? carBrandSearch : carModelSearch).length > 0 && (
                  <TouchableOpacity onPress={() => {
                    if (activeFilterType === 'country') setCountrySearch('');
                    else if (activeFilterType === 'carBrand') setCarBrandSearch('');
                    else setCarModelSearch('');
                  }} activeOpacity={0.7}>
                    <X size={18} color={colors.textLight} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => selectFilter(undefined)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalOptionText}>All</Text>
              </TouchableOpacity>

              {filterOptions.map((option, optionIndex) => (
                <TouchableOpacity
                  key={option.value || `option-${optionIndex}`}
                  style={[
                    styles.modalOption,
                    filters[activeFilterType!] === option.value && styles.modalOptionActive,
                  ]}
                  onPress={() => selectFilter(option.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      filters[activeFilterType!] === option.value && styles.modalOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}

              {filterOptions.length === 0 && (
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>No options available</Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showTripDetail}
        transparent
        animationType="slide"
        onRequestClose={closeTripDetail}
      >
        <View style={styles.tripDetailOverlay}>
          <View style={styles.tripDetailContent}>
            <View style={styles.tripDetailHeader}>
              <Text style={styles.tripDetailTitle}>Trip Details</Text>
              <TouchableOpacity onPress={closeTripDetail} activeOpacity={0.7} style={styles.closeButton}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {selectedTrip && (() => {
              let mapCoords: RoutePoint[] = [];
              if (selectedTrip.locations && selectedTrip.locations.length > 1) {
                mapCoords = selectedTrip.locations.map(l => ({ latitude: l.latitude, longitude: l.longitude }));
              } else if (selectedTrip.routePoints && selectedTrip.routePoints.length > 1) {
                mapCoords = selectedTrip.routePoints;
              } else if (batchRouteForSelected && batchRouteForSelected.length > 1) {
                mapCoords = batchRouteForSelected;
              } else if (remoteRoutePoints && remoteRoutePoints.length > 1) {
                mapCoords = remoteRoutePoints;
              }
              const hasMap = mapCoords.length > 1;
              const isLoadingMap = !hasMap && tripRoutePointsQuery.isLoading && needsRemoteRoutePoints;

              return (
              <ScrollView style={styles.tripDetailScroll} showsVerticalScrollIndicator={false}>
                {hasMap && Platform.OS !== 'web' ? (
                  <View style={styles.mapContainer}>
                    <MapView
                      style={styles.map}
                      initialRegion={getMapRegion(mapCoords)}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      rotateEnabled={false}
                      pitchEnabled={false}
                    >
                      <Polyline
                        coordinates={mapCoords}
                        strokeColor="#CC0000"
                        strokeWidth={4}
                      />
                      <Marker
                        coordinate={{
                          latitude: mapCoords[0].latitude,
                          longitude: mapCoords[0].longitude,
                        }}
                        title="Start"
                        pinColor="green"
                      />
                      <Marker
                        coordinate={{
                          latitude: mapCoords[mapCoords.length - 1].latitude,
                          longitude: mapCoords[mapCoords.length - 1].longitude,
                        }}
                        title="End"
                        pinColor="red"
                      />
                    </MapView>
                  </View>
                ) : (
                  <View style={styles.noMapContainer}>
                    {isLoadingMap ? (
                      <>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={styles.noMapText}>Loading route…</Text>
                      </>
                    ) : (
                      <>
                        <Route size={32} color={colors.textLight} />
                        <Text style={styles.noMapText}>Route map not available</Text>
                      </>
                    )}
                  </View>
                )}

                <View style={styles.tripDetailSection}>
                  <View style={styles.tripDetailRow}>
                    <View style={styles.tripDetailItem}>
                      <Calendar size={16} color={colors.primary} />
                      <Text style={styles.tripDetailLabel}>Date</Text>
                      <Text style={styles.tripDetailValue}>{formatDate(selectedTrip.startTime)}</Text>
                    </View>
                    <View style={styles.tripDetailItem}>
                      <Clock size={16} color={colors.accent} />
                      <Text style={styles.tripDetailLabel}>Duration</Text>
                      <Text style={styles.tripDetailValue}>{formatDuration(selectedTrip.duration)}</Text>
                    </View>
                  </View>

                  <View style={styles.tripDetailRow}>
                    <View style={styles.tripDetailItem}>
                      <Zap size={16} color={colors.warning} />
                      <Text style={styles.tripDetailLabel}>Top Speed</Text>
                      <Text style={styles.tripDetailValue}>
                        {Math.round(convertSpeed(selectedTrip.topSpeed))} {getSpeedLabel()}
                      </Text>
                    </View>
                    <View style={styles.tripDetailItem}>
                      <Navigation size={16} color={colors.accent} />
                      <Text style={styles.tripDetailLabel}>Distance</Text>
                      <Text style={styles.tripDetailValue}>
                        {convertDistance(selectedTrip.distance).toFixed(2)} {getDistanceLabel()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.tripDetailRow}>
                    <View style={styles.tripDetailItem}>
                      <Gauge size={16} color={colors.success} />
                      <Text style={styles.tripDetailLabel}>Avg Speed</Text>
                      <Text style={styles.tripDetailValue}>
                        {Math.round(convertSpeed(selectedTrip.avgSpeed))} {getSpeedLabel()}
                      </Text>
                    </View>
                    <View style={styles.tripDetailItem}>
                      <CornerDownRight size={16} color={colors.textLight} />
                      <Text style={styles.tripDetailLabel}>Corners</Text>
                      <Text style={styles.tripDetailValue}>{selectedTrip.corners}</Text>
                    </View>
                  </View>

                  {((selectedTrip.acceleration ?? 0) > 0 || (selectedTrip.maxGForce ?? 0) > 0) && (
                    <View style={styles.tripDetailRow}>
                      <View style={styles.tripDetailItem}>
                        <Gauge size={16} color={colors.success} />
                        <Text style={styles.tripDetailLabel}>Max Accel</Text>
                        <Text style={styles.tripDetailValue}>
                          {(selectedTrip.acceleration ?? 0).toFixed(2)} m/s²
                        </Text>
                      </View>
                      <View style={styles.tripDetailItem}>
                        <Activity size={16} color={colors.danger} />
                        <Text style={styles.tripDetailLabel}>Max G-Force</Text>
                        <Text style={styles.tripDetailValue}>
                          {(selectedTrip.maxGForce ?? 0).toFixed(2)} G
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {selectedTrip.location?.city && selectedTrip.location.city !== 'Unknown' && (
                  <View style={styles.tripDetailLocationCard}>
                    <MapPin size={18} color={colors.primary} />
                    <View style={styles.tripDetailLocationInfo}>
                      <Text style={styles.tripDetailLocationLabel}>Location</Text>
                      <Text style={styles.tripDetailLocationValue}>
                        {selectedTrip.location.city}
                        {selectedTrip.location.country && selectedTrip.location.country !== 'Unknown' 
                          ? `, ${selectedTrip.location.country}` 
                          : ''}
                      </Text>
                    </View>
                  </View>
                )}

                {(() => {
                  const tripCarInfo = getCarInfo(selectedTrip);
                  if (!tripCarInfo) return null;
                  const isOwnTrip = selectedTrip.userId === user?.id;
                  const carPicture = isOwnTrip && userPrimaryCar && 'picture' in userPrimaryCar ? userPrimaryCar.picture : undefined;
                  return (
                    <View style={styles.tripDetailCarCard}>
                      {carPicture ? (
                        <Image source={{ uri: carPicture }} style={styles.tripDetailCarImage} />
                      ) : (
                        <View style={styles.tripDetailCarIconContainer}>
                          <Car size={28} color={colors.primary} />
                        </View>
                      )}
                      <View style={styles.tripDetailCarInfo}>
                        <Text style={styles.tripDetailCarLabel}>Vehicle</Text>
                        <Text style={styles.tripDetailCarBrand}>{tripCarInfo.brand}</Text>
                        {tripCarInfo.model ? (
                          <Text style={styles.tripDetailCarModel}>{tripCarInfo.model}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })()}

                <TouchableOpacity
                  style={styles.viewProfileButton}
                  onPress={() => {
                    const tripUserId = selectedTrip?.userId;
                    closeTripDetail();
                    if (tripUserId) {
                      router.push({ pathname: '/user-profile', params: { userId: tripUserId } } as any);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Users size={16} color={colors.textInverted} />
                  <Text style={styles.viewProfileButtonText}>View Profile</Text>
                </TouchableOpacity>
              </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showNearbyDrivers}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowNearbyDrivers(false); setNearbyModalReady(false); }}
      >
        <View style={styles.nearbyDriversOverlay}>
          <View style={styles.nearbyDriversContent}>
            <View style={styles.nearbyDriversHeader}>
              <View style={styles.nearbyDriversHeaderLeft}>
                <Users size={22} color={colors.primary} />
                <Text style={styles.nearbyDriversTitle}>Nearby Drivers</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowNearbyDrivers(false); setNearbyModalReady(false); }} activeOpacity={0.7}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.nearbyDriversSubtitle}>
              {`Drivers within ${Math.round(convertDistance(100))} ${getDistanceLabel()} of you`}
            </Text>

            <ScrollView style={styles.nearbyDriversList} showsVerticalScrollIndicator={false}>
              {!nearbyModalReady || nearbyUsersQuery.isLoading ? (
                <View style={styles.nearbyLoadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.nearbyLoadingText}>Finding drivers...</Text>
                </View>
              ) : nearbyUsers.length === 0 ? (
                <View style={styles.nearbyEmptyContainer}>
                  <Users size={40} color={colors.textLight} />
                  <Text style={styles.nearbyEmptyText}>No nearby drivers yet</Text>
                  <Text style={styles.nearbyEmptySubtext}>Be the first in your area!</Text>
                </View>
              ) : (
                nearbyUsers.map((driver) => (
                  <View key={driver.id} style={styles.nearbyDriverItem}>
                    <View style={styles.nearbyDriverAvatar}>
                      <Text style={styles.nearbyDriverInitial}>
                        {driver.displayName[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.nearbyDriverInfo}>
                      <Text style={styles.nearbyDriverName}>{driver.displayName}</Text>
                      <View style={styles.nearbyDriverLocationRow}>
                        <MapPin size={10} color={colors.textLight} />
                        <Text style={styles.nearbyDriverLocation}>
                          {driver.distanceKm != null ? `${Math.round(convertDistance(driver.distanceKm))} ${getDistanceLabel()} away` : driver.city ? `${driver.city}${driver.country ? `, ${driver.country}` : ''}` : ''}
                        </Text>
                      </View>
                      {driver.carBrand && (
                        <View style={styles.nearbyDriverCarRow}>
                          <Car size={10} color={colors.primary} />
                          <Text style={styles.nearbyDriverCar}>
                            {driver.carBrand} {driver.carModel || ''}
                          </Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.pingButton,
                        !driver.hasPushToken && styles.pingButtonDisabled,
                      ]}
                      onPress={() => handlePingUser(driver.id, driver.displayName, driver.carBrand && driver.carModel ? `${driver.carBrand} ${driver.carModel}` : undefined)}
                      disabled={!driver.hasPushToken || pingingUserId === driver.id}
                      activeOpacity={0.7}
                    >
                      {pingingUserId === driver.id ? (
                        <ActivityIndicator size="small" color={colors.textInverted} />
                      ) : (
                        <>
                          <Send size={14} color={driver.hasPushToken ? colors.textInverted : colors.textLight} />
                          <Text style={[
                            styles.pingButtonText,
                            !driver.hasPushToken && styles.pingButtonTextDisabled,
                          ]}>
                            Ping
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
            
            <View style={styles.nearbyDriversFooter}>
              <Bell size={14} color={colors.textLight} />
              <Text style={styles.nearbyDriversFooterText}>
                Ping to invite for a drive!
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showMeetupsModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (meetupView === 'detail') {
            setMeetupView('list');
            setSelectedMeetup(null);
            selectedMeetupId.current = null;
          } else {
            setShowMeetupsModal(false);
            setMeetupView('list');
            setMeetupsModalReady(false);
          }
        }}
        onShow={() => setMeetupsModalReady(true)}
      >
        <View style={styles.nearbyDriversOverlay}>
          <View style={styles.nearbyDriversContent}>
            {meetupView === 'list' ? (
              <>
                <View style={styles.nearbyDriversHeader}>
                  <View style={styles.nearbyDriversHeaderLeft}>
                    <MessageCircle size={22} color={colors.primary} />
                    <Text style={styles.nearbyDriversTitle}>Drive Meetups</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setShowMeetupsModal(false); setMeetupView('list'); setMeetupsModalReady(false); }} activeOpacity={0.7}>
                    <X size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.nearbyDriversList} showsVerticalScrollIndicator={false}>
                  {pendingIncomingPings.length > 0 && (
                    <View style={styles.meetupSection}>
                      <Text style={styles.meetupSectionTitle}>Incoming Invites</Text>
                      {pendingIncomingPings.map((meetup) => (
                        <View key={meetup.id} style={styles.meetupItem}>
                          <View style={styles.meetupItemHeader}>
                            <View style={styles.nearbyDriverAvatar}>
                              <Text style={styles.nearbyDriverInitial}>
                                {meetup.fromUserName[0].toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.meetupItemInfo}>
                              <Text style={styles.meetupItemName}>{meetup.fromUserName}</Text>
                              {meetup.fromUserCar && (
                                <View style={styles.nearbyDriverCarRow}>
                                  <Car size={10} color={colors.primary} />
                                  <Text style={styles.nearbyDriverCar}>{meetup.fromUserCar}</Text>
                                </View>
                              )}
                              <Text style={styles.meetupItemTime}>
                                {new Date(meetup.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                          </View>
                          <MeetupCountdownBar createdAt={meetup.createdAt} expiresAt={meetup.expiresAt} colors={colors} />
                          <View style={styles.meetupActions}>
                            <TouchableOpacity
                              style={styles.acceptButton}
                              onPress={() => handleRespondToPing(meetup.id, 'accepted')}
                              disabled={respondingMeetupId === meetup.id}
                              activeOpacity={0.7}
                            >
                              {respondingMeetupId === meetup.id ? (
                                <ActivityIndicator size="small" color={colors.textInverted} />
                              ) : (
                                <>
                                  <Check size={16} color={colors.textInverted} />
                                  <Text style={styles.acceptButtonText}>Accept</Text>
                                </>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.declineButton}
                              onPress={() => handleRespondToPing(meetup.id, 'declined')}
                              disabled={respondingMeetupId === meetup.id}
                              activeOpacity={0.7}
                            >
                              <XCircle size={16} color={colors.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {activeMeetups.length > 0 && (
                    <View style={styles.meetupSection}>
                      <Text style={styles.meetupSectionTitle}>Active Meetups</Text>
                      {activeMeetups.map((meetup) => {
                        const isAccepter = meetup.toUserId === user?.id;
                        const otherUserName = isAccepter ? meetup.fromUserName : meetup.toUserName;
                        const otherUserCar = isAccepter ? meetup.fromUserCar : meetup.toUserCar;
                        const myLocation = isAccepter ? meetup.toUserLocation : meetup.fromUserLocation;
                        const theirLocation = isAccepter ? meetup.fromUserLocation : meetup.toUserLocation;

                        return (
                          <TouchableOpacity
                            key={meetup.id}
                            style={styles.activeMeetupItem}
                            onPress={() => {
                              setSelectedMeetup(meetup);
                              selectedMeetupId.current = meetup.id;
                              setMeetupView('detail');
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={styles.activeMeetupRow}>
                              <View style={styles.meetupItemHeader}>
                                <View style={[styles.nearbyDriverAvatar, styles.activeAvatar]}>
                                  <Text style={styles.nearbyDriverInitial}>
                                    {otherUserName[0].toUpperCase()}
                                  </Text>
                                </View>
                                <View style={styles.meetupItemInfo}>
                                  <Text style={styles.meetupItemName}>{otherUserName}</Text>
                                  {otherUserCar && (
                                    <View style={styles.nearbyDriverCarRow}>
                                      <Car size={10} color={colors.primary} />
                                      <Text style={styles.nearbyDriverCar}>{otherUserCar}</Text>
                                    </View>
                                  )}
                                  <View style={styles.locationStatusRow}>
                                    {theirLocation ? (
                                      <View style={styles.locationSharedBadge}>
                                        <MapPin size={10} color={colors.success} />
                                        <Text style={styles.locationSharedText}>Location shared</Text>
                                      </View>
                                    ) : (
                                      <Text style={styles.waitingLocationText}>Waiting for location...</Text>
                                    )}
                                  </View>
                                </View>
                              </View>
                              <View style={styles.meetupQuickActions}>
                                {!myLocation && (
                                  <TouchableOpacity
                                    style={styles.shareLocationButton}
                                    onPress={(e) => { e.stopPropagation(); handleShareLocation(meetup); }}
                                    disabled={sharingLocationMeetupId === meetup.id}
                                    activeOpacity={0.7}
                                  >
                                    {sharingLocationMeetupId === meetup.id ? (
                                      <ActivityIndicator size="small" color={colors.textInverted} />
                                    ) : (
                                      <>
                                        <Share2 size={14} color={colors.textInverted} />
                                        <Text style={styles.shareLocationButtonText}>Share</Text>
                                      </>
                                    )}
                                  </TouchableOpacity>
                                )}
                                {theirLocation && (
                                  <TouchableOpacity
                                    style={styles.navigateButton}
                                    onPress={(e) => { e.stopPropagation(); handleNavigateToLocation(theirLocation.latitude, theirLocation.longitude, otherUserName); }}
                                    activeOpacity={0.7}
                                  >
                                    <Navigation2 size={14} color={colors.textInverted} />
                                  </TouchableOpacity>
                                )}
                                <ChevronRight size={18} color={colors.textLight} />
                              </View>
                            </View>
                            <MeetupCountdownBar createdAt={meetup.createdAt} expiresAt={meetup.expiresAt} colors={colors} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {pendingOutgoingPings.length > 0 && (
                    <View style={styles.meetupSection}>
                      <Text style={styles.meetupSectionTitle}>Pending Invites</Text>
                      {pendingOutgoingPings.map((meetup) => (
                        <View key={meetup.id} style={styles.pendingMeetupItem}>
                          <View style={styles.meetupItemHeader}>
                            <View style={[styles.nearbyDriverAvatar, styles.pendingAvatar]}>
                              <Text style={styles.nearbyDriverInitial}>
                                {meetup.toUserName[0].toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.meetupItemInfo}>
                              <Text style={styles.meetupItemName}>{meetup.toUserName}</Text>
                              {meetup.toUserCar && (
                                <View style={styles.nearbyDriverCarRow}>
                                  <Car size={10} color={colors.primary} />
                                  <Text style={styles.nearbyDriverCar}>{meetup.toUserCar}</Text>
                                </View>
                              )}
                              <Text style={styles.pendingStatusText}>Waiting for response...</Text>
                            </View>
                          </View>
                          <MeetupCountdownBar createdAt={meetup.createdAt} expiresAt={meetup.expiresAt} colors={colors} />
                        </View>
                      ))}
                    </View>
                  )}

                  {pendingIncomingPings.length === 0 && activeMeetups.length === 0 && pendingOutgoingPings.length === 0 && (
                    <View style={styles.nearbyEmptyContainer}>
                      <MessageCircle size={40} color={colors.textLight} />
                      <Text style={styles.nearbyEmptyText}>No meetups yet</Text>
                      <Text style={styles.nearbyEmptySubtext}>Ping nearby drivers to start!</Text>
                    </View>
                  )}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={styles.nearbyDriversHeader}>
                  <TouchableOpacity
                    onPress={() => {
                      setMeetupView('list');
                      setSelectedMeetup(null);
                      selectedMeetupId.current = null;
                    }}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 }}
                  >
                    <ChevronRight size={20} color={colors.text} style={{ transform: [{ rotate: '180deg' }] }} />
                    <Text style={styles.nearbyDriversTitle}>Meetup Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setShowMeetupsModal(false);
                      setMeetupView('list');
                      setSelectedMeetup(null);
                      selectedMeetupId.current = null;
                      setMeetupsModalReady(false);
                    }}
                    activeOpacity={0.7}
                    style={styles.closeButton}
                  >
                    <X size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {selectedMeetup && (() => {
                  const isAccepter = selectedMeetup.toUserId === user?.id;
                  const otherUserName = isAccepter ? selectedMeetup.fromUserName : selectedMeetup.toUserName;
                  const otherUserCar = isAccepter ? selectedMeetup.fromUserCar : selectedMeetup.toUserCar;
                  const myLocation = isAccepter ? selectedMeetup.toUserLocation : selectedMeetup.fromUserLocation;
                  const theirLocation = isAccepter ? selectedMeetup.fromUserLocation : selectedMeetup.toUserLocation;
                  const hasAnyLocation = myLocation || theirLocation;

                  return (
                    <ScrollView style={styles.tripDetailScroll} showsVerticalScrollIndicator={false}>
                      <View style={styles.meetupDetailCard}>
                        <View style={styles.meetupDetailAvatar}>
                          <Text style={styles.meetupDetailAvatarText}>
                            {otherUserName[0].toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.meetupDetailName}>{otherUserName}</Text>
                        {otherUserCar && (
                          <View style={styles.meetupDetailCarRow}>
                            <Car size={16} color={colors.primary} />
                            <Text style={styles.meetupDetailCarText}>{otherUserCar}</Text>
                          </View>
                        )}
                        <View style={{ paddingHorizontal: 16, width: '100%', marginTop: 8 }}>
                          <MeetupCountdownBar createdAt={selectedMeetup.createdAt} expiresAt={selectedMeetup.expiresAt} colors={colors} />
                        </View>
                      </View>

                      {hasAnyLocation && Platform.OS !== 'web' && (
                        <View style={styles.meetupDetailSection}>
                          <Text style={styles.meetupDetailSectionTitle}>Live Map</Text>
                          <View style={styles.meetupMapContainer}>
                            <MapView
                              style={styles.meetupMap}
                              initialRegion={{
                                latitude: theirLocation?.latitude ?? myLocation?.latitude ?? 0,
                                longitude: theirLocation?.longitude ?? myLocation?.longitude ?? 0,
                                latitudeDelta: 0.05,
                                longitudeDelta: 0.05,
                              }}
                              scrollEnabled={true}
                              zoomEnabled={true}
                            >
                              {myLocation && (
                                <Marker
                                  coordinate={{ latitude: myLocation.latitude, longitude: myLocation.longitude }}
                                  title="You"
                                  pinColor={colors.primary}
                                />
                              )}
                              {theirLocation && (
                                <Marker
                                  coordinate={{ latitude: theirLocation.latitude, longitude: theirLocation.longitude }}
                                  title={otherUserName}
                                  pinColor={colors.success}
                                />
                              )}
                            </MapView>
                            <View style={styles.meetupMapLegend}>
                              {myLocation && (
                                <View style={styles.meetupMapLegendItem}>
                                  <View style={[styles.meetupMapLegendDot, { backgroundColor: colors.primary }]} />
                                  <Text style={styles.meetupMapLegendText}>You</Text>
                                </View>
                              )}
                              {theirLocation && (
                                <View style={styles.meetupMapLegendItem}>
                                  <View style={[styles.meetupMapLegendDot, { backgroundColor: colors.success }]} />
                                  <Text style={styles.meetupMapLegendText}>{otherUserName}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                      )}

                      {hasAnyLocation && Platform.OS === 'web' && (
                        <View style={styles.meetupDetailSection}>
                          <Text style={styles.meetupDetailSectionTitle}>Location Info</Text>
                          <View style={[styles.locationStatusCard, { gap: 8 }]}>
                            {myLocation && (
                              <View style={styles.locationSharedBadge}>
                                <MapPin size={12} color={colors.success} />
                                <Text style={styles.locationSharedText}>Your location shared</Text>
                              </View>
                            )}
                            {theirLocation && (
                              <View style={styles.locationSharedBadge}>
                                <MapPin size={12} color={colors.success} />
                                <Text style={styles.locationSharedText}>{otherUserName}&apos;s location shared</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      )}

                      <View style={styles.meetupDetailSection}>
                        <Text style={styles.meetupDetailSectionTitle}>Location Status</Text>
                        
                        <View style={styles.locationStatusCard}>
                          <View style={styles.locationStatusItem}>
                            <Text style={styles.locationStatusLabel}>Your Location</Text>
                            {myLocation ? (
                              <View style={styles.locationSharedBadge}>
                                <Check size={12} color={colors.success} />
                                <Text style={styles.locationSharedText}>Shared</Text>
                              </View>
                            ) : sharingLocationMeetupId === selectedMeetup.id ? (
                              <View style={styles.locationSharedBadge}>
                                <ActivityIndicator size="small" color={colors.accent} />
                                <Text style={[styles.locationSharedText, { color: colors.accent }]}>Sharing...</Text>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.shareLocationButtonLarge}
                                onPress={() => handleShareLocation(selectedMeetup)}
                                disabled={sharingLocationMeetupId === selectedMeetup.id}
                                activeOpacity={0.7}
                              >
                                {sharingLocationMeetupId === selectedMeetup.id ? (
                                  <ActivityIndicator size="small" color={colors.textInverted} />
                                ) : (
                                  <>
                                    <Share2 size={16} color={colors.textInverted} />
                                    <Text style={styles.shareLocationButtonText}>Share Location</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            )}
                          </View>

                          <View style={styles.locationDivider} />

                          <View style={styles.locationStatusItem}>
                            <Text style={styles.locationStatusLabel}>{otherUserName}&apos;s Location</Text>
                            {theirLocation ? (
                              <TouchableOpacity
                                style={styles.navigateButtonLarge}
                                onPress={() => handleNavigateToLocation(theirLocation.latitude, theirLocation.longitude, otherUserName)}
                                activeOpacity={0.7}
                              >
                                <MapPin size={16} color={colors.textInverted} />
                                <Text style={styles.navigateButtonText}>Navigate</Text>
                              </TouchableOpacity>
                            ) : (
                              <Text style={styles.waitingLocationText}>Waiting...</Text>
                            )}
                          </View>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.cancelMeetupButton}
                        onPress={() => handleCancelMeetup(selectedMeetup)}
                        activeOpacity={0.7}
                      >
                        <XCircle size={18} color={colors.danger} />
                        <Text style={styles.cancelMeetupButtonText}>Cancel Meetup</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  );
                })()}
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showNavChooser}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowNavChooser(false); setNavTarget(null); }}
      >
        <Pressable style={styles.navChooserOverlay} onPress={() => { setShowNavChooser(false); setNavTarget(null); }}>
          <Pressable style={styles.navChooserContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.navChooserHandle} />
            <Text style={styles.navChooserTitle}>Navigate to {navTarget?.name}</Text>
            <Text style={styles.navChooserSubtitle}>Choose your navigation app</Text>

            <View style={styles.navChooserOptions}>
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.navChooserOption}
                  onPress={() => openNavApp('apple')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.navChooserIconBg, { backgroundColor: '#34C759' }]}>
                    <Navigation2 size={22} color="#FFFFFF" />
                  </View>
                  <View style={styles.navChooserOptionInfo}>
                    <Text style={styles.navChooserOptionTitle}>Apple Maps</Text>
                    <Text style={styles.navChooserOptionSub}>Built-in navigation</Text>
                  </View>
                  <ChevronRight size={18} color={colors.textLight} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.navChooserOption}
                onPress={() => openNavApp(Platform.OS === 'web' ? 'web' : 'google')}
                activeOpacity={0.7}
              >
                <View style={[styles.navChooserIconBg, { backgroundColor: '#4285F4' }]}>
                  <MapPin size={22} color="#FFFFFF" />
                </View>
                <View style={styles.navChooserOptionInfo}>
                  <Text style={styles.navChooserOptionTitle}>Google Maps</Text>
                  <Text style={styles.navChooserOptionSub}>Turn-by-turn directions</Text>
                </View>
                <ChevronRight size={18} color={colors.textLight} />
              </TouchableOpacity>

              {Platform.OS !== 'web' && (
                <TouchableOpacity
                  style={styles.navChooserOption}
                  onPress={() => openNavApp('waze')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.navChooserIconBg, { backgroundColor: '#33CCFF' }]}>
                    <Navigation size={22} color="#FFFFFF" />
                  </View>
                  <View style={styles.navChooserOptionInfo}>
                    <Text style={styles.navChooserOptionTitle}>Waze</Text>
                    <Text style={styles.navChooserOptionSub}>Community-based navigation</Text>
                  </View>
                  <ChevronRight size={18} color={colors.textLight} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.navChooserCancel}
              onPress={() => { setShowNavChooser(false); setNavTarget(null); }}
              activeOpacity={0.7}
            >
              <Text style={styles.navChooserCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showCategoryDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryDropdown(false)}
      >
        <Pressable style={styles.categoryDropdownOverlay} onPress={() => setShowCategoryDropdown(false)}>
          <View style={styles.categoryDropdownContent}>
            <View style={styles.categoryDropdownHeader}>
              <Text style={styles.categoryDropdownTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryDropdown(false)} activeOpacity={0.7}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.categoryDropdownList}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.categoryDropdownItem,
                    activeCategory === cat.key && styles.categoryDropdownItemActive,
                  ]}
                  onPress={() => {
                    setActiveCategory(cat.key);
                    setShowCategoryDropdown(false);
                  }}
                  activeOpacity={0.7}
                >
                  {cat.icon}
                  <Text
                    style={[
                      styles.categoryDropdownItemText,
                      activeCategory === cat.key && styles.categoryDropdownItemTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  navHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  podiumContainer: {
    paddingTop: 8,
    paddingBottom: 16,
    alignItems: 'center' as const,
  },
  podiumRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
    width: '100%',
    paddingHorizontal: 8,
  },
  podiumSide: {
    flex: 1,
    alignItems: 'center' as const,
    paddingTop: 24,
  },
  podiumCenter: {
    flex: 1.2,
    alignItems: 'center' as const,
  },
  podiumUser: {
    alignItems: 'center' as const,
    gap: 4,
  },
  podiumUserFirst: {
    gap: 6,
  },
  podiumAvatarWrap: {
    position: 'relative' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 4,
  },
  podiumAvatarRing: {
    borderWidth: 3,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  podiumAvatarPlaceholder: {
    backgroundColor: colors.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  podiumAvatarInitial: {
    fontSize: 20,
    fontFamily: 'Orbitron_700Bold',
    color: colors.textInverted,
  },
  podiumTrophyBadge: {
    position: 'absolute' as const,
    top: -14,
    alignSelf: 'center' as const,
  },
  podiumRankBadge: {
    position: 'absolute' as const,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: colors.background,
  },
  podiumRankBadgeText: {
    fontSize: 10,
    fontFamily: 'Orbitron_700Bold',
    color: '#FFFFFF',
  },
  podiumName: {
    fontSize: 11,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    textAlign: 'center' as const,
    maxWidth: 90,
  },
  podiumNameFirst: {
    fontSize: 13,
    maxWidth: 110,
  },
  podiumValue: {
    fontSize: 13,
    fontFamily: 'Orbitron_700Bold',
    color: colors.accent,
    textAlign: 'center' as const,
  },
  podiumValueFirst: {
    fontSize: 16,
  },
  podiumCarText: {
    fontSize: 9,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    textAlign: 'center' as const,
    maxWidth: 90,
  },
  podiumStatsCard: {
    flexDirection: 'row' as const,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  podiumStatItem: {
    alignItems: 'center' as const,
    gap: 4,
  },
  podiumStatLabel: {
    fontSize: 9,
    fontFamily: 'Orbitron_500Medium',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase' as const,
  },
  podiumStatValue: {
    fontSize: 13,
    fontFamily: 'Orbitron_700Bold',
    color: '#FFFFFF',
  },
  risingHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingTop: 8,
    paddingBottom: 12,
  },
  risingTitle: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  risingSubtitle: {
    fontSize: 10,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.accent,
    letterSpacing: 1,
  },
  competitorCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.cardLight,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 12,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: colors.border,
  },
  competitorCardActive: {
    borderColor: colors.accent,
    borderLeftWidth: 4,
  },
  competitorActiveBar: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.accent,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  competitorRank: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: colors.textLight,
    width: 30,
    textAlign: 'center' as const,
  },
  competitorRankActive: {
    color: colors.accent,
  },
  competitorAvatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden' as const,
  },
  competitorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  competitorAvatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  competitorAvatarInitial: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: '#FFFFFF',
  },
  competitorInfo: {
    flex: 1,
    gap: 2,
  },
  competitorNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  competitorName: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    flexShrink: 1,
  },
  activeBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 8,
    fontFamily: 'Orbitron_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  competitorCar: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  competitorValueInline: {
    marginLeft: 'auto' as const,
    flexShrink: 0,
  },
  competitorValue: {
    fontSize: 14,
    fontFamily: 'Orbitron_700Bold',
    color: colors.accent,
  },
  competitorMap: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: 'hidden' as const,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  competitorMapView: {
    width: '100%' as const,
    height: '100%' as const,
  },
  competitorMapPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  podiumMap: {
    marginTop: 8,
    width: '100%' as const,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden' as const,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  podiumMapFirst: {
    height: 72,
  },
  podiumMapView: {
    width: '100%' as const,
    height: '100%' as const,
  },
  activeMeetupBannerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: colors.success,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  activeMeetupBannerText: {
    fontSize: 11,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textInverted,
  },
  pendingPingBannerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: colors.danger,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  pendingPingBannerText: {
    fontSize: 11,
    fontFamily: 'Orbitron_700Bold',
    color: colors.textInverted,
  },
  incomingPingBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: colors.cardLight,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.success,
  },
  incomingPingBannerContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 12,
  },
  incomingPingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.success,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  incomingPingInfo: {
    flex: 1,
    gap: 2,
  },
  incomingPingTitle: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  incomingPingCar: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
    color: colors.primary,
  },
  incomingPingActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  incomingPingAccept: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    backgroundColor: colors.success,
    paddingVertical: 12,
    borderRadius: 10,
  },
  incomingPingAcceptText: {
    fontSize: 14,
    fontFamily: 'Orbitron_700Bold',
    color: colors.textInverted,
  },
  incomingPingDecline: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  incomingPingViewAll: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    backgroundColor: colors.success,
    paddingVertical: 12,
    borderRadius: 10,
  },
  incomingPingViewAllText: {
    fontSize: 14,
    fontFamily: 'Orbitron_700Bold',
    color: colors.textInverted,
  },
  navTitle: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  userLocationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.cardLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userLocationText: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    flex: 1,
  },
  nearbyDriversButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  nearbyDriversButtonText: {
    fontSize: 11,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textInverted,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  timePeriodScroll: {
    marginHorizontal: -16,
    marginBottom: 4,
  },
  timePeriodContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  timePeriodChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timePeriodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timePeriodChipText: {
    fontSize: 12,
    fontFamily: 'Orbitron_500Medium',
    color: colors.text,
  },
  timePeriodChipTextActive: {
    color: colors.textInverted,
  },
  categoryDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardLight,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  categoryDropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryDropdownText: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipDisabled: {
    opacity: 0.5,
  },
  filterChipText: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
    color: colors.text,
    flex: 1,
  },
  filterChipTextActive: {
    color: colors.textInverted,
  },
  filterChipTextDisabled: {
    color: colors.textLight,
  },
  clearFiltersChip: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 4,
  },
  emptyState: {
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    padding: 48,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 4,
    textAlign: 'center',
  },
  list: {
    gap: 8,
  },
  listItem: {
    backgroundColor: colors.cardLight,
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#CC0000',
  },
  chevronContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
  entryRightCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingLeft: 4,
  },
  followButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonActive: {
    backgroundColor: 'transparent',
  },
  rankAndAvatarContainer: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  avatarContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  avatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontFamily: 'Orbitron_700Bold',
    color: colors.textInverted,
  },
  rankCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 14,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  userName: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  userNameClickable: {
    color: colors.primary,
    textDecorationLine: 'underline' as const,
  },
  itemDate: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  mainValue: {
    fontSize: 20,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    marginBottom: 4,
  },
  secondaryStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  secondaryStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  secondaryStatValue: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
    paddingVertical: 2,
    paddingHorizontal: 5,
    backgroundColor: colors.background,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  locationText: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  carInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  carBrandModelText: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  carBrandHighlight: {
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    paddingTop: 100,
  },
  modalContent: {
    backgroundColor: colors.cardLight,
    borderRadius: 24,
    marginHorizontal: 16,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  modalScroll: {
    padding: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Orbitron_400Regular',
    color: colors.text,
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  modalOptionActive: {
    backgroundColor: colors.primary,
  },
  modalOptionText: {
    fontSize: 16,
    fontFamily: 'Orbitron_400Regular',
    color: colors.text,
  },
  modalOptionTextActive: {
    color: colors.textInverted,
    fontFamily: 'Orbitron_600SemiBold',
  },
  modalEmpty: {
    padding: 24,
    alignItems: 'center',
  },
  modalEmptyText: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  tripDetailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  tripDetailContent: {
    backgroundColor: colors.cardLight,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  tripDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tripDetailTitle: {
    fontSize: 20,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  tripDetailScroll: {
    padding: 16,
  },
  mapContainer: {
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  map: {
    flex: 1,
  },
  noMapContainer: {
    height: 120,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  noMapText: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  tripDetailSection: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 16,
  },
  tripDetailRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tripDetailItem: {
    flex: 1,
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  tripDetailLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    textTransform: 'uppercase',
  },
  tripDetailValue: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    textAlign: 'center',
  },
  tripDetailLocationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  tripDetailLocationInfo: {
    flex: 1,
  },
  tripDetailLocationLabel: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginBottom: 2,
  },
  tripDetailLocationValue: {
    fontSize: 15,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  tripDetailCarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
    gap: 14,
  },
  tripDetailCarImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  tripDetailCarIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.cardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripDetailCarInfo: {
    flex: 1,
  },
  tripDetailCarLabel: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginBottom: 4,
  },
  tripDetailCarBrand: {
    fontSize: 17,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  tripDetailCarModel: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 2,
  },
  categoryDropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  categoryDropdownContent: {
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    overflow: 'hidden',
  },
  categoryDropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryDropdownTitle: {
    fontSize: 16,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  categoryDropdownList: {
    maxHeight: 350,
  },
  categoryDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryDropdownItemActive: {
    backgroundColor: colors.primary,
  },
  categoryDropdownItemText: {
    fontSize: 14,
    fontFamily: 'Orbitron_500Medium',
    color: colors.text,
  },
  categoryDropdownItemTextActive: {
    color: colors.textInverted,
    fontFamily: 'Orbitron_600SemiBold',
  },
  nearbyDriversOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  nearbyDriversContent: {
    backgroundColor: colors.cardLight,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  nearbyDriversHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nearbyDriversHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nearbyDriversTitle: {
    fontSize: 18,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  nearbyDriversSubtitle: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  nearbyDriversList: {
    paddingHorizontal: 16,
  },
  nearbyLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  nearbyLoadingText: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  nearbyEmptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  nearbyEmptyText: {
    fontSize: 15,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    marginTop: 8,
  },
  nearbyEmptySubtext: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  nearbyDriverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  nearbyDriverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyDriverInitial: {
    fontSize: 18,
    fontFamily: 'Orbitron_700Bold',
    color: colors.textInverted,
  },
  nearbyDriverInfo: {
    flex: 1,
    gap: 2,
  },
  nearbyDriverName: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  nearbyDriverLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nearbyDriverLocation: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  nearbyDriverCarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nearbyDriverCar: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
    color: colors.primary,
  },
  pingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  pingButtonDisabled: {
    backgroundColor: colors.border,
  },
  pingButtonText: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textInverted,
  },
  pingButtonTextDisabled: {
    color: colors.textLight,
  },
  nearbyDriversFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  nearbyDriversFooterText: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  bannerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  meetupsButton: {
    backgroundColor: colors.success,
  },
  meetupSection: {
    marginBottom: 20,
  },
  meetupSectionTitle: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 10,
  },
  meetupItem: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  meetupItemHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    flex: 1,
  },
  meetupItemInfo: {
    flex: 1,
    gap: 2,
  },
  meetupItemName: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  meetupItemTime: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 2,
  },
  meetupActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.success,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  acceptButtonText: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textInverted,
  },
  declineButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  activeMeetupItem: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.success,
    overflow: 'hidden' as const,
  },
  activeMeetupRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  activeAvatar: {
    backgroundColor: colors.success,
  },
  pendingMeetupItem: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    opacity: 0.7,
  },
  pendingAvatar: {
    backgroundColor: colors.textLight,
  },
  pendingStatusText: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    fontStyle: 'italic',
  },
  locationStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  locationSharedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.success}20`,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  locationSharedText: {
    fontSize: 10,
    fontFamily: 'Orbitron_500Medium',
    color: colors.success,
  },
  waitingLocationText: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    fontStyle: 'italic',
  },
  meetupQuickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  shareLocationButtonText: {
    fontSize: 11,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textInverted,
  },
  navigateButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  meetupDetailCard: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  meetupDetailAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  meetupDetailAvatarText: {
    fontSize: 32,
    fontFamily: 'Orbitron_700Bold',
    color: colors.textInverted,
  },
  meetupDetailName: {
    fontSize: 20,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    marginBottom: 4,
  },
  meetupDetailCarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meetupDetailCarText: {
    fontSize: 14,
    fontFamily: 'Orbitron_500Medium',
    color: colors.primary,
  },
  meetupDetailSection: {
    marginBottom: 16,
  },
  meetupDetailSectionTitle: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  locationStatusCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
  },
  locationStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationStatusLabel: {
    fontSize: 13,
    fontFamily: 'Orbitron_500Medium',
    color: colors.text,
  },
  locationDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  shareLocationButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  navigateButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  navigateButtonText: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textInverted,
  },
  cancelMeetupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 32,
  },
  cancelMeetupButtonText: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.danger,
  },
  meetupMapContainer: {
    borderRadius: 16,
    overflow: 'hidden' as const,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  meetupMap: {
    width: '100%',
    height: 200,
  },
  meetupMapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 10,
    backgroundColor: colors.cardLight,
  },
  meetupMapLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meetupMapLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  meetupMapLegendText: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
    color: colors.text,
  },
  viewProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 24,
  },
  viewProfileButtonText: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textInverted,
  },
  navChooserOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end' as const,
  },
  navChooserContent: {
    backgroundColor: colors.cardLight,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  navChooserHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center' as const,
    marginBottom: 16,
  },
  navChooserTitle: {
    fontSize: 18,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    textAlign: 'center' as const,
    paddingHorizontal: 20,
  },
  navChooserSubtitle: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    textAlign: 'center' as const,
    marginTop: 4,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  navChooserOptions: {
    paddingHorizontal: 20,
    gap: 10,
  },
  navChooserOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  navChooserIconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  navChooserOptionInfo: {
    flex: 1,
    gap: 2,
  },
  navChooserOptionTitle: {
    fontSize: 15,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  navChooserOptionSub: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  navChooserCancel: {
    marginTop: 16,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center' as const,
  },
  navChooserCancelText: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
  },
  podiumMiniStats: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: 4,
    marginTop: 4,
    maxWidth: 120,
  },
  podiumMiniStatItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    backgroundColor: colors.background,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  podiumMiniStatValue: {
    fontSize: 8,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
  },
  podiumLocationChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    marginTop: 2,
  },
  podiumLocationText: {
    fontSize: 8,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    maxWidth: 80,
  },
  competitorStatsRow: {
    flexDirection: 'row' as const,
    gap: 6,
    marginTop: 4,
  },
  competitorStatChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    backgroundColor: colors.background,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    flex: 1,
  },
  competitorStatText: {
    fontSize: 9,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
  },
  competitorLocationRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginTop: 3,
  },
  competitorLocationText: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
});
