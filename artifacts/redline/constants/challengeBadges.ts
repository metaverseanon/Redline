import { ImageSourcePropType } from 'react-native';

// Winner badge artwork by finishing place (1st / 2nd / 3rd).
export const CHALLENGE_BADGES: Record<number, ImageSourcePropType> = {
  1: require('../assets/images/badges/place-1.png'),
  2: require('../assets/images/badges/place-2.png'),
  3: require('../assets/images/badges/place-3.png'),
};

export function getChallengeBadge(place: number): ImageSourcePropType | null {
  return CHALLENGE_BADGES[place] ?? null;
}
