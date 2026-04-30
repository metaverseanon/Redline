export interface BadgeTier {
  id: string;
  name: string;
  threshold: number;
  color: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
  icon: string;
}

export const BADGE_TIERS: BadgeTier[] = [
  {
    id: 'bronze',
    name: 'Bronze',
    threshold: 0.25,
    color: '#CD7F32',
    bgColor: '#CD7F3220',
    borderColor: '#CD7F3250',
    glowColor: '#CD7F3240',
    icon: 'shield',
  },
  {
    id: 'silver',
    name: 'Silver',
    threshold: 0.50,
    color: '#A8A9AD',
    bgColor: '#A8A9AD20',
    borderColor: '#A8A9AD50',
    glowColor: '#A8A9AD40',
    icon: 'shield',
  },
  {
    id: 'gold',
    name: 'Gold',
    threshold: 0.75,
    color: '#FFD700',
    bgColor: '#FFD70020',
    borderColor: '#FFD70050',
    glowColor: '#FFD70040',
    icon: 'shield',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    threshold: 1.0,
    color: '#00CFFF',
    bgColor: '#00CFFF20',
    borderColor: '#00CFFF50',
    glowColor: '#00CFFF40',
    icon: 'shield',
  },
];

export function getEarnedBadges(unlockedCount: number, totalCount: number): BadgeTier[] {
  if (totalCount === 0) return [];
  const ratio = unlockedCount / totalCount;
  return BADGE_TIERS.filter(b => ratio >= b.threshold);
}

export function getHighestBadge(unlockedCount: number, totalCount: number): BadgeTier | null {
  const earned = getEarnedBadges(unlockedCount, totalCount);
  return earned.length > 0 ? earned[earned.length - 1] : null;
}

export function getNextBadge(unlockedCount: number, totalCount: number): BadgeTier | null {
  if (totalCount === 0) return null;
  const ratio = unlockedCount / totalCount;
  return BADGE_TIERS.find(b => ratio < b.threshold) ?? null;
}
