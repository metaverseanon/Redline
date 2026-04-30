import React, { useMemo, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  Platform,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { X, Download, Share2 } from 'lucide-react-native';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { TripStats } from '@/types/trip';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';

interface WeeklyRecapCardProps {
  visible: boolean;
  onClose: () => void;
  trips: TripStats[];
  weekStart: number;
  weekEnd: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 360);

export default function WeeklyRecapCard({ visible, onClose, trips, weekStart, weekEnd }: WeeklyRecapCardProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const { user } = useUser();
  const { convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel, settings } = useSettings();
  const isLight = settings.theme === 'light';

  const stats = useMemo(() => {
    const weekTrips = trips.filter(t => t.startTime >= weekStart && t.startTime <= weekEnd);
    const totalDistance = weekTrips.reduce((s, t) => s + t.distance, 0);
    const totalDuration = weekTrips.reduce((s, t) => s + t.duration, 0);
    const topSpeed = weekTrips.length > 0 ? Math.max(...weekTrips.map(t => t.topSpeed)) : 0;
    const corners = weekTrips.reduce((s, t) => s + t.corners, 0);
    const maxG = weekTrips.length > 0 ? Math.max(...weekTrips.map(t => t.maxGForce ?? 0)) : 0;
    const avgSpeed = totalDuration > 0 ? (totalDistance / totalDuration) * 3600 : 0;
    const best0to100 = weekTrips
      .map(t => t.time0to100)
      .filter((x): x is number => !!x && x > 0);
    const best100 = best0to100.length > 0 ? Math.min(...best0to100) : null;

    const hours = weekTrips.map(t => new Date(t.startTime).getHours());
    const nightTrips = hours.filter(h => h >= 20 || h < 6).length;
    const dayTrips = weekTrips.length - nightTrips;

    return {
      tripCount: weekTrips.length,
      totalDistance,
      totalDuration,
      topSpeed,
      corners,
      maxG,
      avgSpeed,
      best100,
      dayTrips,
      nightTrips,
    };
  }, [trips, weekStart, weekEnd]);

  const formatHours = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const weekLabel = useMemo(() => {
    const s = new Date(weekStart);
    const e = new Date(weekEnd);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}`;
  }, [weekStart, weekEnd]);

  const driverType = stats.nightTrips > stats.dayTrips
    ? 'Night Owl'
    : stats.dayTrips > stats.nightTrips
    ? 'Day Cruiser'
    : 'All-Rounder';

  const handleSave = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Not Available', 'Saving to device is not available on web.');
        return;
      }
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant media library permission.');
        return;
      }
      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Success', 'Weekly recap saved to your gallery!');
      }
    } catch (e) {
      console.error('[WEEKLY_RECAP] Save failed:', e);
      Alert.alert('Error', 'Failed to save. Please try again.');
    }
  }, []);

  const handleShare = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Not Available', 'Sharing is not available on web.');
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Not Available', 'Sharing is not available on this device.');
        return;
      }
      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your weekly recap' });
      }
    } catch (e) {
      console.error('[WEEKLY_RECAP] Share failed:', e);
      Alert.alert('Error', 'Failed to share. Please try again.');
    }
  }, []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={styles.viewShot}>
            <View style={[styles.card, isLight && styles.cardLight]}>
              <Image
                source={{
                  uri: isLight
                    ? 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/qrv9h3jhh7ukh7woc2r68'
                    : 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/9ts3c4tgfcrqhgxwwrqfk',
                }}
                style={styles.logo}
                resizeMode="contain"
              />

              <Text style={[styles.weekLabel, isLight && styles.textSecondaryLight]}>
                WEEK OF {weekLabel.toUpperCase()}
              </Text>
              <Text style={[styles.title, isLight && styles.titleLight]}>Weekly Recap</Text>

              <View style={[styles.highlight, isLight && styles.highlightLight]}>
                <Text style={[styles.highlightLabel, isLight && styles.textSecondaryLight]}>TRIPS THIS WEEK</Text>
                <Text style={[styles.highlightValue, isLight && styles.titleLight]}>{stats.tripCount}</Text>
                <Text style={[styles.highlightSub, isLight && styles.textSecondaryLight]}>{driverType}</Text>
              </View>

              <View style={styles.grid}>
                <View style={styles.gridItem}>
                  <Text style={[styles.gridValue, isLight && styles.titleLight]}>
                    {convertDistance(stats.totalDistance).toFixed(1)}
                  </Text>
                  <Text style={[styles.gridLabel, isLight && styles.textSecondaryLight]}>
                    {getDistanceLabel().toUpperCase()} DRIVEN
                  </Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={[styles.gridValue, isLight && styles.titleLight]}>
                    {Math.round(convertSpeed(stats.topSpeed))}
                  </Text>
                  <Text style={[styles.gridLabel, isLight && styles.textSecondaryLight]}>
                    TOP {getSpeedLabel().toUpperCase()}
                  </Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={[styles.gridValue, isLight && styles.titleLight]}>{formatHours(stats.totalDuration)}</Text>
                  <Text style={[styles.gridLabel, isLight && styles.textSecondaryLight]}>TIME ON ROAD</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={[styles.gridValue, isLight && styles.titleLight]}>{stats.corners}</Text>
                  <Text style={[styles.gridLabel, isLight && styles.textSecondaryLight]}>CORNERS</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={[styles.gridValue, isLight && styles.titleLight]}>
                    {stats.maxG > 0 ? stats.maxG.toFixed(2) : '—'}
                  </Text>
                  <Text style={[styles.gridLabel, isLight && styles.textSecondaryLight]}>MAX G-FORCE</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={[styles.gridValue, isLight && styles.titleLight]}>
                    {stats.best100 !== null ? `${stats.best100.toFixed(1)}s` : '—'}
                  </Text>
                  <Text style={[styles.gridLabel, isLight && styles.textSecondaryLight]}>BEST 0-100</Text>
                </View>
              </View>

              {(user?.instagramUsername || user?.tiktokUsername) && (
                <View style={styles.handles}>
                  {user?.instagramUsername && (
                    <Text style={[styles.handleText, isLight && styles.textSecondaryLight]}>
                      IG @{user.instagramUsername}
                    </Text>
                  )}
                  {user?.instagramUsername && user?.tiktokUsername && (
                    <Text style={[styles.handleText, isLight && styles.textSecondaryLight]}> · </Text>
                  )}
                  {user?.tiktokUsername && (
                    <Text style={[styles.handleText, isLight && styles.textSecondaryLight]}>
                      TT @{user.tiktokUsername}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </ViewShot>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleSave} activeOpacity={0.7}>
              <Download size={20} color="#FFFFFF" />
              <Text style={styles.actionText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={handleShare} activeOpacity={0.7}>
              <Share2 size={20} color="#FFFFFF" />
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  closeBtn: {
    position: 'absolute',
    top: -40,
    right: 0,
    padding: 8,
    zIndex: 10,
  },
  viewShot: {
    borderRadius: 20,
    overflow: 'hidden',
    width: CARD_WIDTH,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#0A0A0A',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  logo: {
    width: 160,
    height: 48,
    alignSelf: 'center',
    marginBottom: 14,
  },
  weekLabel: {
    fontFamily: 'Orbitron_500Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 24,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  titleLight: {
    color: '#1A1A1A',
  },
  textSecondaryLight: {
    color: 'rgba(0,0,0,0.55)',
  },
  highlight: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  highlightLight: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderColor: 'rgba(0,0,0,0.1)',
  },
  highlightLabel: {
    fontFamily: 'Orbitron_500Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 6,
  },
  highlightValue: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 56,
    color: '#FFFFFF',
    lineHeight: 62,
  },
  highlightSub: {
    fontFamily: 'Orbitron_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  gridValue: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  gridLabel: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  handles: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  handleText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 16,
  },
  actionBtn: {
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
  shareBtn: {
    backgroundColor: '#00C853',
  },
  actionText: {
    fontFamily: 'Orbitron_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
});
