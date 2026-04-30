import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Gauge, Trash2, ImageIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';
import { trpc } from '@/lib/trpc';
import { ThemeColors } from '@/constants/colors';

interface UserPost {
  id: string;
  text?: string;
  imageUrl?: string;
  revCount: number;
  createdAt: number;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MyPostsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { colors } = useSettings();

  const styles = useMemo(() => createStyles(colors), [colors]);
  const utils = trpc.useUtils();

  const postsQuery = trpc.posts.getUserPosts.useQuery(
    { userId: user?.id || '' },
    { enabled: !!user?.id }
  );

  const deletePostMutation = trpc.posts.deletePost.useMutation({
    onSuccess: () => {
      void utils.posts.getUserPosts.invalidate();
      void utils.posts.getFeedPosts.invalidate();
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to delete post.');
    },
  });

  const handleRefresh = useCallback(() => {
    void postsQuery.refetch();
  }, [postsQuery]);

  const handleDelete = useCallback(
    (postId: string) => {
      Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!user?.id) return;
            if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            deletePostMutation.mutate({ postId, userId: user.id });
          },
        },
      ]);
    },
    [user?.id, deletePostMutation]
  );

  const renderPost = useCallback(
    ({ item }: { item: UserPost }) => (
      <View style={styles.postCard}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.postImage} resizeMode="cover" />
        ) : (
          <View style={styles.noImagePlaceholder}>
            <ImageIcon size={24} color={colors.textLight} />
          </View>
        )}
        <View style={styles.postContent}>
          {item.text ? (
            <Text style={styles.postText} numberOfLines={3}>
              {item.text}
            </Text>
          ) : (
            <Text style={styles.postTextEmpty}>No caption</Text>
          )}
          <View style={styles.postMeta}>
            <View style={styles.revBadge}>
              <Gauge size={12} color={colors.accent} />
              <Text style={styles.revBadgeText}>{item.revCount}</Text>
            </View>
            <Text style={styles.postDate}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item.id)}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Trash2 size={16} color={colors.danger} />
        </TouchableOpacity>
      </View>
    ),
    [styles, colors, handleDelete]
  );

  const emptyPosts = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <ImageIcon size={48} color={colors.textLight} />
        <Text style={styles.emptyTitle}>No posts yet</Text>
        <Text style={styles.emptySubtext}>
          Share photos of your ride with your followers
        </Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/create-post' as any)}
          activeOpacity={0.7}
        >
          <Text style={styles.createButtonText}>Create Post</Text>
        </TouchableOpacity>
      </View>
    ),
    [styles, colors, router]
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'My Posts',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      {postsQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={postsQuery.data ?? []}
          renderItem={renderPost}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            (postsQuery.data ?? []).length === 0 && styles.listEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={postsQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={emptyPosts}
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
    postCard: {
      flexDirection: 'row',
      backgroundColor: colors.cardLight,
      borderRadius: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      alignItems: 'center',
    },
    postImage: {
      width: 80,
      height: 80,
    },
    noImagePlaceholder: {
      width: 80,
      height: 80,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    postContent: {
      flex: 1,
      padding: 12,
      gap: 6,
    },
    postText: {
      fontSize: 13,
      fontFamily: 'Orbitron_400Regular',
      color: colors.text,
      lineHeight: 18,
    },
    postTextEmpty: {
      fontSize: 13,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      fontStyle: 'italic',
    },
    postMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    revBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accent + '12',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    revBadgeText: {
      fontSize: 11,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.accent,
    },
    postDate: {
      fontSize: 10,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
    },
    deleteButton: {
      padding: 14,
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
    createButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 24,
      marginTop: 12,
    },
    createButtonText: {
      fontSize: 14,
      fontFamily: 'Orbitron_600SemiBold',
      color: '#FFFFFF',
    },
  });
