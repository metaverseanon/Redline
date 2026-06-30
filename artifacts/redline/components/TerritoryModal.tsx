import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { X, Crown, Trophy, MapPin, Globe } from 'lucide-react-native';
import { trpc } from '@/lib/trpc';
import { useSettings } from '@/providers/SettingsProvider';
import { ThemeColors } from '@/constants/colors';
import ProBadge from '@/components/ProBadge';

type PaywallResult = 'purchased' | 'restored' | 'cancelled' | 'error' | 'not_presented';

interface TerritoryModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  topRegionH3: string | null;
  isSubscribed: boolean;
  presentPaywall: (source?: string) => void | Promise<PaywallResult> | Promise<void>;
  getLastPaywallError?: () => string | null;
}

type Tab = 'global' | 'region';

export default function TerritoryModal({
  visible,
  onClose,
  userId,
  topRegionH3,
  isSubscribed,
  presentPaywall,
  getLastPaywallError,
}: TerritoryModalProps) {
  const { colors } = useSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('global');

  const globalQuery = trpc.territory.getGlobalLeaderboard.useQuery(
    { userId, limit: 50 },
    { enabled: visible && !!userId },
  );
  const regionQuery = trpc.territory.getRegionLeaderboard.useQuery(
    { userId, regionH3: topRegionH3 ?? '', limit: 50 },
    { enabled: visible && !!userId && !!topRegionH3 && tab === 'region' },
  );

  const tryPaywall = useCallback(async () => {
    try {
      const result = (await presentPaywall('territory_modal')) as PaywallResult | void;
      if (result === 'not_presented' || result === 'error') {
        const reason = getLastPaywallError?.();
        Alert.alert(
          'Pro feature',
          reason || 'Upgrade to Pro to claim unlimited territory, battle for rivals’ cells, and become King of your area.',
        );
      }
    } catch (e: any) {
      Alert.alert('Pro feature', e?.message ?? 'Please try again.');
    }
  }, [presentPaywall, getLastPaywallError]);

  const active = tab === 'global' ? globalQuery : regionQuery;
  const entries = tab === 'global' ? globalQuery.data?.entries ?? [] : regionQuery.data?.entries ?? [];
  const me = tab === 'global' ? globalQuery.data?.me : regionQuery.data?.me;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Crown size={20} color={colors.accent} />
              <Text style={styles.headerTitle}>Territory</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} testID="territory-modal-close">
              <X size={22} color={colors.textLight} />
            </TouchableOpacity>
          </View>

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, tab === 'global' && styles.tabActive]}
              onPress={() => setTab('global')}
              activeOpacity={0.8}
            >
              <Globe size={14} color={tab === 'global' ? colors.accent : colors.textLight} />
              <Text style={[styles.tabText, tab === 'global' && styles.tabTextActive]}>Global</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'region' && styles.tabActive]}
              onPress={() => setTab('region')}
              activeOpacity={0.8}
              disabled={!topRegionH3}
            >
              <MapPin size={14} color={tab === 'region' ? colors.accent : colors.textLight} />
              <Text style={[styles.tabText, tab === 'region' && styles.tabTextActive]}>My Area</Text>
            </TouchableOpacity>
          </View>

          {!isSubscribed && (
            <TouchableOpacity style={styles.upsell} onPress={() => void tryPaywall()} activeOpacity={0.85}>
              <Crown size={16} color={colors.accent} />
              <Text style={styles.upsellText}>
                Go Pro to claim unlimited cells, battle rivals & rule as King
              </Text>
              <ProBadge />
            </TouchableOpacity>
          )}

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 24 }}>
            {tab === 'region' && !topRegionH3 ? (
              <Text style={styles.empty}>Claim some territory to unlock your area ranking.</Text>
            ) : active.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
            ) : active.isError ? (
              <View style={styles.errorBox}>
                <Text style={styles.empty}>Couldn’t load rankings.</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => active.refetch()} activeOpacity={0.8}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : entries.length === 0 ? (
              <Text style={styles.empty}>No territory claimed yet. Go drive!</Text>
            ) : (
              entries.map((e) => {
                const isKing = 'isKing' in e && (e as { isKing?: boolean }).isKing;
                const mine = e.userId === userId;
                return (
                  <View key={e.userId} style={[styles.row, mine && styles.rowMine]}>
                    <Text style={styles.rank}>{e.rank}</Text>
                    {isKing ? (
                      <Crown size={16} color={colors.accent} fill={colors.accent} />
                    ) : (
                      <Trophy size={14} color={colors.textLight} />
                    )}
                    <Text style={styles.name} numberOfLines={1}>
                      {e.name}
                      {mine ? ' (you)' : ''}
                    </Text>
                    {'isPro' in e && (e as { isPro?: boolean }).isPro && <ProBadge />}
                    <Text style={styles.count}>{e.count}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>

          {me && me.rank > 0 && (
            <View style={styles.meBar}>
              <Text style={styles.meText}>Your rank: #{me.rank}</Text>
              <Text style={styles.meText}>{me.count} cells</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end' as const,
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '85%',
      paddingTop: 16,
    },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    headerTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
    headerTitle: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
    tabRow: {
      flexDirection: 'row' as const,
      gap: 8,
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    tab: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
    },
    tabActive: { borderColor: colors.accent },
    tabText: { fontSize: 13, fontWeight: '600' as const, color: colors.textLight },
    tabTextActive: { color: colors.text },
    upsell: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginHorizontal: 20,
      marginBottom: 12,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}14`,
    },
    upsellText: { flex: 1, fontSize: 12, color: colors.text },
    list: { paddingHorizontal: 20 },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowMine: { backgroundColor: `${colors.accent}10`, borderRadius: 8, paddingHorizontal: 6 },
    rank: { width: 28, fontSize: 14, fontWeight: '700' as const, color: colors.textLight },
    name: { flex: 1, fontSize: 14, color: colors.text },
    count: { fontSize: 14, fontWeight: '700' as const, color: colors.accent },
    empty: { textAlign: 'center' as const, color: colors.textLight, marginTop: 24, fontSize: 14 },
    errorBox: { alignItems: 'center' as const, marginTop: 24, gap: 12 },
    retryBtn: {
      paddingVertical: 8,
      paddingHorizontal: 20,
      borderRadius: 8,
      backgroundColor: colors.accent,
    },
    retryText: { color: '#FFFFFF', fontWeight: '700' as const },
    meBar: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    meText: { fontSize: 13, fontWeight: '600' as const, color: colors.text },
  });
