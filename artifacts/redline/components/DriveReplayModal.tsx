import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import { X, Play, RotateCcw, Video as VideoIcon } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import { TripStats } from '@/types/trip';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';

interface DriveReplayModalProps {
  trip: TripStats | null;
  visible: boolean;
  onClose: () => void;
}

interface ReplayStat {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  isTime?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STAGE_W = Math.min(SCREEN_WIDTH - 40, 360);
const SVG_W = STAGE_W - 32;
const SVG_H = 280;
const SVG_PAD = 24;
const MAX_POINTS = 400;
const DRAW_DURATION_MS = 5200;

const LOGO_URL = 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/9ts3c4tgfcrqhgxwwrqfk';
const ACCENT = '#FF2D2D';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function speedColor(r: number): string {
  const c = clamp01(r);
  let cr: number, cg: number, cb: number;
  if (c < 0.5) {
    const t = c / 0.5;
    cr = lerp(0, 255, t);
    cg = lerp(230, 214, t);
    cb = lerp(118, 0, t);
  } else {
    const t = (c - 0.5) / 0.5;
    cr = 255;
    cg = lerp(214, 23, t);
    cb = lerp(0, 68, t);
  }
  return `rgb(${Math.round(cr)}, ${Math.round(cg)}, ${Math.round(cb)})`;
}

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out[out.length - 1] = arr[arr.length - 1];
  return out;
}

export default function DriveReplayModal({ trip, visible, onClose }: DriveReplayModalProps) {
  const { user } = useUser();
  const { convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel } = useSettings();

  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const routePoints = useMemo(() => {
    const locs = trip?.locations ?? [];
    if (locs.length < 2) return [] as { lat: number; lng: number; ratio: number }[];
    const sampled = downsample(locs, MAX_POINTS);
    const speeds = sampled.map((l) => (typeof l.speed === 'number' && l.speed > 0 ? l.speed : 0));
    const maxSpeed = Math.max(...speeds, 0.0001);
    return sampled.map((l, i) => ({
      lat: l.latitude,
      lng: l.longitude,
      ratio: clamp01(speeds[i] / maxSpeed),
    }));
  }, [trip]);

  const projected = useMemo(() => {
    if (routePoints.length < 2) return null;
    const lats = routePoints.map((p) => p.lat);
    const lngs = routePoints.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const drawW = SVG_W - SVG_PAD * 2;
    const drawH = SVG_H - SVG_PAD * 2;
    const latRange = maxLat - minLat || 0.0001;
    const lngRange = maxLng - minLng || 0.0001;
    const latLngAspect = latRange / lngRange;
    const drawAspect = drawH / drawW;
    let scaleX: number;
    let scaleY: number;
    let offX = SVG_PAD;
    let offY = SVG_PAD;
    if (latLngAspect > drawAspect) {
      scaleY = drawH / latRange;
      scaleX = scaleY;
      offX = SVG_PAD + (drawW - lngRange * scaleX) / 2;
    } else {
      scaleX = drawW / lngRange;
      scaleY = scaleX;
      offY = SVG_PAD + (drawH - latRange * scaleY) / 2;
    }
    const pts = routePoints.map((p) => ({
      x: offX + (p.lng - minLng) * scaleX,
      y: offY + (maxLat - p.lat) * scaleY,
      ratio: p.ratio,
    }));
    const cum: number[] = [0];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      total += Math.sqrt(dx * dx + dy * dy);
      cum.push(total);
    }
    return { pts, cum, total };
  }, [routePoints]);

  const stats = useMemo<ReplayStat[]>(() => {
    if (!trip) return [];
    const distRaw = convertDistance(trip.distance);
    const out: ReplayStat[] = [
      { label: 'Top Speed', value: Math.round(convertSpeed(trip.topSpeed)), decimals: 0, suffix: getSpeedLabel() },
      {
        label: 'Distance',
        value: distRaw,
        decimals: distRaw < 10 ? 2 : 1,
        suffix: getDistanceLabel() === 'mi' ? 'mi' : 'km',
      },
    ];
    if (typeof trip.time0to100 === 'number' && trip.time0to100 > 0) {
      out.push({ label: '0-100', value: trip.time0to100, decimals: 2, suffix: 's' });
    }
    out.push({ label: 'Duration', value: trip.duration, isTime: true });
    return out.slice(0, 4);
  }, [trip, convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel]);

  const subtitle = useMemo(() => {
    if (!trip) return undefined;
    const date = new Date(trip.startTime);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateStr = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    const loc = trip.location?.city && trip.location?.country
      ? `${trip.location.city}, ${trip.location.country}`
      : trip.location?.country ?? null;
    return loc ? `${dateStr} · ${loc}` : dateStr;
  }, [trip]);

  const handle = useMemo(() => {
    const ig = user?.instagramUsername ? `IG @${user.instagramUsername}` : '';
    const tt = user?.tiktokUsername ? `TT @${user.tiktokUsername}` : '';
    return [ig, tt].filter(Boolean).join(' · ') || undefined;
  }, [user]);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    stopLoop();
    setPlaying(true);
    startRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const p = clamp01(elapsed / DRAW_DURATION_MS);
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop]);

  useEffect(() => {
    if (visible && projected) {
      setProgress(0);
      play();
    }
    return () => stopLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, projected]);

  const handleClose = useCallback(() => {
    stopLoop();
    setPlaying(false);
    onClose();
  }, [stopLoop, onClose]);

  const routeProgress = easeInOut(progress);
  const counterProgress = easeOut(progress);

  const reveal = useMemo(() => {
    if (!projected) return null;
    const { pts, cum, total } = projected;
    const target = total * routeProgress;
    const segs: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
    let head = pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (cum[i - 1] >= target) break;
      const a = pts[i - 1];
      let b = pts[i];
      if (cum[i] > target) {
        const segLen = cum[i] - cum[i - 1] || 1;
        const t = (target - cum[i - 1]) / segLen;
        b = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), ratio: lerp(a.ratio, b.ratio, t) };
      }
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: speedColor((a.ratio + b.ratio) / 2) });
      head = b;
    }
    return { segs, head, start: pts[0] };
  }, [projected, routeProgress]);

  const formatStat = (stat: ReplayStat): string => {
    const v = stat.value * counterProgress;
    if (stat.isTime) {
      const tot = Math.round(v);
      return `${Math.floor(tot / 60)}:${(tot % 60).toString().padStart(2, '0')}`;
    }
    return v.toFixed(stat.decimals ?? 0);
  };

  const handleExport = useCallback(async () => {
    if (!trip || !projected) return;
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Video export is only available in the RedLine mobile app.');
      return;
    }
    setExporting(true);
    try {
      const base = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL ?? '').replace(/\/$/, '');
      if (!base) throw new Error('API URL is not configured.');
      const payload = {
        title: trip.carModel || 'RedLine Drive',
        subtitle,
        handle,
        watermark: false,
        stats: stats.map((s) => ({
          label: s.label,
          value: s.value,
          decimals: s.decimals,
          suffix: s.suffix,
          isTime: s.isTime,
        })),
        route: routePoints.map((p) => ({ lat: p.lat, lng: p.lng, speedRatio: p.ratio })),
      };
      const res = await fetch(`${base}/api/replay/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Render failed (${res.status}). ${txt.slice(0, 120)}`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0) throw new Error('Empty video returned from server.');
      const file = new File(Paths.cache, `redline-replay-${Date.now()}.mp4`);
      try {
        file.create();
      } catch {
        // ignore if it already exists
      }
      file.write(bytes);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'video/mp4',
          dialogTitle: 'Share your drive replay',
          UTI: 'public.mpeg-4',
        });
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(file.uri);
          Alert.alert('Saved', 'Your drive replay was saved to your gallery.');
        } else {
          Alert.alert('Permission Required', 'Grant media access to save your replay video.');
        }
      }
    } catch (err) {
      console.error('[REPLAY] export failed:', err);
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not create your video. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [trip, projected, subtitle, handle, stats, routePoints]);

  const hasRoute = !!projected;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose} activeOpacity={0.7}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.stage}>
            <View style={styles.headerRow}>
              <View style={styles.headerDot} />
              <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />
            </View>
            {trip?.carModel ? <Text style={styles.carModel}>{trip.carModel}</Text> : null}

            <View style={styles.mapWrap}>
              {hasRoute && reveal ? (
                <Svg width={SVG_W} height={SVG_H}>
                  {reveal.segs.map((s, i) => (
                    <Line
                      key={`glow-${i}`}
                      x1={s.x1}
                      y1={s.y1}
                      x2={s.x2}
                      y2={s.y2}
                      stroke={ACCENT}
                      strokeOpacity={0.18}
                      strokeWidth={14}
                      strokeLinecap="round"
                    />
                  ))}
                  {reveal.segs.map((s, i) => (
                    <Line
                      key={`seg-${i}`}
                      x1={s.x1}
                      y1={s.y1}
                      x2={s.x2}
                      y2={s.y2}
                      stroke={s.color}
                      strokeWidth={5}
                      strokeLinecap="round"
                    />
                  ))}
                  <Circle cx={reveal.start.x} cy={reveal.start.y} r={5} fill="#FFFFFF" />
                  <Circle cx={reveal.head.x} cy={reveal.head.y} r={13} fill={ACCENT} fillOpacity={0.35} />
                  <Circle cx={reveal.head.x} cy={reveal.head.y} r={7} fill={ACCENT} />
                  <Circle cx={reveal.head.x} cy={reveal.head.y} r={3} fill="#FFFFFF" />
                </Svg>
              ) : (
                <Text style={styles.noRoute}>No route data for this drive</Text>
              )}
            </View>

            <View style={styles.statsGrid}>
              {stats.map((s, i) => {
                const isLoneLast = stats.length % 2 === 1 && i === stats.length - 1;
                return (
                  <View key={i} style={[styles.statCell, isLoneLast && styles.statCellFull]}>
                    <Text style={styles.statLabel}>{s.label.toUpperCase()}</Text>
                    <Text style={styles.statValue}>
                      {formatStat(s)}
                      {s.suffix ? <Text style={styles.statSuffix}> {s.suffix}</Text> : null}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.footer}>
              {subtitle ? <Text style={styles.footerText}>{subtitle}</Text> : null}
              {handle ? <Text style={styles.footerText}>{handle}</Text> : null}
            </View>
          </View>

          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={play}
              disabled={!hasRoute || playing}
              activeOpacity={0.7}
            >
              {progress >= 1 ? <RotateCcw size={20} color="#FFFFFF" /> : <Play size={20} color="#FFFFFF" />}
              <Text style={styles.controlText}>{progress >= 1 ? 'Replay' : 'Play'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.exportButton, (!hasRoute || exporting) && styles.disabledButton]}
              onPress={handleExport}
              disabled={!hasRoute || exporting}
              activeOpacity={0.85}
            >
              {exporting ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.controlText}>Rendering…</Text>
                </>
              ) : (
                <>
                  <VideoIcon size={20} color="#FFFFFF" />
                  <Text style={styles.controlText}>Export Video</Text>
                </>
              )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  stage: {
    width: STAGE_W,
    backgroundColor: '#0A0A0A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 45, 45, 0.18)',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'stretch',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
  },
  logo: {
    width: 130,
    height: 34,
  },
  carModel: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 0.5,
  },
  mapWrap: {
    height: SVG_H,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  noRoute: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  statCell: {
    width: '50%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  statCellFull: {
    width: '100%',
  },
  statLabel: {
    fontFamily: 'Orbitron_500Medium',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.55)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'Orbitron_700Bold',
    fontSize: 26,
    color: '#FFFFFF',
  },
  statSuffix: {
    fontFamily: 'Orbitron_600SemiBold',
    fontSize: 13,
    color: ACCENT,
  },
  footer: {
    alignItems: 'center',
    gap: 3,
    marginTop: 8,
  },
  footerText: {
    fontFamily: 'Orbitron_400Regular',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    marginTop: 22,
    gap: 12,
    width: STAGE_W,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    flex: 1,
  },
  exportButton: {
    backgroundColor: ACCENT,
  },
  disabledButton: {
    opacity: 0.5,
  },
  controlText: {
    fontFamily: 'Orbitron_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
});
