import React from 'react';
import { Crown } from 'lucide-react-native';

type ProBadgeSize = 'sm' | 'md' | 'lg';

interface ProBadgeProps {
  size?: ProBadgeSize;
}

const ICON_SIZE: Record<ProBadgeSize, number> = {
  sm: 14,
  md: 18,
  lg: 22,
};

export default function ProBadge({ size = 'sm' }: ProBadgeProps) {
  return <Crown size={ICON_SIZE[size]} color="#FFD700" fill="#FFD700" />;
}
