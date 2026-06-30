import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Crown, MapPin, ChevronRight, Hexagon } from 'lucide-react-native';
import { trpc } from '@/lib/trpc';
import { useSettings } from '@/providers/SettingsProvider';
import { ThemeColors } from '@/constants/colors';
import ProBadge from '@/components/ProBadge';
import TerritoryModal from '@/components/TerritoryModal';

type PaywallResult = 'purchased' | 'restored' | 'cancelled' | 'error' | 'not_presented';

interface TerritoryCardProps {
  userId: string;
  isSubscribed: boolean;
  presentPaywall: (source?: string) => void | Promise<PaywallResult> | Promise<void>;
  getLastPaywallError?: () => string | null;
}

export default function TerritoryCard({
  userId,
  isSubscribed,
  presentPaywall,
  getLastPaywallError,
}: TerritoryCardProps) {
  const { colors } = useSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showModal, setShowModal] = useState(false);

  const myQuery = trpc.territory.getMyTerritory.useQuery(
    { userId },
    { enabled: !!userId },
  );

  const data = myQuery.data;
  const totalOwned = data?.totalOwned ?? 0;
  const cap = data?.cap ?? 50;
  const topRegion = data?.topRegion ?? null;
  const isPro = data?.isPro ?? isSubscribed;
  const capReached = !isPro && totalOwned >= cap;

  let kingLine: string;
  if (topRegion?.isKing) {
    kingLine = '👑 You rule this area';
  } else if (topRegion?.king) {
    kingLine = `King: ${topRegion.king.name} · ${topRegion.king.count} cells`;
  } else if (topRegion?.iLead) {
    kingLine = 'You lead — go Pro to claim King';
  } else {
    kingLine = 'No King yet — claim this area';
  }

  if (!userId) return null;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={() => setShowModal(true)}
        activeOpacity={0.8}
        testID="territory-card-open"
      >
        <View style={styles.iconBubble}>
          <Hexagon size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Territory</Text>
            {!isPro && <ProBadge />}
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            {myQuery.isLoading ? 'Loading…' : `${totalOwned} cells claimed`}
            {!isPro ? ` · ${Math.max(0, cap - totalOwned)} of ${cap} left` : ''}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textLight} />
      </TouchableOpacity>

      {myQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
      ) : (
        <View style={styles.bodyRow}>
          <Crown size={14} color={topRegion?.isKing ? colors.accent : colors.textLight} />
          <Text style={styles.kingText} numberOfLines={1}>{kingLine}</Text>
        </View>
      )}

      {capReached && (
        <TouchableOpacity
          style={styles.upsell}
          onPress={() => setShowModal(true)}
          activeOpacity={0.85}
        >
          <MapPin size={14} color={colors.accent} />
          <Text style={styles.upsellText}>
            Free limit reached — go Pro for unlimited territory & battles
          </Text>
        </TouchableOpacity>
      )}

      <TerritoryModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        userId={userId}
        topRegionH3={topRegion?.regionH3 ?? null}
        isSubscribed={isSubscribed}
        presentPaywall={presentPaywall}
        getLastPaywallError={getLastPaywallError}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
    iconBubble: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: `${colors.accent}1A`,
    },
    titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    title: { fontSize: 15, fontWeight: '700' as const, color: colors.text },
    subtitle: { fontSize: 12, color: colors.textLight, marginTop: 2 },
    bodyRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginTop: 12,
    },
    kingText: { flex: 1, fontSize: 13, color: colors.text },
    upsell: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginTop: 12,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}14`,
    },
    upsellText: { flex: 1, fontSize: 12, color: colors.text },
  });
