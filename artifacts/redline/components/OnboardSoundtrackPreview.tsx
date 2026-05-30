import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Play, Pause, Music } from 'lucide-react-native';

const BAR_COUNT = 28;
const BAR_MIN = 0.18;

function makeBars(): Animated.Value[] {
  return Array.from({ length: BAR_COUNT }, () => new Animated.Value(BAR_MIN));
}

export default function OnboardSoundtrackPreview() {
  const bars = useRef(makeBars()).current;
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);
  const progress = useRef(new Animated.Value(0)).current;
  const progressLoop = useRef<Animated.CompositeAnimation | null>(null);
  const [playing, setPlaying] = useState(false);

  const stopAll = () => {
    loopsRef.current.forEach((l) => l.stop());
    loopsRef.current = [];
    progressLoop.current?.stop();
    progressLoop.current = null;
    bars.forEach((b) => {
      Animated.timing(b, {
        toValue: BAR_MIN,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    progress.setValue(0);
  };

  const startAll = () => {
    loopsRef.current = bars.map((bar, i) => {
      const phase = (i / BAR_COUNT) * Math.PI * 2;
      const peak = 0.55 + 0.45 * Math.abs(Math.sin(phase * 2.3 + 1));
      const up = 260 + ((i * 53) % 220);
      const down = 220 + ((i * 37) % 200);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: peak,
            duration: up,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: BAR_MIN + 0.12,
            duration: down,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return loop;
    });

    progress.setValue(0);
    progressLoop.current = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    progressLoop.current.start();
  };

  const toggle = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setPlaying((prev) => {
      const next = !prev;
      if (next) startAll();
      else stopAll();
      return next;
    });
  };

  useEffect(() => {
    return () => {
      loopsRef.current.forEach((l) => l.stop());
      progressLoop.current?.stop();
    };
  }, []);

  const progressWidth = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
      }),
    [progress]
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.artwork}>
            <Music size={22} color="#CC0000" />
          </View>
          <View style={styles.info}>
            <Text style={styles.trackName} numberOfLines={1}>
              Night Shift
            </Text>
            <Text style={styles.artistName} numberOfLines={1}>
              Redline Radio
            </Text>
          </View>
          <TouchableOpacity
            onPress={toggle}
            style={styles.playButton}
            activeOpacity={0.85}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="onboarding-soundtrack-toggle"
          >
            {playing ? (
              <Pause size={18} color="#FFFFFF" fill="#FFFFFF" />
            ) : (
              <Play size={18} color="#FFFFFF" fill="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.waveform}>
          {bars.map((bar, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  transform: [{ scaleY: bar }],
                  opacity: bar.interpolate({
                    inputRange: [BAR_MIN, 1],
                    outputRange: [0.35, 1],
                  }),
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </View>

      <Text style={styles.hint}>
        {playing ? 'Scoring your drive…' : 'Tap play to preview'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 28,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(204, 0, 0, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(204, 0, 0, 0.28)',
    borderRadius: 18,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(204, 0, 0, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(204, 0, 0, 0.3)',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  trackName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  artistName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8E8E93',
    letterSpacing: 0.2,
  },
  playButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#CC0000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#CC0000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    marginTop: 18,
    marginBottom: 12,
  },
  bar: {
    flex: 1,
    marginHorizontal: 1.5,
    height: 44,
    borderRadius: 2,
    backgroundColor: '#CC0000',
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#CC0000',
  },
  hint: {
    marginTop: 14,
    fontSize: 13,
    color: '#CC0000',
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
