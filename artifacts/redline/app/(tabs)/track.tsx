import { useCallback, useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Platform, Animated, Alert } from 'react-native';
import * as ExpoLocation from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Play, Square, Map, Gauge, X, Timer } from 'lucide-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTrips } from '@/providers/TripProvider';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';
import TripShareCard from '@/components/TripShareCard';
import AuthGate from '@/components/AuthGate';

let MapView: React.ComponentType<any> | null = null;
let Polyline: React.ComponentType<any> | null = null;
let Marker: React.ComponentType<any> | null = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Polyline = Maps.Polyline;
    Marker = Maps.Marker;
  } catch {
    console.log('react-native-maps not available');
  }
}

type ViewMode = 'standard' | 'map';

const GAUGE_SIZE = 260;
const GAUGE_STROKE = 8;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CENTER = GAUGE_SIZE / 2;
const START_ANGLE = 135;
const END_ANGLE = 405;
const SWEEP = END_ANGLE - START_ANGLE;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export default function TrackScreen() {
  const { isTracking, currentTrip, currentSpeed, currentLocation, startTracking, stopTracking, cancelTracking, lastSavedTrip, clearLastSavedTrip, speedCameraBlocked } = useTrips();
  const { convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel, getAccelerationLabel, colors } = useSettings();
  const { user } = useUser();
  const [showShareCard, setShowShareCard] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('standard');
  const mapRef = useRef<any>(null);
  const toggleAnim = useRef(new Animated.Value(0)).current;
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const locationFetched = useRef(false);
  const [showAuthGate, setShowAuthGate] = useState(false);

  useEffect(() => {
    if (lastSavedTrip && !isTracking) {
      setShowShareCard(true);
    }
  }, [lastSavedTrip, isTracking]);

  useEffect(() => {
    Animated.timing(toggleAnim, {
      toValue: viewMode === 'map' ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [viewMode, toggleAnim]);

  useEffect(() => {
    if (viewMode === 'map' && !locationFetched.current && Platform.OS !== 'web') {
      locationFetched.current = true;
      void (async () => {
        try {
          const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          if (mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: loc.coords.latitude, longitude: loc.coords.longitude,
              latitudeDelta: 0.012, longitudeDelta: 0.012,
            }, 500);
          }
        } catch (e) { console.log('Failed to fetch user location:', e); }
      })();
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === 'map' && currentLocation && mapRef.current) {
      try {
        mapRef.current.animateToRegion({
          latitude: currentLocation.latitude, longitude: currentLocation.longitude,
          latitudeDelta: 0.012, longitudeDelta: 0.012,
        }, 300);
      } catch (e) { console.log('Failed to animate map:', e); }
    }
  }, [currentLocation, viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || Platform.OS === 'web') return;
    let sub: ExpoLocation.LocationSubscription | null = null;
    void (async () => {
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        sub = await ExpoLocation.watchPositionAsync(
          { accuracy: ExpoLocation.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
          (loc) => {
            const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setUserLocation(coords);
            if (mapRef.current) {
              mapRef.current.animateToRegion({ ...coords, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 300);
            }
          },
        );
      } catch (e) { console.log('Watch position error:', e); }
    })();
    return () => { sub?.remove(); };
  }, [viewMode]);

  const handleCloseShareCard = useCallback(() => {
    setShowShareCard(false);
    clearLastSavedTrip();
  }, [clearLastSavedTrip]);

  const isDark = colors.background === '#000000';

  const getSpeedColor = useCallback((speed: number) => {
    const maxSpeed = 200;
    const clampedSpeed = Math.min(Math.max(speed, 0), maxSpeed);
    const ratio = clampedSpeed / maxSpeed;
    const r = Math.round(0 + (255 - 0) * ratio);
    const g = Math.round(200 + (71 - 200) * ratio);
    const b = Math.round(83 + (87 - 83) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }, []);

  const getUserCarModel = useCallback(() => {
    if (user?.cars && user.cars.length > 0) {
      const primary = user.cars.find(c => c.isPrimary) || user.cars[0];
      return `${primary.brand} ${primary.model}`;
    }
    if (user?.carBrand) return `${user.carBrand} ${user.carModel || ''}`;
    return undefined;
  }, [user?.cars, user?.carBrand, user?.carModel]);

  const handleStopTracking = useCallback(() => {
    void stopTracking(getUserCarModel());
  }, [stopTracking, getUserCarModel]);

  const handleCancelTracking = useCallback(() => {
    Alert.alert('Discard Trip', 'Are you sure you want to exit without saving this trip?', [
      { text: 'Keep Tracking', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void cancelTracking() },
    ]);
  }, [cancelTracking]);

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => prev === 'standard' ? 'map' : 'standard');
  }, []);

  const formatDurationLong = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m ${secs}s`;
  };

  const displaySpeed = isTracking ? Math.round(convertSpeed(currentSpeed)) : 0;
  const speedColor = isTracking ? getSpeedColor(currentSpeed) : colors.success;
  const canShowMap = MapView !== null && Platform.OS !== 'web';

  const routeCoords = currentTrip?.locations?.map(loc => ({
    latitude: loc.latitude, longitude: loc.longitude,
  })) ?? [];

  const speedRatio = Math.min(Math.max(isTracking ? currentSpeed : 0, 0), 300) / 300;
  const activeAngle = START_ANGLE + SWEEP * speedRatio;
  const bgArcPath = describeArc(GAUGE_CENTER, GAUGE_CENTER, GAUGE_RADIUS, START_ANGLE, END_ANGLE);
  const activeArcPath = speedRatio > 0.005
    ? describeArc(GAUGE_CENTER, GAUGE_CENTER, GAUGE_RADIUS, START_ANGLE, activeAngle)
    : '';
  const dotPos = polarToCartesian(GAUGE_CENTER, GAUGE_CENTER, GAUGE_RADIUS, activeAngle);

  const cardBg = isDark ? '#1A1A1A' : '#FFFFFF';
  const cardBorder = isDark ? '#2A2A2A' : '#F0F0F0';

  const renderGauge = () => (
    <View style={gaugeStyles.container}>
      <View style={[gaugeStyles.gaugeOuter, { backgroundColor: isDark ? '#0A0A0A' : '#F0F5F0' }]}>
        <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
          <Path
            d={bgArcPath}
            stroke={isDark ? '#2A2A2A' : '#E8ECE8'}
            strokeWidth={GAUGE_STROKE}
            fill="none"
            strokeLinecap="round"
          />
          {activeArcPath ? (
            <Path
              d={activeArcPath}
              stroke={speedColor}
              strokeWidth={GAUGE_STROKE}
              fill="none"
              strokeLinecap="round"
            />
          ) : null}
          {speedRatio > 0.005 ? (
            <Circle cx={dotPos.x} cy={dotPos.y} r={5} fill={speedColor} />
          ) : (
            <Circle
              cx={polarToCartesian(GAUGE_CENTER, GAUGE_CENTER, GAUGE_RADIUS, START_ANGLE).x}
              cy={polarToCartesian(GAUGE_CENTER, GAUGE_CENTER, GAUGE_RADIUS, START_ANGLE).y}
              r={5}
              fill={speedColor}
            />
          )}
        </Svg>
        <View style={gaugeStyles.speedTextContainer}>
          <Text style={[gaugeStyles.speedValue, { color: colors.text }]}>{displaySpeed}</Text>
          <Text style={[gaugeStyles.speedUnit, { color: colors.textLight }]}>{getSpeedLabel()}</Text>
        </View>
      </View>

      <View style={gaugeStyles.statusRow}>
        <View style={[gaugeStyles.statusDot, { backgroundColor: isTracking ? speedColor : colors.success }]} />
        <Text style={[gaugeStyles.statusText, { color: colors.textLight }]}>
          {isTracking ? 'TRACKING ACTIVE' : 'SYSTEM READY'} • GPS {isTracking ? 'ACTIVE' : 'LOCKED'}
        </Text>
      </View>
    </View>
  );

  const renderStandardView = () => (
    <>
      <ScrollView style={sStyles.scrollView} contentContainerStyle={sStyles.scrollContent} showsVerticalScrollIndicator={false}>
        {renderGauge()}

        <View style={sStyles.statsSection}>
          <View style={sStyles.row}>
            <View style={[sStyles.statCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={[sStyles.statLabel, { color: colors.textLight }]}>TOP {getSpeedLabel().toUpperCase()}</Text>
              <View style={sStyles.statValueRow}>
                <Text style={[sStyles.statValue, { color: colors.text }]}>
                  {currentTrip ? Math.round(convertSpeed(currentTrip.topSpeed)) : '0'}
                </Text>
                <Text style={[sStyles.statSuffix, { color: colors.success }]}>MAX</Text>
              </View>
            </View>
            <View style={[sStyles.statCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={[sStyles.statLabel, { color: colors.textLight }]}>DISTANCE {getDistanceLabel().toUpperCase()}</Text>
              <View style={sStyles.statValueRow}>
                <Text style={[sStyles.statValue, { color: colors.text }]}>
                  {currentTrip ? convertDistance(currentTrip.distance).toFixed(1) : '0.0'}
                </Text>
                <Text style={[sStyles.statSuffix, { color: colors.success }]}>TRIP</Text>
              </View>
            </View>
          </View>

          <View style={[sStyles.durationCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={sStyles.durationHeader}>
              <Timer size={18} color={colors.textLight} />
              <Text style={[sStyles.durationLabel, { color: colors.textLight }]}>DURATION</Text>
            </View>
            <Text style={[sStyles.durationValue, { color: colors.text }]}>
              {currentTrip ? formatDurationLong(currentTrip.duration) : '00:00:00'}
            </Text>
          </View>

          <View style={sStyles.row}>
            <View style={[sStyles.statCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={[sStyles.statLabel, { color: colors.textLight }]}>{getAccelerationLabel('0-100').toUpperCase()}</Text>
              <View style={sStyles.statValueRow}>
                <Text style={[sStyles.statValue, { color: colors.text }]}>
                  {currentTrip?.time0to100 ? currentTrip.time0to100.toFixed(2) : '--'}
                </Text>
                <Text style={[sStyles.statSuffixSmall, { color: colors.textLight }]}>SEC</Text>
              </View>
            </View>
            <View style={[sStyles.statCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={[sStyles.statLabel, { color: colors.textLight }]}>{getAccelerationLabel('0-200').toUpperCase()}</Text>
              <View style={sStyles.statValueRow}>
                <Text style={[sStyles.statValue, { color: colors.text }]}>
                  {currentTrip?.time0to200 ? currentTrip.time0to200.toFixed(2) : '--'}
                </Text>
                <Text style={[sStyles.statSuffixSmall, { color: colors.textLight }]}>SEC</Text>
              </View>
            </View>
          </View>

          <View style={[sStyles.statCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[sStyles.statLabel, { color: colors.textLight }]}>{getAccelerationLabel('100-200').toUpperCase()}</Text>
            <View style={sStyles.statValueRow}>
              <Text style={[sStyles.statValue, { color: colors.text }]}>
                {currentTrip?.time100to200 ? currentTrip.time100to200.toFixed(2) : '--'}
              </Text>
              <Text style={[sStyles.statSuffixSmall, { color: colors.textLight }]}>SEC</Text>
            </View>
          </View>

          <View style={sStyles.row}>
            <View style={[sStyles.statCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={[sStyles.statLabel, { color: colors.textLight }]}>G-FORCE</Text>
              <View style={sStyles.statValueRow}>
                <Text style={[sStyles.statValue, { color: colors.text }]}>
                  {currentTrip ? (currentTrip.maxGForce ?? 0).toFixed(2) : '0.00'}
                </Text>
                <Text style={[sStyles.statSuffixSmall, { color: colors.textLight }]}>LAT</Text>
              </View>
            </View>
            {!speedCameraBlocked && (
              <View style={[sStyles.statCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[sStyles.statLabel, { color: colors.textLight }]}>SPEED CAMERAS</Text>
                <View style={sStyles.statValueRow}>
                  <Text style={[sStyles.statValue, { color: colors.text }]}>
                    {currentTrip?.speedCamerasDetected ?? 0}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={sStyles.buttonContainer}>
        {!isTracking ? (
          <TouchableOpacity
            style={[sStyles.actionButton, sStyles.startButton]}
            onPress={() => {
              if (!user) {
                setShowAuthGate(true);
                return;
              }
              void startTracking();
            }}
            activeOpacity={0.8}
            testID="start-trip-button"
          >
            <Text style={sStyles.buttonText}>START TRIP</Text>
            <Play size={20} color="#FFFFFF" fill="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[sStyles.actionButton, sStyles.stopButton]}
            onPress={handleStopTracking}
            activeOpacity={0.8}
            testID="stop-trip-button"
          >
            <Square size={20} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={sStyles.buttonText}>STOP TRIP</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  const renderMapView = () => {
    if (!canShowMap || !MapView) return null;
    const effectiveLocation = currentLocation || userLocation;
    const mapRegion = effectiveLocation ? {
      latitude: effectiveLocation.latitude, longitude: effectiveLocation.longitude,
      latitudeDelta: 0.012, longitudeDelta: 0.012,
    } : { latitude: 45.815, longitude: 15.982, latitudeDelta: 0.012, longitudeDelta: 0.012 };

    return (
      <View style={mapStyles.mapContainer}>
        <MapView
          ref={mapRef}
          style={mapStyles.map}
          initialRegion={mapRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          followsUserLocation={false}
          showsCompass={false}
          customMapStyle={isDark ? darkMapStyle : []}
          mapType="standard"
        >
          {effectiveLocation && Marker && (
            <Marker
              coordinate={{ latitude: effectiveLocation.latitude, longitude: effectiveLocation.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat={true}
            >
              <View style={mapStyles.dotOuter}><View style={mapStyles.dotInner} /></View>
            </Marker>
          )}
          {routeCoords.length > 1 && Polyline && (
            <Polyline coordinates={routeCoords} strokeColor={colors.accent} strokeWidth={3} />
          )}
        </MapView>

        <View style={mapStyles.speedOverlay}>
          <View style={[mapStyles.miniSpeedCircle, { borderColor: speedColor }]}>
            <Text style={mapStyles.miniSpeedValue}>{displaySpeed}</Text>
            <Text style={mapStyles.miniSpeedUnit}>{getSpeedLabel()}</Text>
          </View>
        </View>

        <View style={mapStyles.statsOverlay}>
          <View style={mapStyles.statsRow}>
            <View style={mapStyles.mapStatItem}>
              <Text style={mapStyles.mapStatValue}>{currentTrip ? Math.round(convertSpeed(currentTrip.topSpeed)) : '0'}</Text>
              <Text style={mapStyles.mapStatLabel}>Top {getSpeedLabel()}</Text>
            </View>
            <View style={mapStyles.mapStatDivider} />
            <View style={mapStyles.mapStatItem}>
              <Text style={mapStyles.mapStatValue}>{currentTrip ? convertDistance(currentTrip.distance).toFixed(2) : '0.00'}</Text>
              <Text style={mapStyles.mapStatLabel}>{getDistanceLabel()}</Text>
            </View>
            <View style={mapStyles.mapStatDivider} />
            <View style={mapStyles.mapStatItem}>
              <Text style={mapStyles.mapStatValue}>{currentTrip ? formatDuration(currentTrip.duration) : '0:00'}</Text>
              <Text style={mapStyles.mapStatLabel}>Duration</Text>
            </View>
          </View>
        </View>

        <View style={[mapStyles.mapButtonContainer, { backgroundColor: 'transparent' }]}>
          {!isTracking ? (
            <TouchableOpacity style={[sStyles.actionButton, sStyles.startButton]} onPress={() => { if (!user) { setShowAuthGate(true); return; } void startTracking(); }} activeOpacity={0.8}>
              <Play size={24} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={sStyles.buttonText}>START TRIP</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[sStyles.actionButton, sStyles.stopButton]} onPress={handleStopTracking} activeOpacity={0.8}>
              <Square size={24} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={sStyles.buttonText}>STOP TRIP</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[sStyles.container, { backgroundColor: isDark ? '#000000' : colors.background }]} edges={['top']}>
      <View style={sStyles.navHeader}>
        {canShowMap && (
          <TouchableOpacity
            style={[sStyles.navBtn, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={toggleViewMode}
            activeOpacity={0.7}
            testID="view-mode-toggle"
          >
            {viewMode === 'standard' ? <Map size={18} color={colors.text} /> : <Gauge size={18} color={colors.text} />}
          </TouchableOpacity>
        )}
        <Text style={[sStyles.navTitle, { color: colors.text }]}>Track</Text>
        {isTracking ? (
          <TouchableOpacity
            style={[sStyles.navBtn, { backgroundColor: isDark ? '#2A1A1A' : '#FFF0F0', borderColor: isDark ? '#3A2A2A' : '#FFCCCC' }]}
            onPress={handleCancelTracking}
            activeOpacity={0.7}
            testID="cancel-tracking-button"
          >
            <X size={18} color="#CC0000" />
          </TouchableOpacity>
        ) : (
          canShowMap ? <View style={sStyles.navBtnPlaceholder} /> : null
        )}
      </View>

      {viewMode === 'map' && canShowMap ? renderMapView() : renderStandardView()}

      {lastSavedTrip && (
        <TripShareCard trip={lastSavedTrip} visible={showShareCard} onClose={handleCloseShareCard} />
      )}

      <AuthGate
        visible={showAuthGate}
        onClose={() => setShowAuthGate(false)}
        feature="track your drives and save stats"
      />
    </SafeAreaView>
  );
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2C2C2C' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#3C3C3C' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
];

const gaugeStyles = StyleSheet.create({
  container: {
    alignItems: 'center' as const,
    paddingTop: 12,
    paddingBottom: 4,
  },
  gaugeOuter: {
    width: GAUGE_SIZE + 24,
    height: GAUGE_SIZE + 24,
    borderRadius: (GAUGE_SIZE + 24) / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  speedTextContainer: {
    position: 'absolute' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  speedValue: {
    fontSize: 72,
    fontFamily: 'Orbitron_700Bold',
  },
  speedUnit: {
    fontSize: 16,
    fontFamily: 'Orbitron_600SemiBold',
    textTransform: 'uppercase' as const,
    marginTop: 2,
    letterSpacing: 2,
  },
  statusRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
    letterSpacing: 1,
  },
});

const sStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  navTitle: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    flex: 1,
    textAlign: 'center' as const,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
  },
  navBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  statsSection: {
    gap: 12,
    marginTop: 8,
  },
  dailySection: {
    marginTop: 14,
  },
  row: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_500Medium',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: 6,
  },
  statValue: {
    fontSize: 28,
    fontFamily: 'Orbitron_700Bold',
  },
  statSuffix: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
  },
  statSuffixSmall: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
  },
  accelCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  accelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  accelValue: {
    fontSize: 36,
    fontFamily: 'Orbitron_700Bold',
  },
  accelUnit: {
    fontSize: 18,
    fontFamily: 'Orbitron_500Medium',
  },
  shareIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  durationCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  durationHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 6,
  },
  durationLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_500Medium',
    letterSpacing: 0.5,
  },
  durationValue: {
    fontSize: 30,
    fontFamily: 'Orbitron_700Bold',
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
  },
  startButton: {
    backgroundColor: '#00C853',
  },
  stopButton: {
    backgroundColor: '#CC0000',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    letterSpacing: 2,
  },
});

const mapStyles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    position: 'relative' as const,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  speedOverlay: {
    position: 'absolute' as const,
    bottom: 180,
    left: 20,
  },
  miniSpeedCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 3,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  miniSpeedValue: {
    fontSize: 40,
    fontFamily: 'Orbitron_700Bold',
    color: '#FFFFFF',
  },
  miniSpeedUnit: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase' as const,
    marginTop: 2,
  },
  statsOverlay: {
    position: 'absolute' as const,
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-around' as const,
  },
  mapStatItem: {
    flex: 1,
    alignItems: 'center' as const,
  },
  mapStatValue: {
    fontSize: 18,
    fontFamily: 'Orbitron_600SemiBold',
    color: '#FFFFFF',
  },
  mapStatLabel: {
    fontSize: 10,
    fontFamily: 'Orbitron_500Medium',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase' as const,
    marginTop: 2,
  },
  mapStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  mapButtonContainer: {
    position: 'absolute' as const,
    bottom: 30,
    left: 20,
    right: 20,
  },
  dotOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dotInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#007AFF',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
});
