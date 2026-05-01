import { TripStats, Location } from '@/types/trip';

export interface ProMetrics {
  smoothness: number;
  aggression: number;
  drivingStyle: DrivingStyle;
  bestSectorSpeed: number | null;
  bestSectorIndex: 1 | 2 | 3 | null;
}

export type DrivingStyle =
  | 'Smooth Cruiser'
  | 'Spirited'
  | 'Apex Hunter'
  | 'Track Animal'
  | 'Sunday Driver';

const KMH_PER_MS = 3.6;

function speedDeltas(locations: Location[]): number[] {
  const deltas: number[] = [];
  for (let i = 1; i < locations.length; i++) {
    const a = locations[i - 1];
    const b = locations[i];
    const sa = a.speed != null ? a.speed * KMH_PER_MS : 0;
    const sb = b.speed != null ? b.speed * KMH_PER_MS : 0;
    const dt = Math.max((b.timestamp - a.timestamp) / 1000, 0.1);
    deltas.push((sb - sa) / dt);
  }
  return deltas;
}

export function computeSmoothness(trip: TripStats): number {
  const locs = trip.locations || [];
  if (locs.length < 4) return 75;
  const deltas = speedDeltas(locs);
  if (deltas.length === 0) return 75;
  const mean = deltas.reduce((s, v) => s + v, 0) / deltas.length;
  const variance = deltas.reduce((s, v) => s + (v - mean) ** 2, 0) / deltas.length;
  const stdDev = Math.sqrt(variance);
  const score = Math.max(0, Math.min(100, 100 - stdDev * 18));
  return Math.round(score);
}

export function computeAggression(trip: TripStats): number {
  const topSpeedScore = Math.min(50, ((trip.topSpeed || 0) / 280) * 50);
  const gForceScore = Math.min(30, ((trip.maxGForce || 0) / 1.5) * 30);
  const accelBonus = trip.time0to100 != null && trip.time0to100 > 0
    ? Math.min(20, Math.max(0, (10 - trip.time0to100) * 2.5))
    : 0;
  return Math.round(Math.min(100, topSpeedScore + gForceScore + accelBonus));
}

export function getDrivingStyle(trip: TripStats): DrivingStyle {
  const smoothness = computeSmoothness(trip);
  const aggression = computeAggression(trip);

  if (aggression >= 75 && smoothness < 55) return 'Track Animal';
  if (aggression >= 60 && smoothness >= 55) return 'Apex Hunter';
  if (aggression >= 40) return 'Spirited';
  if (smoothness >= 75) return 'Smooth Cruiser';
  return 'Sunday Driver';
}

export function computeBestSector(trip: TripStats): { speed: number | null; sector: 1 | 2 | 3 | null } {
  const locs = trip.locations || [];
  if (locs.length < 6) return { speed: null, sector: null };

  const third = Math.floor(locs.length / 3);
  const sectors = [
    locs.slice(0, third),
    locs.slice(third, third * 2),
    locs.slice(third * 2),
  ] as const;

  let best = -1;
  let bestIdx: 1 | 2 | 3 = 1;
  sectors.forEach((sector, i) => {
    const speeds = sector.map((l) => (l.speed != null ? l.speed * KMH_PER_MS : 0));
    if (speeds.length === 0) return;
    const avg = speeds.reduce((s, v) => s + v, 0) / speeds.length;
    if (avg > best) {
      best = avg;
      bestIdx = (i + 1) as 1 | 2 | 3;
    }
  });

  return { speed: best > 0 ? Math.round(best) : null, sector: best > 0 ? bestIdx : null };
}

export function computeProMetrics(trip: TripStats): ProMetrics {
  const sector = computeBestSector(trip);
  return {
    smoothness: computeSmoothness(trip),
    aggression: computeAggression(trip),
    drivingStyle: getDrivingStyle(trip),
    bestSectorSpeed: sector.speed,
    bestSectorIndex: sector.sector,
  };
}
