import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Play, Pause, X, Music } from 'lucide-react-native';
import { useSettings } from '@/providers/SettingsProvider';
import { ThemeColors } from '@/constants/colors';
import { Soundtrack } from '@/types/trip';
import { usePreviewPlayback, stopPreview } from '@/lib/soundtrackPlayer';

interface SoundtrackBadgeProps {
  soundtrack: Soundtrack;
  onRemove?: () => void;
}

export default function SoundtrackBadge({ soundtrack, onRemove }: SoundtrackBadgeProps) {
  const { colors } = useSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isPlaying, toggle } = usePreviewPlayback(soundtrack.previewUrl);
  const canPlay = Platform.OS !== 'web';

  return (
    <View style={styles.container} testID="soundtrack-badge">
      <View style={styles.artworkWrap}>
        {soundtrack.artworkUrl ? (
          <ExpoImage
            source={{ uri: soundtrack.artworkUrl }}
            style={styles.artwork}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Music size={18} color={colors.accent} />
          </View>
        )}
        {canPlay && (
          <TouchableOpacity
            style={styles.playOverlay}
            onPress={toggle}
            activeOpacity={0.8}
            testID="soundtrack-play-button"
          >
            {isPlaying ? (
              <Pause size={16} color="#FFFFFF" fill="#FFFFFF" />
            ) : (
              <Play size={16} color="#FFFFFF" fill="#FFFFFF" />
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Music size={11} color={colors.accent} />
          <Text style={styles.title} numberOfLines={1}>{soundtrack.trackName}</Text>
        </View>
        <Text style={styles.artist} numberOfLines={1}>{soundtrack.artistName}</Text>
        <Text style={styles.hint} numberOfLines={1}>
          {canPlay ? (isPlaying ? 'Playing preview…' : 'Tap to preview') : '30s preview on mobile'}
        </Text>
      </View>

      {onRemove && (
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => {
            stopPreview();
            onRemove();
          }}
          activeOpacity={0.7}
          testID="soundtrack-remove-button"
        >
          <X size={16} color={colors.textLight} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.accent + '10',
      borderWidth: 1,
      borderColor: colors.accent + '30',
      borderRadius: 14,
      padding: 10,
    },
    artworkWrap: {
      width: 52,
      height: 52,
      borderRadius: 10,
      overflow: 'hidden',
      position: 'relative',
    },
    artwork: {
      width: 52,
      height: 52,
      borderRadius: 10,
    },
    artworkFallback: {
      backgroundColor: colors.cardLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    playOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    info: {
      flex: 1,
      gap: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    title: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
    },
    artist: {
      fontSize: 12,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
    },
    hint: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.accent,
    },
    removeButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.cardLight,
    },
  });
