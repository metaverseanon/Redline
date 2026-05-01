import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Crown } from 'lucide-react-native';

type ProBadgeSize = 'sm' | 'md' | 'lg';

interface ProBadgeProps {
  size?: ProBadgeSize;
  iconOnly?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const SIZE_MAP: Record<ProBadgeSize, { padH: number; padV: number; font: number; icon: number; gap: number; radius: number }> = {
  sm: { padH: 5, padV: 1, font: 9, icon: 9, gap: 3, radius: 4 },
  md: { padH: 7, padV: 2, font: 10, icon: 11, gap: 4, radius: 5 },
  lg: { padH: 9, padV: 3, font: 12, icon: 13, gap: 5, radius: 6 },
};

export default function ProBadge({ size = 'sm', iconOnly = false, style, textStyle }: ProBadgeProps) {
  const dims = SIZE_MAP[size];

  return (
    <View
      style={[
        styles.badge,
        {
          paddingHorizontal: iconOnly ? dims.padV : dims.padH,
          paddingVertical: dims.padV,
          gap: dims.gap,
          borderRadius: dims.radius,
        },
        style,
      ]}
    >
      <Crown size={dims.icon} color="#0A0A0B" fill="#0A0A0B" />
      {!iconOnly && (
        <Text style={[styles.text, { fontSize: dims.font }, textStyle]}>PRO</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD700',
    alignSelf: 'flex-start',
  },
  text: {
    color: '#0A0A0B',
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
});
