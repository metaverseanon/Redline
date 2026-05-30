import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, Play, Pause, Music, AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/providers/SettingsProvider';
import { trpc } from '@/lib/trpc';
import { ThemeColors } from '@/constants/colors';
import { Soundtrack } from '@/types/trip';
import { usePreviewPlayback, stopPreview } from '@/lib/soundtrackPlayer';

interface TrackPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (track: Soundtrack) => void;
}

function TrackRow({ track, onSelect, colors }: { track: Soundtrack; onSelect: (t: Soundtrack) => void; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isPlaying, toggle } = usePreviewPlayback(track.previewUrl);
  const canPlay = Platform.OS !== 'web';

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => onSelect(track)}
      testID={`track-row-${track.trackId}`}
    >
      <View style={styles.artworkWrap}>
        {track.artworkUrl ? (
          <ExpoImage source={{ uri: track.artworkUrl }} style={styles.artwork} contentFit="cover" cachePolicy="memory-disk" transition={150} />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Music size={18} color={colors.accent} />
          </View>
        )}
        {canPlay && (
          <TouchableOpacity
            style={styles.playOverlay}
            onPress={(e) => {
              e.stopPropagation?.();
              toggle();
            }}
            activeOpacity={0.8}
            testID={`track-play-${track.trackId}`}
          >
            {isPlaying ? (
              <Pause size={15} color="#FFFFFF" fill="#FFFFFF" />
            ) : (
              <Play size={15} color="#FFFFFF" fill="#FFFFFF" />
            )}
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>{track.trackName}</Text>
        <Text style={styles.rowArtist} numberOfLines={1}>{track.artistName}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TrackPickerModal({ visible, onClose, onSelect }: TrackPickerModalProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setDebounced('');
      stopPreview();
    }
  }, [visible]);

  const searchQuery = trpc.music.searchTracks.useQuery(
    { query: debounced, limit: 20 },
    { enabled: visible && debounced.length >= 2, retry: 1 }
  );

  const handleSelect = useCallback((track: Soundtrack) => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopPreview();
    onSelect(track);
    onClose();
  }, [onSelect, onClose]);

  const handleClose = useCallback(() => {
    stopPreview();
    onClose();
  }, [onClose]);

  const tracks = searchQuery.data?.tracks ?? [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Music size={18} color={colors.accent} />
              <Text style={styles.headerTitle}>Add a Soundtrack</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton} activeOpacity={0.7} testID="track-picker-close">
              <X size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBar}>
            <Search size={18} color={colors.textLight} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search songs or artists..."
              placeholderTextColor={colors.textLight}
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
              testID="track-search-input"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
                <X size={16} color={colors.textLight} />
              </TouchableOpacity>
            )}
          </View>

          {debounced.length < 2 ? (
            <View style={styles.stateContainer}>
              <Music size={40} color={colors.textLight} />
              <Text style={styles.stateText}>Search for a track to attach</Text>
            </View>
          ) : searchQuery.isLoading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.stateText}>Searching...</Text>
            </View>
          ) : searchQuery.isError ? (
            <View style={styles.stateContainer}>
              <AlertCircle size={40} color={colors.danger ?? '#ef4444'} />
              <Text style={styles.stateText}>Couldn&apos;t load songs</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => void searchQuery.refetch()} activeOpacity={0.7}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : tracks.length === 0 ? (
            <View style={styles.stateContainer}>
              <Music size={40} color={colors.textLight} />
              <Text style={styles.stateText}>No songs found</Text>
            </View>
          ) : (
            <FlatList
              data={tracks}
              keyExtractor={(item) => String(item.trackId)}
              renderItem={({ item }) => <TrackRow track={item} onSelect={handleSelect} colors={colors} />}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 16,
      maxHeight: '85%',
      minHeight: '60%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
    },
    closeButton: {
      padding: 4,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardLight,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 12 : 6,
      marginBottom: 14,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'Orbitron_400Regular',
      color: colors.text,
      padding: 0,
    },
    stateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 40,
    },
    stateText: {
      fontSize: 14,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      textAlign: 'center',
    },
    retryButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
    },
    retryButtonText: {
      fontSize: 13,
      fontFamily: 'Orbitron_600SemiBold',
      color: '#FFFFFF',
    },
    listContent: {
      paddingBottom: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    artworkWrap: {
      width: 50,
      height: 50,
      borderRadius: 10,
      overflow: 'hidden',
      position: 'relative',
    },
    artwork: {
      width: 50,
      height: 50,
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
    rowInfo: {
      flex: 1,
      gap: 3,
    },
    rowTitle: {
      fontSize: 14,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
    },
    rowArtist: {
      fontSize: 12,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
    },
  });
