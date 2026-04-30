export type MissionMetric =
  | 'topSpeedKmh'
  | 'distanceKm'
  | 'durationSec'
  | 'corners'
  | 'maxGForce'
  | 'accel0to100'
  | 'anyDrive'
  | 'nightDrive';

export interface DailyMission {
  id: string;
  icon: string;
  title: string;
  description: string;
  metric: MissionMetric;
  target: number;
  reward: number;
}

export interface DailyMissionState {
  date: string;
  missionId: string;
  completed: boolean;
  completedAt?: number;
  progress: number;
}
