import React, { useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Gauge, UserPlus, Bell } from 'lucide-react-native';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';
import { trpc } from '@/lib/trpc';
import { ThemeColors } from '@/constants/colors';

interface NotificationItem {
  id: string;
  type: string;
  fromUserId?: string;
  fromUserName?: string;
  fromUserPicture?: string;
  postId?: string;
  message: string;
  read: boolean;
  createdAt: number;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { colors } = useSettings();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const notificationsQuery = trpc.posts.getNotifications.useQuery(
    { userId: user?.id || '' },
    { enabled: !!user?.id, refetchInterval: 30000 }
  );

  const utils = trpc.useUtils();
  const markReadMutation = trpc.posts.markNotificationsRead.useMutation({
    onSuccess: () => {
      void utils.posts.getUnreadNotificationCount.invalidate();
    },
  });

  useEffect(() => {
    if (user?.id && notificationsQuery.data && notificationsQuery.data.some((n) => !n.read)) {
      markReadMutation.mutate({ userId: user.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, notificationsQuery.data]);

  const handleRefresh = useCallback(() => {
    void notificationsQuery.refetch();
  }, [notificationsQuery]);

  const handleUserPress = useCallback(
    (userId: string) => {
      router.push({ pathname: '/user-profile', params: { userId } });
    },
    [router]
  );

  const getNotificationIcon = useCallback(
    (type: string) => {
      switch (type) {
        case 'post_rev':
          return <Gauge size={18} color={colors.accent} />;
        case 'new_follower':
          return <UserPlus size={18} color={colors.success} />;
        default:
          return <Bell size={18} color={colors.textLight} />;
      }
    },
    [colors]
  );

  const renderNotification = useCallback(
    ({ item }: { item: NotificationItem }) => {
      const initial = item.fromUserName?.[0]?.toUpperCase() || '?';

      return (
        <TouchableOpacity
          style={[styles.notifCard, !item.read && styles.notifCardUnread]}
          onPress={() => item.fromUserId && handleUserPress(item.fromUserId)}
          activeOpacity={0.7}
          testID={`notification-${item.id}`}
        >
          <View style={styles.notifIconWrap}>{getNotificationIcon(item.type)}</View>
          <View style={styles.notifAvatar}>
            {item.fromUserPicture ? (
              <Image source={{ uri: item.fromUserPicture }} style={styles.notifAvatarImage} />
            ) : (
              <Text style={styles.notifAvatarText}>{initial}</Text>
            )}
          </View>
          <View style={styles.notifContent}>
            <Text style={styles.notifMessage} numberOfLines={2}>
              {item.message}
            </Text>
            <Text style={styles.notifTime}>{formatTimeAgo(item.createdAt)}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [styles, handleUserPress, getNotificationIcon]
  );

  const emptyNotifications = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <Bell size={48} color={colors.textLight} />
        <Text style={styles.emptyTitle}>No notifications yet</Text>
        <Text style={styles.emptySubtext}>
          When someone revs your posts or follows you, you{"'"}ll see it here
        </Text>
      </View>
    ),
    [styles, colors]
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      {notificationsQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={notificationsQuery.data ?? []}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            (notificationsQuery.data ?? []).length === 0 && styles.listEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={notificationsQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={emptyNotifications}
        />
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    list: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 30,
    },
    listEmpty: {
      flex: 1,
      justifyContent: 'center',
    },
    notifCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardLight,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    notifCardUnread: {
      borderColor: colors.accent + '40',
      backgroundColor: colors.accent + '08',
    },
    notifIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    notifAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent + '15',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    notifAvatarImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    notifAvatarText: {
      fontSize: 14,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
    notifContent: {
      flex: 1,
      gap: 3,
    },
    notifMessage: {
      fontSize: 13,
      fontFamily: 'Orbitron_500Medium',
      color: colors.text,
      lineHeight: 18,
    },
    notifTime: {
      fontSize: 11,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingHorizontal: 40,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
      marginTop: 8,
    },
    emptySubtext: {
      fontSize: 13,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      textAlign: 'center' as const,
      lineHeight: 20,
    },
  });
