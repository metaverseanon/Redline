import React, { useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  Platform,
  Alert,
  Dimensions,
  Image,
} from 'react-native';
import { X, Download, Share2 } from 'lucide-react-native';
import Svg, { Polyline } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { TripStats } from '@/types/trip';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';

type TimePeriod = 'today' | 'week' | 'month' | 'year' | 'all';

interface TripShareCardProps {
  trip: TripStats;
  visible: boolean;
  onClose: () => void;
  timePeriod?: TimePeriod;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 360);
const MAP_HEIGHT = 240;

const LOGO_URL = 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/9ts3c4tgfcrqhgxwwrqfk';

export default function TripShareCard({ trip, visible, onClose }: TripShareCardProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const { user } = useUser();
  const { convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel, settings } = useSettings();
  const shareFields = settings.shareCardFields;

  const routePathData = useMemo(() => {
    if (!trip.locations || trip.locations.length < 2) return null;

    const lats = trip.locations.map(l => l.latitude);
    const lngs = trip.locations.map(l => l.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const padding = 16;
    const svgWidth = CARD_WIDTH - 32;
    const svgHeight = MAP_HEIGHT;
    const drawWidth = svgWidth - padding * 2;
    const drawHeight = svgHeight - padding * 2;

    const latRange = maxLat - minLat || 0.001;
    const lngRange = maxLng - minLng || 0.001;
    const latLngAspect = latRange / lngRange;
    const drawAspect = drawHeight / drawWidth;

    let scaleX: number;
    let scaleY: number;
    let offsetX = padding;
    let offsetY = padding;
    if (latLngAspect > drawAspect) {
      scaleY = drawHeight / latRange;
      scaleX = scaleY;
      const usedWidth = lngRange * scaleX;
      offsetX = padding + (drawWidth - usedWidth) / 2;
    } else {
      scaleX = drawWidth / lngRange;
      scaleY = scaleX;
      const usedHeight = latRange * scaleY;
      offsetY = padding + (drawHeight - usedHeight) / 2;
    }

    const points = trip.locations.map(loc => {
      const x = offsetX + (loc.longitude - minLng) * scaleX;
      const y = offsetY + (maxLat - loc.latitude) * scaleY;
      return `${x},${y}`;
    }).join(' ');

    return { points, svgWidth, svgHeight };
  }, [trip.locations]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const getLocationString = () => {
    if (trip.location?.city && trip.location?.country) {
      return `${trip.location.city}, ${trip.location.country}`;
    }
    if (trip.location?.country) {
      return trip.location.country;
    }
    return null;
  };

  const speedValue = Math.round(convertSpeed(trip.topSpeed));
  const speedLabel = getSpeedLabel();
  const distanceValueRaw = convertDistance(trip.distance);
  const distanceValue = distanceValueRaw < 1
    ? distanceValueRaw.toFixed(2)
    : distanceValueRaw < 10
      ? distanceValueRaw.toFixed(2)
      : distanceValueRaw.toFixed(1);
  const distanceLabel = getDistanceLabel();
  const durationValue = formatDuration(trip.duration);

  const handleSaveToDevice = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Not Available', 'Saving to device is not available on web.');
        return;
      }

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant media library permission to save images.');
        return;
      }

      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved', 'Trip image saved to your gallery — share it on stories with your own background!');
      }
    } catch (error) {
      console.error('Failed to save image:', error);
      Alert.alert('Error', 'Failed to save image. Please try again.');
    }
  }, []);

  const handleShare = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Not Available', 'Sharing is not available on web.');
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not Available', 'Sharing is not available on this device.');
        return;
      }

      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your trip',
        });
      }
    } catch (error) {
      console.error('Failed to share:', error);
      Alert.alert('Error', 'Failed to share. Please try again.');
    }
  }, []);

  const showTopSpeed = shareFields.topSpeed;
  const showDistance = shareFields.distance;
  const showDuration = shareFields.duration;
  const showMap = shareFields.routeMap;
  const locationString = getLocationString();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.previewHint}>
            Transparent — share over your own photo or video
          </Text>

          <View style={styles.previewBackdrop}>
            <ViewShot
              ref={viewShotRef}
              options={{ format: 'png', quality: 1, result: 'tmpfile' }}
              style={styles.viewShotContainer}
            >
              <View style={styles.card}>
                <Image
                  source={{ uri: LOGO_URL }}
                  style={styles.logo}
                  resizeMode="contain"
                />

                <View style={styles.statsBlock}>
                  {showTopSpeed && (
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Top speed</Text>
                      <Text style={styles.statValue}>{speedValue} {speedLabel}</Text>
                    </View>
                  )}
                  {showDistance && (
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Distance</Text>
                      <Text style={styles.statValue}>
                        {distanceValue} {distanceLabel === 'mi' ? 'mi' : 'km'}
                      </Text>
                    </View>
                  )}
                  {showDuration && (
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>Time</Text>
                      <Text style={styles.statValue}>{durationValue}</Text>
                    </View>
                  )}
                </View>

                {showMap && (
                  <View style={styles.mapBlock}>
                    {routePathData ? (
                      <Svg width={routePathData.svgWidth} height={routePathData.svgHeight}>
                        <Polyline
                          points={routePathData.points}
                          fill="none"
                          stroke="#FFFFFF"
                          strokeOpacity={0.35}
                          strokeWidth={6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <Polyline
                          points={routePathData.points}
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </Svg>
                    ) : (
                      <Text style={styles.noRouteText}>No route data</Text>
                    )}
                  </View>
                )}

                <View style={styles.footer}>
                  <Text style={styles.footerText}>
                    {formatDate(trip.startTime)}{locationString ? ` · ${locationString}` : ''}
                  </Text>
                  {(user?.instagramUsername || user?.tiktokUsername) && (
                    <Text style={styles.footerText}>
                      {user?.instagramUsername ? `IG @${user.instagramUsername}` : ''}
                      {user?.instagramUsername && user?.tiktokUsername ? ' · ' : ''}
                      {user?.tiktokUsername ? `TT @${user.tiktokUsername}` : ''}
                    </Text>
                  )}
                </View>
              </View>
            </ViewShot>
          </View>

          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleSaveToDevice}
              activeOpacity={0.7}
            >
              <Download size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.shareButton]}
              onPress={handleShare}
              activeOpacity={0.7}
            >
              <Share2 size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0, 0, 0, 0.55)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  closeButton: {
    position: 'absolute',
    top: -40,
    right: 0,
    padding: 8,
    zIndex: 10,
  },
  previewHint: {
    fontFamily: 'Orbitron_500Medium',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  previewBackdrop: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderStyle: 'dashed',
    padding: 0,
  },
  viewShotContainer: {
    width: CARD_WIDTH,
    backgroundColor: 'transparent',
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'stretch',
  },
  logo: {
    width: 140,
    height: 42,
    alignSelf: 'center',
    marginBottom: 28,
  },
  statsBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  statRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
    ...TEXT_SHADOW,
  },
  statValue: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 30,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    ...TEXT_SHADOW,
  },
  mapBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MAP_HEIGHT,
    marginBottom: 16,
  },
  noRouteText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    ...TEXT_SHADOW,
  },
  footer: {
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.3,
    textAlign: 'center',
    ...TEXT_SHADOW,
  },
  actionsContainer: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 16,
    width: CARD_WIDTH,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    gap: 8,
    flex: 1,
  },
  shareButton: {
    backgroundColor: '#00C853',
  },
  actionButtonText: {
    fontFamily: 'Orbitron_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
});
