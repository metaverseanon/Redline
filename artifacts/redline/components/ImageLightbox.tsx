import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Text,
  Platform,
  ListRenderItemInfo,
} from 'react-native';
import { X } from 'lucide-react-native';

interface ImageLightboxProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export default function ImageLightbox({ visible, images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [dims, setDims] = useState(() => Dimensions.get('window'));
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  const onViewRef = useRef(({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  });
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const getItemLayout = useCallback(
    (_: ArrayLike<string> | null | undefined, index: number) => ({
      length: dims.width,
      offset: dims.width * index,
      index,
    }),
    [dims.width],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<string>) => (
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={[styles.slide, { width: dims.width, height: dims.height }]}
      >
        <Image
          source={{ uri: item }}
          style={{ width: dims.width, height: dims.height }}
          resizeMode="contain"
        />
      </TouchableOpacity>
    ),
    [dims.width, dims.height, onClose],
  );

  if (!visible || images.length === 0) return null;

  const safeInitial = Math.min(Math.max(initialIndex, 0), images.length - 1);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar hidden={Platform.OS !== 'web'} />
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(item, idx) => `${idx}_${item}`}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={safeInitial}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewRef.current}
          viewabilityConfig={viewConfigRef.current}
        />

        <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <X size={26} color="#fff" />
        </TouchableOpacity>

        {images.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {currentIndex + 1} / {images.length}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.97)',
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 28,
    right: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 52 : 32,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  counterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
