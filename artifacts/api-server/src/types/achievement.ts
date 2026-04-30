export type AchievementCategory = 'speed' | 'distance' | 'trips' | 'streak' | 'social' | 'performance';

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  threshold: number;
  unit?: string;
}

export interface UserAchievement {
  achievementId: string;
  unlockedAt: number;
  progress: number;
}

export interface AchievementProgress {
  definition: AchievementDefinition;
  progress: number;
  isUnlocked: boolean;
  unlockedAt?: number;
}
