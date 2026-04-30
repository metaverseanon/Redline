import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BarChart3,
  Route,
  Clock,
  Gauge,
  Zap,
  CornerDownRight,
  TrendingUp,
  Car,
  Calendar,
  Timer,
  Activity,
  Sun,
  Moon,
  Navigation,
  MapPin,
  Share2,
} from 'lucide-react-native';
import MapView, { Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Haptics from 'expo-haptics';
import { useTrips } from '@/providers/TripProvider';
import { useSettings } from '@/providers/SettingsProvider';
import AnimatedCard from '@/components/AnimatedCard';
import WeeklyRecapCard from '@/components/WeeklyRecapCard';
import { TripStats } from '@/types/trip';
import { ThemeColors } from '@/constants/colors';

type ViewMode = 'recent' | 'recap';
type TimePeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all';

interface PeriodStats {
  totalTrips: number;
  totalDistance: number;
  totalDuration: number;
  avgSpeed: number;
  topSpeed: number;
  totalCorners: number;
  avgTripsPerPeriod: number;
  bestAcceleration: number;
  uniqueCarModels: number;
  best0to100: number | null;
  best0to200: number | null;
  maxGForce: number;
  avgTripHour: number;
  dayTrips: number;
  nightTrips: number;
}

export default function RecapScreen() {
  const { trips } = useTrips();
  const { convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel, getAccelerationShortLabel, colors } = useSettings();
  const [viewMode, setViewMode] = useState<ViewMode>('recent');
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('weekly');
  const [showWeeklyRecap, setShowWeeklyRecap] = useState<boolean>(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const lastTrip = trips.length > 0 ? trips[0] : null;

  const routeCoordinates = useMemo(() => {
    if (!lastTrip || !lastTrip.locations || lastTrip.locations.length < 2) return [];
    return lastTrip.locations.map(loc => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
    }));
  }, [lastTrip]);

  const mapRegion = useMemo(() => {
    if (routeCoordinates.length === 0) return null;
    const lats = routeCoordinates.map(c => c.latitude);
    const lngs = routeCoordinates.map(c => c.longitude);
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
  }, [routeCoordinates]);

  const formatAccelTime = (time: number | undefined) => {
    if (time === undefined || time === null || time <= 0) return null;
    return time.toFixed(1);
  };

  const formatDurationShort = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return { hrs, mins, secs };
  };

  const formatDateLarge = (timestamp: number) => {
    const date = new Date(timestamp);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const dateStr = date.toLocaleDateString('en-US', options);
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dateStr}, ${timeStr}`;
  };

  const getPerformanceLabel = () => {
    if (!lastTrip) return 'NO DATA';
    const topSpeed = lastTrip.topSpeed;
    if (topSpeed > 200) return 'PEAK PERFORMANCE';
    if (topSpeed > 150) return 'OPTIMIZED PERFORMANCE';
    if (topSpeed > 100) return 'SOLID DRIVE';
    return 'CASUAL CRUISE';
  };

  const getDriveConsistency = () => {
    if (!lastTrip) return { speedConsistency: 0, corneringFrequency: 0 };
    const speedConsistency = lastTrip.topSpeed > 0
      ? Math.round(Math.min((lastTrip.avgSpeed / lastTrip.topSpeed) * 100, 100))
      : 0;
    const distanceKm = lastTrip.distance / 1000;
    const corneringFrequency = distanceKm > 0
      ? Math.round(Math.min((lastTrip.corners / distanceKm) * 10, 100))
      : 0;
    return {
      speedConsistency: Math.max(speedConsistency, 0),
      corneringFrequency: Math.max(corneringFrequency, 0),
    };
  };

  const periods: { key: TimePeriod; label: string }[] = [
    { key: 'daily', label: 'Today' },
    { key: 'weekly', label: 'Week' },
    { key: 'monthly', label: 'Month' },
    { key: 'yearly', label: 'Year' },
    { key: 'all', label: 'All Time' },
  ];

  const weekRange = useMemo(() => {
    const now = new Date();
    const weekDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    weekDate.setDate(weekDate.getDate() - ((weekDate.getDay() + 6) % 7));
    const start = weekDate.getTime();
    return { start, end: Date.now() };
  }, []);

  const filterTripsByPeriod = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    weekDate.setDate(weekDate.getDate() - ((weekDate.getDay() + 6) % 7));
    const startOfWeek = weekDate.getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

    return (period: TimePeriod): TripStats[] => {
      switch (period) {
        case 'daily':
          return trips.filter((trip) => trip.startTime >= startOfDay);
        case 'weekly':
          return trips.filter((trip) => trip.startTime >= startOfWeek);
        case 'monthly':
          return trips.filter((trip) => trip.startTime >= startOfMonth);
        case 'yearly':
          return trips.filter((trip) => trip.startTime >= startOfYear);
        case 'all':
        default:
          return trips;
      }
    };
  }, [trips]);

  const calculateStats = useMemo((): PeriodStats => {
    const filteredTrips = filterTripsByPeriod(selectedPeriod);

    if (filteredTrips.length === 0) {
      return {
        totalTrips: 0,
        totalDistance: 0,
        totalDuration: 0,
        avgSpeed: 0,
        topSpeed: 0,
        totalCorners: 0,
        avgTripsPerPeriod: 0,
        bestAcceleration: 0,
        uniqueCarModels: 0,
        best0to100: null,
        best0to200: null,
        maxGForce: 0,
        avgTripHour: 12,
        dayTrips: 0,
        nightTrips: 0,
      };
    }

    const totalDistance = filteredTrips.reduce((sum, trip) => sum + trip.distance, 0);
    const totalDuration = filteredTrips.reduce((sum, trip) => sum + trip.duration, 0);
    const topSpeed = Math.max(...filteredTrips.map((trip) => trip.topSpeed));
    const totalCorners = filteredTrips.reduce((sum, trip) => sum + trip.corners, 0);
    const avgSpeed = totalDuration > 0 ? (totalDistance / totalDuration) * 3600 : 0;
    const bestAcceleration = Math.max(...filteredTrips.map((trip) => trip.acceleration || 0));
    const uniqueCarModels = new Set(filteredTrips.map((trip) => trip.carModel).filter(Boolean)).size;

    const times0to100 = filteredTrips.map((trip) => trip.time0to100).filter((t): t is number => t !== undefined && t > 0);
    const best0to100 = times0to100.length > 0 ? Math.min(...times0to100) : null;

    const times0to200 = filteredTrips.map((trip) => trip.time0to200).filter((t): t is number => t !== undefined && t > 0);
    const best0to200 = times0to200.length > 0 ? Math.min(...times0to200) : null;

    const gForces = filteredTrips.map((trip) => trip.maxGForce || 0);
    const maxGForce = gForces.length > 0 ? Math.max(...gForces) : 0;

    const tripHours = filteredTrips.map((trip) => new Date(trip.startTime).getHours());
    const avgTripHour = tripHours.length > 0 ? tripHours.reduce((sum, h) => sum + h, 0) / tripHours.length : 12;

    const dayTrips = tripHours.filter((h) => h >= 6 && h < 20).length;
    const nightTrips = tripHours.filter((h) => h < 6 || h >= 20).length;

    return {
      totalTrips: filteredTrips.length,
      totalDistance,
      totalDuration,
      avgSpeed,
      topSpeed,
      totalCorners,
      avgTripsPerPeriod: filteredTrips.length,
      bestAcceleration,
      uniqueCarModels,
      best0to100,
      best0to200,
      maxGForce,
      avgTripHour,
      dayTrips,
      nightTrips,
    };
  }, [filterTripsByPeriod, selectedPeriod]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  const StatCard = ({
    icon,
    title,
    value,
    unit,
    color,
    large = false,
  }: {
    icon: React.ReactNode;
    title: string;
    value: string | number;
    unit?: string;
    color: string;
    large?: boolean;
  }) => (
    <View style={[styles.statCard, large && styles.statCardLarge]}>
      <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
        {icon}
      </View>
      <Text style={styles.statTitle}>{title}</Text>
      <View style={styles.statValueRow}>
        <Text
          style={[styles.statValue, large && styles.statValueLarge]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {value}
        </Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );

  const renderRecentContent = () => {
    if (!lastTrip) {
      return (
        <View style={styles.emptyStateRecent}>
          <Route size={64} color={colors.textLight} />
          <Text style={styles.emptyText}>No recent trip</Text>
          <Text style={styles.emptySubtext}>Start tracking to see your last trip here</Text>
        </View>
      );
    }

    const duration = formatDurationShort(lastTrip.duration);
    const durationStr = duration.hrs > 0
      ? `${duration.hrs}h ${duration.mins}m ${duration.secs}s`
      : `${duration.mins}m ${duration.secs}s`;
    const consistency = getDriveConsistency();
    const time0to100 = formatAccelTime(lastTrip.time0to100);
    const time0to200 = formatAccelTime(lastTrip.time0to200);

    return (
      <View style={styles.recentContent}>
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerDot} />
            <Text style={styles.headerLabel}>RECENT TELEMETRY</Text>
          </View>
          <Text style={styles.headerDate}>{formatDateLarge(lastTrip.startTime)}</Text>
          <View style={styles.headerBottomRow}>
            <View>
              <Text style={styles.vehicleStatusLabel}>VEHICLE STATUS</Text>
              <Text style={styles.vehicleStatusValue}>{getPerformanceLabel()}</Text>
            </View>
            <View style={styles.headerIconCircle}>
              <Zap size={20} color={colors.accent} />
            </View>
          </View>
        </View>

        <View style={styles.accentCard}>
          <View style={styles.accentBar} />
          <View style={styles.accentCardContent}>
            <View>
              <View style={styles.accentValueRow}>
                <Text style={styles.accentValue}>{Math.round(convertSpeed(lastTrip.topSpeed))}</Text>
                <Text style={styles.accentUnit}>{getSpeedLabel()}</Text>
              </View>
              <Text style={styles.accentLabel}>TOP SPEED</Text>
            </View>
            <Gauge size={22} color={colors.accent} />
          </View>
        </View>

        <View style={styles.accentCard}>
          <View style={styles.accentBar} />
          <View style={styles.accentCardContent}>
            <View>
              <View style={styles.accentValueRow}>
                <Text style={styles.accentValue}>{convertDistance(lastTrip.distance).toFixed(2)}</Text>
                <Text style={styles.accentUnit}>{getDistanceLabel()}</Text>
              </View>
              <Text style={styles.accentLabel}>TOTAL DISTANCE</Text>
            </View>
            <Navigation size={22} color={colors.accent} />
          </View>
        </View>

        <View style={styles.accentCard}>
          <View style={styles.accentBar} />
          <View style={styles.accentCardContent}>
            <View>
              <Text style={styles.accentValue}>{durationStr}</Text>
              <Text style={styles.accentLabel}>TRIP DURATION</Text>
            </View>
            <Clock size={22} color={colors.accent} />
          </View>
        </View>

        <AnimatedCard index={4} slideDistance={18} duration={300}>
          <View style={styles.smallCardsRow}>
            <View style={styles.smallCard}>
              <View style={styles.smallCardValueRow}>
                <Text style={styles.smallCardValue}>{time0to100 ?? '--'}</Text>
                {time0to100 && <Text style={styles.smallCardUnit}>s</Text>}
              </View>
              <Text style={styles.smallCardLabel}>{getAccelerationShortLabel('0-100').toUpperCase()}</Text>
            </View>
            <View style={styles.smallCard}>
              <View style={styles.smallCardValueRow}>
                <Text style={styles.smallCardValue}>{time0to200 ?? '--'}</Text>
                {time0to200 && <Text style={styles.smallCardUnit}>s</Text>}
              </View>
              <Text style={styles.smallCardLabel}>{getAccelerationShortLabel('0-200').toUpperCase()}</Text>
            </View>
          </View>
        </AnimatedCard>

        <AnimatedCard index={5} slideDistance={18} duration={300}>
          <View style={styles.smallCardsRow}>
            <View style={styles.smallCard}>
              <View style={styles.smallCardValueRow}>
                <Text style={styles.smallCardValue}>{(lastTrip.maxGForce ?? 0).toFixed(2)}</Text>
                <Text style={styles.smallCardUnit}>G</Text>
              </View>
              <Text style={styles.smallCardLabel}>MAX G-FORCE</Text>
            </View>
            <View style={styles.smallCard}>
              <View style={styles.smallCardValueRow}>
                <Text style={styles.smallCardValue}>{lastTrip.speedCamerasDetected ?? 0}</Text>
              </View>
              <Text style={styles.smallCardLabel}>SPEED CAMERAS</Text>
            </View>
          </View>
        </AnimatedCard>

        <AnimatedCard index={6} slideDistance={18} duration={300}>
          <View style={styles.smallCardsRow}>
            <View style={styles.smallCard}>
              <View style={styles.smallCardValueRow}>
                <Text style={styles.smallCardValue}>{Math.round(convertSpeed(lastTrip.avgSpeed))}</Text>
                <Text style={styles.smallCardUnit}>{getSpeedLabel()}</Text>
              </View>
              <Text style={styles.smallCardLabel}>AVG SPEED</Text>
            </View>
            <View style={styles.smallCard}>
              <Text style={styles.smallCardValue}>{lastTrip.corners}</Text>
              <Text style={styles.smallCardLabel}>CORNERS TAKEN</Text>
            </View>
          </View>
        </AnimatedCard>

        {routeCoordinates.length >= 2 && mapRegion && (
          <>
            <View style={styles.mapHeader}>
              <Text style={styles.mapTitle}>TRIP ROUTE</Text>
            </View>
            <View style={styles.mapCard}>
              <MapView
                provider={PROVIDER_DEFAULT}
                style={styles.map}
                region={mapRegion}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                mapType="hybrid"
              >
                <Polyline
                  coordinates={routeCoordinates}
                  strokeColor={colors.accent}
                  strokeWidth={4}
                  lineCap="round"
                  lineJoin="round"
                />
              </MapView>
              {lastTrip.location?.city && (
                <View style={styles.mapLocationBadge}>
                  <MapPin size={12} color={colors.accent} />
                  <Text style={styles.mapLocationText}>{lastTrip.location.city.toUpperCase()}</Text>
                </View>
              )}
            </View>
          </>
        )}

        <AnimatedCard index={7} slideDistance={18} duration={300}>
          <View style={styles.consistencyCard}>
            <View style={styles.consistencyHeader}>
              <View style={styles.consistencyDot} />
              <Text style={styles.consistencyTitle}>DRIVE CONSISTENCY</Text>
            </View>
            <View style={styles.consistencyRow}>
              <Text style={styles.consistencyLabel}>Speed Consistency</Text>
              <View style={styles.consistencyBarContainer}>
                <View style={styles.consistencyBarTrack}>
                  <View style={[styles.consistencyBarFill, { width: `${consistency.speedConsistency}%` }]} />
                </View>
                <Text style={styles.consistencyPercent}>{consistency.speedConsistency}%</Text>
              </View>
            </View>
            <View style={styles.consistencyRow}>
              <Text style={styles.consistencyLabel}>Cornering Frequency</Text>
              <View style={styles.consistencyBarContainer}>
                <View style={styles.consistencyBarTrack}>
                  <View style={[styles.consistencyBarFill, { width: `${consistency.corneringFrequency}%` }]} />
                </View>
                <Text style={styles.consistencyPercent}>{consistency.corneringFrequency}%</Text>
              </View>
            </View>
          </View>
        </AnimatedCard>
      </View>
    );
  };

  const renderRecapContent = () => {
    return (
      <View style={styles.recapContent}>
        <View style={styles.recapHeader}>
          <View style={styles.headerIconContainer}>
            <BarChart3 color={colors.accent} size={28} />
          </View>
          <Text style={styles.recapHeaderTitle}>Your Driving Recap</Text>
          <Text style={styles.recapHeaderSubtitle}>Track your progress over time</Text>
        </View>

        <View style={styles.periodSelector}>
          {periods.map((period) => (
            <TouchableOpacity
              key={period.key}
              style={[
                styles.periodButton,
                selectedPeriod === period.key && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod(period.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === period.key && styles.periodButtonTextActive,
                ]}
              >
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <AnimatedCard index={0} slideDistance={24} duration={400}>
          <View style={styles.highlightCard}>
            <View style={styles.highlightIconRow}>
              <View style={styles.highlightIcon}>
                <Route color="#FFFFFF" size={24} />
              </View>
              <Text style={styles.highlightLabel}>Total Trips</Text>
            </View>
            <Text style={styles.highlightValue}>{calculateStats.totalTrips}</Text>
            <Text style={styles.highlightSubtext}>
              {selectedPeriod === 'all'
                ? 'All time'
                : selectedPeriod === 'daily'
                ? 'Today'
                : `This ${selectedPeriod.replace('ly', '')}`}
            </Text>
          </View>
        </AnimatedCard>

        <AnimatedCard index={1} slideDistance={20} duration={350}>
          <View style={styles.statsGrid}>
            <StatCard
              icon={<TrendingUp color={colors.accent} size={20} />}
              title="Distance"
              value={convertDistance(calculateStats.totalDistance).toFixed(1)}
              unit={getDistanceLabel()}
              color={colors.accent}
            />
            <StatCard
              icon={<Clock color={colors.warning} size={20} />}
              title="Time Driving"
              value={formatDuration(calculateStats.totalDuration)}
              color={colors.warning}
            />
            <StatCard
              icon={<Gauge color={colors.success} size={20} />}
              title="Avg Speed"
              value={convertSpeed(calculateStats.avgSpeed).toFixed(0)}
              unit={getSpeedLabel()}
              color={colors.success}
            />
            <StatCard
              icon={<Zap color={colors.danger} size={20} />}
              title="Top Speed"
              value={convertSpeed(calculateStats.topSpeed).toFixed(0)}
              unit={getSpeedLabel()}
              color={colors.danger}
            />
            <StatCard
              icon={<CornerDownRight color="#8B5CF6" size={20} />}
              title="Corners"
              value={calculateStats.totalCorners}
              color="#8B5CF6"
            />
            <StatCard
              icon={<Car color="#EC4899" size={20} />}
              title="Cars Used"
              value={calculateStats.uniqueCarModels}
              color="#EC4899"
            />
            <StatCard
              icon={<Activity color="#EF4444" size={20} />}
              title="Max G-Force"
              value={calculateStats.maxGForce > 0 ? calculateStats.maxGForce.toFixed(2) : '—'}
              unit={calculateStats.maxGForce > 0 ? 'G' : ''}
              color="#EF4444"
            />
            <StatCard
              icon={<Zap color={colors.warning} size={20} />}
              title="Best Accel"
              value={calculateStats.bestAcceleration > 0 ? calculateStats.bestAcceleration.toFixed(1) : '—'}
              unit={calculateStats.bestAcceleration > 0 ? 'm/s²' : ''}
              color={colors.warning}
            />
            <StatCard
              icon={<Timer color="#10B981" size={20} />}
              title={`Best ${getAccelerationShortLabel('0-100')}`}
              value={calculateStats.best0to100 !== null ? calculateStats.best0to100.toFixed(1) : '—'}
              unit={calculateStats.best0to100 !== null ? 'sec' : ''}
              color="#10B981"
            />
            <StatCard
              icon={<Timer color="#F59E0B" size={20} />}
              title={`Best ${getAccelerationShortLabel('0-200')}`}
              value={calculateStats.best0to200 !== null ? calculateStats.best0to200.toFixed(1) : '—'}
              unit={calculateStats.best0to200 !== null ? 'sec' : ''}
              color="#F59E0B"
            />
          </View>
        </AnimatedCard>

        {calculateStats.totalTrips > 0 && (
          <AnimatedCard index={2} slideDistance={20} duration={350}>
            <View style={styles.driverTypeCard}>
              <View style={styles.driverTypeHeader}>
                {calculateStats.nightTrips > calculateStats.dayTrips ? (
                  <Moon color="#6366F1" size={24} />
                ) : (
                  <Sun color="#F59E0B" size={24} />
                )}
                <Text style={styles.driverTypeTitle}>Driver Profile</Text>
              </View>
              <Text style={styles.driverTypeValue}>
                {calculateStats.nightTrips > calculateStats.dayTrips
                  ? '🌙 Night Owl'
                  : calculateStats.dayTrips > calculateStats.nightTrips
                  ? '☀️ Day Cruiser'
                  : '⚖️ Balanced Driver'}
              </Text>
              <Text style={styles.driverTypeSubtext}>
                {calculateStats.nightTrips > calculateStats.dayTrips
                  ? `You prefer driving at night! ${calculateStats.nightTrips} of your ${calculateStats.totalTrips} trips were after 8 PM or before 6 AM.`
                  : calculateStats.dayTrips > calculateStats.nightTrips
                  ? `You're a daytime driver! ${calculateStats.dayTrips} of your ${calculateStats.totalTrips} trips were between 6 AM and 8 PM.`
                  : `You drive equally during day and night - ${calculateStats.dayTrips} day trips and ${calculateStats.nightTrips} night trips.`}
              </Text>
              <View style={styles.dayNightBar}>
                <View style={styles.dayNightLabels}>
                  <View style={styles.dayNightLabelRow}>
                    <Sun color="#F59E0B" size={14} />
                    <Text style={styles.dayNightLabelText}>Day</Text>
                  </View>
                  <View style={styles.dayNightLabelRow}>
                    <Moon color="#6366F1" size={14} />
                    <Text style={styles.dayNightLabelText}>Night</Text>
                  </View>
                </View>
                <View style={styles.dayNightBarTrack}>
                  <View
                    style={[
                      styles.dayNightBarFillDay,
                      {
                        width: `${calculateStats.totalTrips > 0 ? (calculateStats.dayTrips / calculateStats.totalTrips) * 100 : 50}%`,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.dayNightBarFillNight,
                      {
                        width: `${calculateStats.totalTrips > 0 ? (calculateStats.nightTrips / calculateStats.totalTrips) * 100 : 50}%`,
                      },
                    ]}
                  />
                </View>
                <View style={styles.dayNightCounts}>
                  <Text style={styles.dayNightCountText}>{calculateStats.dayTrips}</Text>
                  <Text style={styles.dayNightCountText}>{calculateStats.nightTrips}</Text>
                </View>
              </View>
            </View>
          </AnimatedCard>
        )}

        {selectedPeriod === 'weekly' && calculateStats.totalTrips > 0 && (
          <AnimatedCard index={3} slideDistance={20} duration={350}>
            <TouchableOpacity
              style={styles.weeklyShareCta}
              onPress={() => setShowWeeklyRecap(true)}
              activeOpacity={0.85}
              testID="weekly-recap-share"
            >
              <View style={styles.weeklyShareIcon}>
                <Share2 color="#FFFFFF" size={20} />
              </View>
              <View style={styles.weeklyShareTextWrap}>
                <Text style={styles.weeklyShareTitle}>Share Your Week</Text>
                <Text style={styles.weeklyShareSubtitle}>
                  Generate a weekly recap card to post on stories
                </Text>
              </View>
            </TouchableOpacity>
          </AnimatedCard>
        )}

        {calculateStats.totalTrips === 0 && (
          <View style={styles.emptyState}>
            <Calendar color={colors.textLight} size={48} />
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptySubtitle}>
              Start tracking your trips to see your statistics here
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navHeader}>
        <Text style={styles.navTitle}>Recap</Text>
      </View>

      <View style={styles.viewModeSelector}>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'recent' && styles.viewModeButtonActive]}
          onPress={() => handleViewModeChange('recent')}
          activeOpacity={0.7}
        >
          <Clock size={14} color={viewMode === 'recent' ? colors.textInverted : colors.textLight} />
          <Text style={[styles.viewModeText, viewMode === 'recent' && styles.viewModeTextActive]}>
            Recent
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'recap' && styles.viewModeButtonActive]}
          onPress={() => handleViewModeChange('recap')}
          activeOpacity={0.7}
        >
          <BarChart3 size={14} color={viewMode === 'recap' ? colors.textInverted : colors.textLight} />
          <Text style={[styles.viewModeText, viewMode === 'recap' && styles.viewModeTextActive]}>
            Stats
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {viewMode === 'recent' ? renderRecentContent() : renderRecapContent()}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WeeklyRecapCard
        visible={showWeeklyRecap}
        onClose={() => setShowWeeklyRecap(false)}
        trips={trips}
        weekStart={weekRange.start}
        weekEnd={weekRange.end}
      />
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
    paddingBottom: 8,
    alignItems: 'center' as const,
  },
  navTitle: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  viewModeSelector: {
    flexDirection: 'row' as const,
    marginHorizontal: 20,
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  viewModeButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    borderRadius: 9,
    gap: 6,
  },
  viewModeButtonActive: {
    backgroundColor: colors.primary,
  },
  viewModeText: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
  },
  viewModeTextActive: {
    color: colors.textInverted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  recentContent: {},
  recapContent: {},

  emptyStateRecent: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 20,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 8,
    textAlign: 'center' as const,
  },

  headerCard: {
    backgroundColor: colors.cardLight,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  headerTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginRight: 8,
  },
  headerLabel: {
    fontSize: 11,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
    letterSpacing: 1,
  },
  headerDate: {
    fontSize: 26,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    marginBottom: 16,
  },
  headerBottomRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  vehicleStatusLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  vehicleStatusValue: {
    fontSize: 13,
    fontFamily: 'Orbitron_700Bold',
    color: colors.accent,
    letterSpacing: 0.5,
  },
  headerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  accentCard: {
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: 'row' as const,
    overflow: 'hidden' as const,
  },
  accentBar: {
    width: 4,
    backgroundColor: colors.accent,
  },
  accentCardContent: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  accentValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
  },
  accentValue: {
    fontSize: 30,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  accentUnit: {
    fontSize: 16,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginLeft: 6,
  },
  accentLabel: {
    fontSize: 11,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
    marginTop: 4,
    letterSpacing: 0.5,
  },

  smallCardsRow: {
    flexDirection: 'row' as const,
    gap: 12,
    marginBottom: 12,
  },
  smallCard: {
    flex: 1,
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center' as const,
  },
  smallCardValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
  },
  smallCardValue: {
    fontSize: 26,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  smallCardUnit: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginLeft: 4,
  },
  smallCardLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
    marginTop: 6,
    letterSpacing: 0.5,
    textAlign: 'center' as const,
  },

  mapHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 12,
    marginTop: 8,
  },
  mapTitle: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    letterSpacing: 0.5,
  },
  mapCard: {
    borderRadius: 20,
    overflow: 'hidden' as const,
    height: 220,
    marginBottom: 16,
    position: 'relative' as const,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapLocationBadge: {
    position: 'absolute' as const,
    bottom: 14,
    left: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  mapLocationText: {
    fontSize: 10,
    fontFamily: 'Orbitron_600SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  consistencyCard: {
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
  },
  consistencyHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 18,
  },
  consistencyDot: {
    width: 20,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginRight: 10,
  },
  consistencyTitle: {
    fontSize: 12,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    letterSpacing: 1,
  },
  consistencyRow: {
    marginBottom: 14,
  },
  consistencyLabel: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginBottom: 8,
  },
  consistencyBarContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  consistencyBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  consistencyBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  consistencyPercent: {
    fontSize: 14,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    width: 42,
    textAlign: 'right' as const,
  },

  recapHeader: {
    alignItems: 'center' as const,
    paddingTop: 12,
    paddingBottom: 24,
  },
  headerIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accent + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
  },
  recapHeaderTitle: {
    fontSize: 24,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    marginBottom: 4,
  },
  recapHeaderSubtitle: {
    fontSize: 15,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  periodSelector: {
    flexDirection: 'row' as const,
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center' as const,
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
  },
  periodButtonText: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
  },
  periodButtonTextActive: {
    color: colors.textInverted,
  },
  highlightCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center' as const,
    marginBottom: 20,
  },
  highlightIconRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  highlightIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 10,
  },
  highlightLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Orbitron_500Medium',
  },
  highlightValue: {
    fontSize: 64,
    fontFamily: 'Orbitron_700Bold',
    color: '#FFFFFF',
    lineHeight: 72,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  highlightSubtext: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 8,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
    flexGrow: 1,
    flexBasis: '45%',
  },
  statCardLarge: {
    width: '100%',
    flexBasis: '100%',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
  },
  statTitle: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginBottom: 4,
  },
  statValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
  },
  statValue: {
    fontSize: 24,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  statValueLarge: {
    fontSize: 32,
  },
  statUnit: {
    fontSize: 14,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
    marginLeft: 4,
  },

  driverTypeCard: {
    marginTop: 4,
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    padding: 20,
  },
  driverTypeHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  driverTypeTitle: {
    fontSize: 15,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    marginLeft: 10,
  },
  driverTypeValue: {
    fontSize: 24,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    marginBottom: 8,
  },
  driverTypeSubtext: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    lineHeight: 20,
    marginBottom: 16,
  },
  dayNightBar: {
    marginTop: 8,
  },
  dayNightLabels: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  dayNightLabelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  dayNightLabelText: {
    fontSize: 12,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
  },
  dayNightBarTrack: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 5,
    flexDirection: 'row' as const,
    overflow: 'hidden' as const,
  },
  dayNightBarFillDay: {
    height: '100%',
    backgroundColor: '#F59E0B',
  },
  dayNightBarFillNight: {
    height: '100%',
    backgroundColor: '#6366F1',
  },
  dayNightCounts: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 6,
  },
  dayNightCountText: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    textAlign: 'center' as const,
  },
  bottomSpacer: {
    height: 40,
  },
  weeklyShareCta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    gap: 14,
  },
  weeklyShareIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  weeklyShareTextWrap: {
    flex: 1,
  },
  weeklyShareTitle: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: '#FFFFFF',
  },
  weeklyShareSubtitle: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
});
