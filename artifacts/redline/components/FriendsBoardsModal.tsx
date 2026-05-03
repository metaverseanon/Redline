import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import { X, Plus, Trash2, UserPlus, LogOut, Trophy, ChevronRight, Lock, Crown, Share2, Flag, CheckCircle2, Clock } from 'lucide-react-native';
import { trpc } from '@/lib/trpc';
import { useSettings } from '@/providers/SettingsProvider';
import { ThemeColors } from '@/constants/colors';
import ProBadge from '@/components/ProBadge';

type Category = 'topSpeed' | 'distance' | 'duration' | 'avgSpeed' | 'acceleration' | 'maxGForce';

const CATEGORY_OPTIONS: { key: Category; label: string }[] = [
  { key: 'topSpeed', label: 'Top Speed' },
  { key: 'distance', label: 'Distance' },
  { key: 'duration', label: 'Duration' },
  { key: 'avgSpeed', label: 'Avg Speed' },
  { key: 'acceleration', label: 'Acceleration' },
  { key: 'maxGForce', label: 'Max G' },
];

type PaywallResult = 'purchased' | 'restored' | 'cancelled' | 'error' | 'not_presented';

interface FriendsBoardsModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  isSubscribed: boolean;
  presentPaywall: () => void | Promise<PaywallResult> | Promise<void>;
  getLastPaywallError?: () => string | null;
}

type ViewMode = 'list' | 'create' | 'details';

export default function FriendsBoardsModal({
  visible,
  onClose,
  userId,
  isSubscribed,
  presentPaywall,
  getLastPaywallError,
}: FriendsBoardsModalProps) {
  const { colors } = useSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [view, setView] = useState<ViewMode>('list');
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState<Category>('topSpeed');
  const [inviteName, setInviteName] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [challengeName, setChallengeName] = useState('');
  const [challengeMetric, setChallengeMetric] = useState<Category>('topSpeed');
  const [challengeTarget, setChallengeTarget] = useState('');
  const [challengeDays, setChallengeDays] = useState<number>(7);

  const utils = trpc.useUtils?.();

  const listQuery = trpc.privateLeaderboards.listMine.useQuery(
    { userId },
    { enabled: visible && !!userId }
  );

  const detailsQuery = trpc.privateLeaderboards.getDetails.useQuery(
    { leaderboardId: activeBoardId ?? '', userId },
    { enabled: visible && !!activeBoardId && view === 'details' && !!userId }
  );

  const createMutation = trpc.privateLeaderboards.create.useMutation({
    onSuccess: (created) => {
      setCreateName('');
      setCreateCategory('topSpeed');
      utils?.privateLeaderboards.listMine.invalidate({ userId });
      setActiveBoardId(created.id);
      setView('details');
    },
    onError: (e) => Alert.alert('Could not create board', e.message),
  });

  const inviteMutation = trpc.privateLeaderboards.inviteByUsername.useMutation({
    onSuccess: (res) => {
      setInviteName('');
      setShowInvite(false);
      if (res.added) {
        Alert.alert('Invited', `${res.displayName} has been added.`);
      } else {
        Alert.alert('Already a member', `${res.displayName} is already on this board.`);
      }
      if (activeBoardId) {
        utils?.privateLeaderboards.getDetails.invalidate({ leaderboardId: activeBoardId, userId });
      }
    },
    onError: (e) => Alert.alert('Invite failed', e.message),
  });

  const leaveMutation = trpc.privateLeaderboards.leave.useMutation({
    onSuccess: () => {
      utils?.privateLeaderboards.listMine.invalidate({ userId });
      setActiveBoardId(null);
      setView('list');
    },
    onError: (e) => Alert.alert('Leave failed', e.message),
  });

  const deleteMutation = trpc.privateLeaderboards.delete.useMutation({
    onSuccess: () => {
      utils?.privateLeaderboards.listMine.invalidate({ userId });
      setActiveBoardId(null);
      setView('list');
    },
    onError: (e) => Alert.alert('Delete failed', e.message),
  });

  const setChallengeMutation = trpc.privateLeaderboards.setChallenge.useMutation({
    onSuccess: () => {
      setShowChallenge(false);
      setChallengeName('');
      setChallengeTarget('');
      if (activeBoardId) {
        utils?.privateLeaderboards.getDetails.invalidate({ leaderboardId: activeBoardId, userId });
      }
      Alert.alert('Challenge set', 'Members have been notified.');
    },
    onError: (e) => Alert.alert('Could not set challenge', e.message),
  });

  const clearChallengeMutation = trpc.privateLeaderboards.clearChallenge.useMutation({
    onSuccess: () => {
      if (activeBoardId) {
        utils?.privateLeaderboards.getDetails.invalidate({ leaderboardId: activeBoardId, userId });
      }
    },
    onError: (e) => Alert.alert('Could not clear challenge', e.message),
  });

  const handleShareInvite = useCallback(async (boardName: string) => {
    try {
      await Share.share({
        message: `Join my "${boardName}" Friends Board on RedLine 🏁\n\nDownload: https://apps.apple.com/app/redline`,
      });
    } catch {
      // user cancelled
    }
  }, []);

  const handleSubmitChallenge = useCallback(() => {
    if (!activeBoardId) return;
    const name = challengeName.trim();
    const target = parseFloat(challengeTarget);
    if (!name) {
      Alert.alert('Name required', 'Give your challenge a name.');
      return;
    }
    if (!isFinite(target) || target <= 0) {
      Alert.alert('Target required', 'Enter a positive target value.');
      return;
    }
    setChallengeMutation.mutate({
      leaderboardId: activeBoardId,
      ownerId: userId,
      name,
      metric: challengeMetric,
      targetValue: target,
      durationDays: challengeDays,
    });
  }, [activeBoardId, challengeName, challengeTarget, challengeMetric, challengeDays, userId, setChallengeMutation]);

  const tryPaywall = useCallback(async () => {
    try {
      const result = (await presentPaywall()) as PaywallResult | void;
      if (result === 'not_presented' || result === 'error') {
        const reason = getLastPaywallError?.();
        Alert.alert(
          'Friends Boards (Pro)',
          reason ?? 'The upgrade screen could not be opened right now. Please try again in a moment, or check your connection.',
        );
      }
      return result;
    } catch (e: any) {
      Alert.alert(
        'Friends Boards (Pro)',
        `The upgrade screen could not be opened: ${e?.message ?? 'unknown error'}`,
      );
      return 'error' as const;
    }
  }, [presentPaywall, getLastPaywallError]);

  const handleCreatePress = useCallback(() => {
    if (!isSubscribed) {
      void tryPaywall();
      return;
    }
    setView('create');
  }, [isSubscribed, tryPaywall]);

  const handleSubmitCreate = useCallback(() => {
    const name = createName.trim();
    if (!name) {
      Alert.alert('Name required', 'Give your board a name.');
      return;
    }
    createMutation.mutate({ ownerId: userId, name, category: createCategory });
  }, [createName, createCategory, userId, createMutation]);

  const handleSubmitInvite = useCallback(() => {
    const name = inviteName.trim();
    if (!name || !activeBoardId) return;
    inviteMutation.mutate({ leaderboardId: activeBoardId, ownerId: userId, displayName: name });
  }, [inviteName, activeBoardId, userId, inviteMutation]);

  const close = useCallback(() => {
    setView('list');
    setActiveBoardId(null);
    setCreateName('');
    setInviteName('');
    setShowInvite(false);
    onClose();
  }, [onClose]);

  const board = detailsQuery.data?.board;
  const members = detailsQuery.data?.members ?? [];
  const isOwner = board?.ownerId === userId;

  const renderUnit = (category: string, value: number): string => {
    switch (category) {
      case 'topSpeed':
      case 'avgSpeed':
        return `${value.toFixed(0)} km/h`;
      case 'distance':
        return `${(value / 1000).toFixed(1)} km`;
      case 'duration':
        return `${(value / 60000).toFixed(0)} min`;
      case 'acceleration':
        return value > 0 ? `${value.toFixed(2)} m/s\u00b2` : '\u2014';
      case 'maxGForce':
        return `${value.toFixed(2)} g`;
      default:
        return value.toFixed(0);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {view !== 'list' && (
                <TouchableOpacity onPress={() => setView('list')} style={styles.backBtn} activeOpacity={0.7}>
                  <Text style={styles.backBtnText}>{'\u2190'}</Text>
                </TouchableOpacity>
              )}
              <Trophy size={20} color={colors.accent} />
              <Text style={styles.title}>
                {view === 'list' && 'Friends Boards'}
                {view === 'create' && 'New Board'}
                {view === 'details' && (board?.name ?? 'Board')}
              </Text>
              <ProBadge size="sm" />
            </View>
            <TouchableOpacity onPress={close} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {view === 'list' && (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              {!isSubscribed && (
                <View style={styles.lockedCard}>
                  <Lock size={20} color={colors.accent} />
                  <Text style={styles.lockedTitle}>Pro feature</Text>
                  <Text style={styles.lockedDesc}>
                    Create private leaderboards for your friends. They don&apos;t need Pro to join.
                  </Text>
                  <TouchableOpacity style={styles.upgradeBtn} onPress={() => { void tryPaywall(); }} activeOpacity={0.8}>
                    <Crown size={14} color="#000" />
                    <Text style={styles.upgradeBtnText}>UPGRADE TO PRO</Text>
                  </TouchableOpacity>
                </View>
              )}

              {listQuery.isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />}

              {listQuery.data?.boards.length === 0 && !listQuery.isLoading && (
                <Text style={styles.emptyText}>
                  {isSubscribed
                    ? 'No boards yet. Create one to compete with your friends.'
                    : 'You haven\u2019t joined any boards yet.'}
                </Text>
              )}

              {listQuery.data?.boards.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.boardRow}
                  onPress={() => {
                    setActiveBoardId(b.id);
                    setView('details');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.boardName}>{b.name}</Text>
                    <Text style={styles.boardMeta}>
                      {CATEGORY_OPTIONS.find((c) => c.key === b.category)?.label ?? b.category}
                      {b.isOwner ? ' \u2022 Owner' : ''}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textLight} />
                </TouchableOpacity>
              ))}

              {isSubscribed && (
                <TouchableOpacity style={styles.primaryBtn} onPress={handleCreatePress} activeOpacity={0.8}>
                  <Plus size={16} color="#FFF" />
                  <Text style={styles.primaryBtnText}>CREATE BOARD</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {view === 'create' && (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              <Text style={styles.label}>BOARD NAME</Text>
              <TextInput
                style={styles.input}
                value={createName}
                onChangeText={(t) => setCreateName(t.slice(0, 60))}
                placeholder="e.g. Sunday Crew"
                placeholderTextColor={colors.textLight}
                maxLength={60}
                autoFocus
              />

              <Text style={[styles.label, { marginTop: 16 }]}>RANK BY</Text>
              <View style={styles.categoryGrid}>
                {CATEGORY_OPTIONS.map((c) => {
                  const active = c.key === createCategory;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.categoryChip, active && styles.categoryChipActive]}
                      onPress={() => setCreateCategory(c.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 24 }]}
                onPress={handleSubmitCreate}
                disabled={createMutation.isPending}
                activeOpacity={0.8}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Plus size={16} color="#FFF" />
                    <Text style={styles.primaryBtnText}>CREATE</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}

          {view === 'details' && (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              {detailsQuery.isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />}

              {board && (
                <>
                  <View style={styles.detailsMeta}>
                    <Text style={styles.detailsCategory}>
                      Ranked by{' '}
                      {CATEGORY_OPTIONS.find((c) => c.key === board.category)?.label ?? board.category}
                    </Text>
                    <Text style={styles.detailsCount}>{members.length} member{members.length === 1 ? '' : 's'}</Text>
                  </View>

                  {detailsQuery.data?.challenge && (() => {
                    const ch = detailsQuery.data.challenge;
                    const remainingMs = ch.endAt - Date.now();
                    const isActive = remainingMs > 0;
                    const days = Math.max(0, Math.floor(remainingMs / (24 * 60 * 60 * 1000)));
                    const hours = Math.max(0, Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)));
                    const meCompleted = ch.completedUserIds.includes(userId);
                    const metricLabel = CATEGORY_OPTIONS.find((c) => c.key === ch.metric)?.label ?? ch.metric;
                    return (
                      <View style={styles.challengeCard}>
                        <View style={styles.challengeHeader}>
                          <Flag size={16} color={colors.accent} />
                          <Text style={styles.challengeTitle} numberOfLines={1}>{ch.name}</Text>
                          {meCompleted && <CheckCircle2 size={16} color="#44FF88" />}
                        </View>
                        <Text style={styles.challengeGoal}>
                          Hit {ch.targetValue} {metricLabel}
                        </Text>
                        <View style={styles.challengeFooter}>
                          <View style={styles.challengeTimerRow}>
                            <Clock size={11} color={colors.textLight} />
                            <Text style={styles.challengeTimerText}>
                              {isActive ? `${days}d ${hours}h left` : 'Ended'}
                            </Text>
                          </View>
                          <Text style={styles.challengeProgressText}>
                            {ch.completedUserIds.length}/{members.length} done
                          </Text>
                        </View>
                        {isOwner && (
                          <TouchableOpacity
                            onPress={() => {
                              if (!activeBoardId) return;
                              Alert.alert('End challenge?', 'This removes the current challenge for everyone.', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'End',
                                  style: 'destructive',
                                  onPress: () => clearChallengeMutation.mutate({ leaderboardId: activeBoardId, ownerId: userId }),
                                },
                              ]);
                            }}
                            style={styles.challengeClearBtn}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.challengeClearText}>END CHALLENGE</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })()}

                  {members.map((m) => (
                    <View key={m.userId} style={styles.memberRow}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>{m.rank}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{m.displayName}</Text>
                        {(m.carBrand || m.carModel) && (
                          <Text style={styles.memberCar}>
                            {[m.carBrand, m.carModel].filter(Boolean).join(' ')}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.memberValue}>{renderUnit(board.category, m.value)}</Text>
                    </View>
                  ))}

                  {members.length === 0 && !detailsQuery.isLoading && (
                    <Text style={styles.emptyText}>No members yet. Invite a friend below.</Text>
                  )}

                  <View style={styles.actionsRow}>
                    {isOwner && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => setShowInvite(true)}
                        activeOpacity={0.8}
                      >
                        <UserPlus size={14} color={colors.text} />
                        <Text style={styles.actionBtnText}>INVITE</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleShareInvite(board.name)}
                      activeOpacity={0.8}
                    >
                      <Share2 size={14} color={colors.text} />
                      <Text style={styles.actionBtnText}>SHARE</Text>
                    </TouchableOpacity>
                    {isOwner && !detailsQuery.data?.challenge && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => {
                          setChallengeMetric(board.category as Category);
                          setShowChallenge(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <Flag size={14} color={colors.text} />
                        <Text style={styles.actionBtnText}>CHALLENGE</Text>
                      </TouchableOpacity>
                    )}
                    {!isOwner && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.dangerBtn]}
                        onPress={() => {
                          if (!activeBoardId) return;
                          Alert.alert('Leave board?', 'You can be re-invited later.', [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Leave',
                              style: 'destructive',
                              onPress: () => leaveMutation.mutate({ leaderboardId: activeBoardId, userId }),
                            },
                          ]);
                        }}
                        activeOpacity={0.8}
                      >
                        <LogOut size={14} color={colors.danger} />
                        <Text style={[styles.actionBtnText, { color: colors.danger }]}>LEAVE</Text>
                      </TouchableOpacity>
                    )}
                    {isOwner && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.dangerBtn]}
                        onPress={() => {
                          if (!activeBoardId) return;
                          Alert.alert('Delete board?', 'This removes the board for everyone.', [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => deleteMutation.mutate({ leaderboardId: activeBoardId, ownerId: userId }),
                            },
                          ]);
                        }}
                        activeOpacity={0.8}
                      >
                        <Trash2 size={14} color={colors.danger} />
                        <Text style={[styles.actionBtnText, { color: colors.danger }]}>DELETE</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showInvite} transparent animationType="fade" onRequestClose={() => setShowInvite(false)}>
        <Pressable style={styles.subOverlay} onPress={() => setShowInvite(false)}>
          <Pressable style={styles.subSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.subHeader}>
              <UserPlus size={18} color={colors.accent} />
              <Text style={styles.subTitle}>Invite by username</Text>
              <TouchableOpacity onPress={() => setShowInvite(false)} style={styles.closeBtn}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={inviteName}
              onChangeText={setInviteName}
              placeholder="Display name"
              placeholderTextColor={colors.textLight}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 16 }]}
              onPress={handleSubmitInvite}
              disabled={inviteMutation.isPending}
              activeOpacity={0.8}
            >
              {inviteMutation.isPending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>SEND INVITE</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showChallenge} transparent animationType="fade" onRequestClose={() => setShowChallenge(false)}>
        <Pressable style={styles.subOverlay} onPress={() => setShowChallenge(false)}>
          <Pressable style={styles.subSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.subHeader}>
              <Flag size={18} color={colors.accent} />
              <Text style={styles.subTitle}>Set a Challenge</Text>
              <TouchableOpacity onPress={() => setShowChallenge(false)} style={styles.closeBtn}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { marginTop: 4 }]}>Challenge name</Text>
            <TextInput
              style={styles.input}
              value={challengeName}
              onChangeText={setChallengeName}
              placeholder="e.g. Hit 200 km/h this week"
              placeholderTextColor={colors.textLight}
              maxLength={60}
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Metric</Text>
            <View style={styles.categoryGrid}>
              {CATEGORY_OPTIONS.map((c) => {
                const active = c.key === challengeMetric;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => setChallengeMetric(c.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 12 }]}>Target value</Text>
            <TextInput
              style={styles.input}
              value={challengeTarget}
              onChangeText={setChallengeTarget}
              placeholder="e.g. 200"
              placeholderTextColor={colors.textLight}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Duration</Text>
            <View style={styles.categoryGrid}>
              {[1, 3, 7, 14, 30].map((d) => {
                const active = d === challengeDays;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => setChallengeDays(d)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                      {d} day{d === 1 ? '' : 's'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 20 }]}
              onPress={handleSubmitChallenge}
              disabled={setChallengeMutation.isPending}
              activeOpacity={0.8}
            >
              {setChallengeMutation.isPending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Flag size={16} color="#FFF" />
                  <Text style={styles.primaryBtnText}>START CHALLENGE</Text>
                </>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '90%',
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    title: {
      fontSize: 16,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
    },
    backBtn: { padding: 4 },
    backBtnText: { fontSize: 18, color: colors.text, fontFamily: 'Orbitron_600SemiBold' },
    closeBtn: { padding: 4 },
    body: { maxHeight: '100%' },
    bodyContent: { padding: 20, paddingBottom: 40 },
    lockedCard: {
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.cardBackground,
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    lockedTitle: {
      fontSize: 14,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
      letterSpacing: 1,
    },
    lockedDesc: {
      fontSize: 12,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      textAlign: 'center',
      lineHeight: 18,
    },
    upgradeBtn: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.accent,
    },
    upgradeBtnText: {
      fontSize: 11,
      fontFamily: 'Orbitron_700Bold',
      color: '#000',
      letterSpacing: 1,
    },
    emptyText: {
      fontSize: 13,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      textAlign: 'center',
      marginTop: 24,
      marginBottom: 16,
      lineHeight: 20,
    },
    boardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
      marginBottom: 8,
      gap: 8,
    },
    boardName: {
      fontSize: 14,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
    },
    boardMeta: {
      fontSize: 11,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 2,
    },
    primaryBtn: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.accent,
    },
    primaryBtnText: {
      fontSize: 13,
      fontFamily: 'Orbitron_700Bold',
      color: '#FFF',
      letterSpacing: 1,
    },
    label: {
      fontSize: 11,
      fontFamily: 'Orbitron_700Bold',
      color: colors.textLight,
      letterSpacing: 1,
      marginBottom: 8,
    },
    input: {
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
      color: colors.text,
      fontFamily: 'Orbitron_400Regular',
      fontSize: 14,
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    categoryChip: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
    },
    categoryChipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accent,
    },
    categoryChipText: {
      fontSize: 11,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
      letterSpacing: 0.5,
    },
    categoryChipTextActive: {
      color: '#FFF',
    },
    detailsMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    detailsCategory: {
      fontSize: 11,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.textLight,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    detailsCount: {
      fontSize: 11,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.cardBackground,
      marginBottom: 6,
      gap: 12,
    },
    rankBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: {
      fontSize: 12,
      fontFamily: 'Orbitron_700Bold',
      color: '#FFF',
    },
    memberName: {
      fontSize: 13,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
    },
    memberCar: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 2,
    },
    memberValue: {
      fontSize: 13,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 24,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
    },
    dangerBtn: {
      borderColor: colors.danger,
    },
    actionBtnText: {
      fontSize: 11,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      letterSpacing: 1,
    },
    subOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    subSheet: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.background,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    subHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    subTitle: {
      flex: 1,
      fontSize: 14,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
    },
    challengeCard: {
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
      backgroundColor: colors.cardBackground,
    },
    challengeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    challengeTitle: {
      flex: 1,
      fontSize: 13,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      letterSpacing: 0.5,
    },
    challengeGoal: {
      fontSize: 12,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginBottom: 10,
    },
    challengeFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    challengeTimerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    challengeTimerText: {
      fontSize: 11,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.textLight,
    },
    challengeProgressText: {
      fontSize: 11,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
    challengeClearBtn: {
      marginTop: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.danger,
      alignItems: 'center',
    },
    challengeClearText: {
      fontSize: 10,
      fontFamily: 'Orbitron_700Bold',
      color: colors.danger,
      letterSpacing: 1,
    },
  });
