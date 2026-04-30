import { DailyMission } from '@/types/mission';

export const DAILY_MISSIONS: DailyMission[] = [
  {
    id: 'any_drive',
    icon: '🚗',
    title: 'Hit the Road',
    description: 'Record any drive today',
    metric: 'anyDrive',
    target: 1,
    reward: 10,
  },
  {
    id: 'speed_100',
    icon: '💨',
    title: 'Century Club',
    description: 'Hit 100 km/h in a single drive',
    metric: 'topSpeedKmh',
    target: 100,
    reward: 15,
  },
  {
    id: 'speed_140',
    icon: '⚡',
    title: 'Flying Low',
    description: 'Hit 140 km/h in a single drive',
    metric: 'topSpeedKmh',
    target: 140,
    reward: 20,
  },
  {
    id: 'distance_10',
    icon: '🛣️',
    title: 'Short Cruise',
    description: 'Drive at least 10 km today',
    metric: 'distanceKm',
    target: 10,
    reward: 15,
  },
  {
    id: 'distance_30',
    icon: '🗺️',
    title: 'Road Trip',
    description: 'Cover 30 km in a single drive',
    metric: 'distanceKm',
    target: 30,
    reward: 25,
  },
  {
    id: 'duration_20',
    icon: '⏱️',
    title: 'Take Your Time',
    description: 'Drive for at least 20 minutes',
    metric: 'durationSec',
    target: 20 * 60,
    reward: 15,
  },
  {
    id: 'corners_20',
    icon: '🌀',
    title: 'Twisty Business',
    description: 'Take 20 corners in a single drive',
    metric: 'corners',
    target: 20,
    reward: 20,
  },
  {
    id: 'gforce_08',
    icon: '🎯',
    title: 'Feel the Pull',
    description: 'Pull 0.8G in a single drive',
    metric: 'maxGForce',
    target: 0.8,
    reward: 20,
  },
  {
    id: 'accel_9',
    icon: '🚀',
    title: 'Quick Launch',
    description: 'Hit 0-100 km/h in under 9s',
    metric: 'accel0to100',
    target: 9,
    reward: 25,
  },
  {
    id: 'night_drive',
    icon: '🌙',
    title: 'Night Owl',
    description: 'Record a drive between 9 PM and 5 AM',
    metric: 'nightDrive',
    target: 1,
    reward: 20,
  },
];

export function getMissionForDate(date: Date): DailyMission {
  const dayKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dayKey.length; i++) {
    hash = (hash * 31 + dayKey.charCodeAt(i)) >>> 0;
  }
  const index = hash % DAILY_MISSIONS.length;
  return DAILY_MISSIONS[index];
}
