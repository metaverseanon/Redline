import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { X, Crown, Flag, Swords, Shield, Lock } from 'lucide-react-native';
import { useSettings } from '@/providers/SettingsProvider';
import { ThemeColors } from '@/constants/colors';
import type { TerritorySummary } from '@/lib/territory';

type PaywallResult = 'purchased' | 'restored' | 'cancelled' | 'error' | 'not_presented';

interface TerritoryResultModalProps {
  visible: boolean;
  summary: TerritorySummary | null;
  onClose: () => void;
  isSubscribed: boolean;
  presentPaywall: (source?: string) => void | Promise<PaywallResult> | Promise<void>;
  getLastPaywallError?: () => string | null;
}

export default function TerritoryResultModal({
  visible,
  summary,
  onClose,
  isSubscribed,
  presentPaywall,
  getLastPaywallError,
}: TerritoryResultModalProps) {
  const { colors } = useSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const tryPaywall = useCallback(async () => {
    try {
      const result = (await presentPaywall('territory_post_drive')) as PaywallResult | void;
      if (result === 'not_presented' || result === 'error') {
        const reason = getLastPaywallError?.();
        Alert.alert(
          'Pro feature',
          reason ||
            'Upgrade to Pro to claim unlimited territory, battle for rivals’ cells, and become King of your area.',
        );
      } else if (result === 'purchased' || result === 'restored') {
        onClose();
      }
    } catch (e: any) {
      Alert.alert('Pro feature', e?.message ?? 'Please try again.');
    }
  }, [presentPaywall, getLastPaywallError, onClose]);

  if (!summary) return null;

  // Cap is "reached" when the server refused new claims, or a free user drove
  // through rival cells they couldn't take.
  const showUpsell = !isSubscribed && (summary.capReached || summary.blocked > 0);

  const rows: { icon: React.ReactNode; label: string; value: number; show: boolean }[] = [
    {
      icon: <Flag size={18} color={colors.success} />,
      label: 'New cells claimed',
      value: summary.claimed,
      show: summary.claimed > 0,
    },
    {
      icon: <Swords size={18} color={colors.accent} />,
      label: 'Taken from rivals',
      value: summary.taken,
      show: summary.taken > 0,
    },
    {
      icon: <Shield size={18} color={colors.textLight} />,
      label: 'Cells defended',
      value: summary.defended,
      show: summary.defended > 0,
    },
    {
      icon: <Lock size={18} color={colors.warning} />,
      label: 'Held by rivals',
      value: summary.blocked,
      show: summary.blocked > 0,
    },
  ];
  const visibleRows = rows.filter((r) => r.show);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} testID="territory-result-close">
            <X size={20} color={colors.textLight} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.crownBubble}>
              <Crown size={24} color="#FFD700" fill="#FFD700" />
            </View>
            <Text style={styles.title}>Territory Update</Text>
            <Text style={styles.subtitle}>
              You now own {summary.totalOwned} cell{summary.totalOwned === 1 ? '' : 's'}
            </Text>
          </View>

          <View style={styles.statsBlock}>
            {visibleRows.length === 0 ? (
              <Text style={styles.emptyText}>No territory changes this drive.</Text>
            ) : (
              visibleRows.map((r) => (
                <View key={r.label} style={styles.statRow}>
                  <View style={styles.statLeft}>
                    {r.icon}
                    <Text style={styles.statLabel}>{r.label}</Text>
                  </View>
                  <Text style={styles.statValue}>{r.value}</Text>
                </View>
              ))
            )}
          </View>

          {showUpsell && (
            <View style={styles.upsell}>
              <Text style={styles.upsellTitle}>
                {summary.capReached ? 'Free territory limit reached' : 'Rivals are holding ground'}
              </Text>
              <Text style={styles.upsellText}>
                {summary.capReached
                  ? `Free drivers can own up to ${summary.cap} cells. Go Pro for unlimited claiming, battles, and King eligibility.`
                  : 'Go Pro to battle for rival-owned cells by out-driving their visit count — and become King of your area.'}
              </Text>
              <TouchableOpacity style={styles.upsellBtn} onPress={tryPaywall} testID="territory-result-upgrade">
                <Crown size={16} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={styles.upsellBtnText}>Claim Your Territory</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.doneBtn} onPress={onClose} testID="territory-result-done">
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.cardLight,
      borderRadius: 20,
      padding: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    closeBtn: {
      position: 'absolute',
      top: 12,
      right: 12,
      padding: 6,
      zIndex: 2,
    },
    header: {
      alignItems: 'center',
      marginBottom: 18,
    },
    crownBubble: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: 'rgba(255,215,0,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    title: {
      fontSize: 20,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textLight,
      marginTop: 4,
    },
    statsBlock: {
      gap: 10,
      marginBottom: 6,
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    statLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statLabel: {
      fontSize: 14,
      color: colors.text,
    },
    statValue: {
      fontSize: 18,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textLight,
      textAlign: 'center',
      paddingVertical: 12,
    },
    upsell: {
      marginTop: 16,
      padding: 14,
      borderRadius: 12,
      backgroundColor: 'rgba(255,215,0,0.08)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,215,0,0.4)',
    },
    upsellTitle: {
      fontSize: 14,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
      marginBottom: 4,
    },
    upsellText: {
      fontSize: 12,
      color: colors.textLight,
      lineHeight: 17,
      marginBottom: 12,
    },
    upsellBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#FFB800',
      borderRadius: 10,
      paddingVertical: 12,
    },
    upsellBtnText: {
      fontSize: 14,
      fontFamily: 'Orbitron_600SemiBold',
      color: '#FFFFFF',
    },
    doneBtn: {
      marginTop: 16,
      alignItems: 'center',
      paddingVertical: 12,
    },
    doneBtnText: {
      fontSize: 14,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.textLight,
    },
  });
}
