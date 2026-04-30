import React, { useMemo, useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Platform,
  Image,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Navigation, Clock, MapPin, Search, X, UserPlus, Car, Zap, Users, Plus, Bell, Gauge, Compass, MessageCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';
import { trpc } from '@/lib/trpc';
import AnimatedCard from '@/components/AnimatedCard';
import { ThemeColors } from '@/constants/colors';
import AuthGate from '@/components/AuthGate';
import CommentsModal from '@/components/CommentsModal';

interface FeedItem {
  id: string;
  userId: string;
  userName: string;
  userProfilePicture?: string;
  type: string;
  tripId?: string;
  carModel?: string;
  topSpeed: number;
  distance: number;
  duration: number;
  country?: string;
  city?: string;
  revCount: number;
  isRevved: boolean;
  createdAt: number;
}

interface PostItem {
  id: string;
  userId: string;
  userName: string;
  userProfilePicture?: string;
  userCarBrand?: string;
  userCarModel?: string;
  text?: string;
  imageUrl?: string;
  revCount: number;
  isRevved: boolean;
  createdAt: number;
}

interface SearchUser {
  id: string;
  displayName: string;
  carBrand?: string;
  carModel?: string;
  country?: string;
  city?: string;
}

type DiscoverItem =
  | { kind: 'drive'; data: FeedItem }
  | { kind: 'post'; data: PostItem };

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

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

type FeedTab = 'drives' | 'posts' | 'discover';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel, colors } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [authGateFeature, setAuthGateFeature] = useState('');
  const [activeTab, setActiveTab] = useState<FeedTab>('drives');
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const tabIndicatorAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles(colors), [colors]);
  const utils = trpc.useUtils();

  const feedQuery = trpc.social.getFeed.useQuery(
    { userId: user?.id || '', limit: 30 },
    { enabled: !!user?.id, refetchInterval: 60000 }
  );

  const postsQuery = trpc.posts.getFeedPosts.useQuery(
    { userId: user?.id || '', limit: 30 },
    { enabled: !!user?.id, refetchInterval: 60000 }
  );

  const discoverDrivesQuery = trpc.social.getDiscoverDrives.useQuery(
    { userId: user?.id || '', limit: 20 },
    { enabled: !!user?.id && activeTab === 'discover', refetchInterval: 120000 }
  );

  const discoverPostsQuery = trpc.posts.getDiscoverPosts.useQuery(
    { userId: user?.id || '', limit: 20 },
    { enabled: !!user?.id && activeTab === 'discover', refetchInterval: 120000 }
  );

  const searchUsersQuery = trpc.social.searchUsers.useQuery(
    { query: searchQuery, currentUserId: user?.id || '' },
    { enabled: !!user?.id && searchQuery.length >= 2 }
  );

  const followCountsQuery = trpc.social.getFollowCounts.useQuery(
    { userId: user?.id || '' },
    { enabled: !!user?.id }
  );

  const postIds = useMemo(() => {
    const feedPostIds = (postsQuery.data ?? []).map((p) => p.id);
    const discoverPostIds = (discoverPostsQuery.data ?? []).map((p) => p.id);
    return [...new Set([...feedPostIds, ...discoverPostIds])];
  }, [postsQuery.data, discoverPostsQuery.data]);

  const commentCountsQuery = trpc.posts.getCommentCount.useQuery(
    { postIds },
    { enabled: postIds.length > 0 }
  );

  const commentCounts = useMemo(() => commentCountsQuery.data ?? {}, [commentCountsQuery.data]);

  const unreadCountQuery = trpc.posts.getUnreadNotificationCount.useQuery(
    { userId: user?.id || '' },
    { enabled: !!user?.id, refetchInterval: 30000 }
  );

  const followMutation = trpc.social.follow.useMutation({
    onSettled: () => {
      void utils.social.getFollowCounts.invalidate();
      void utils.social.getDiscoverDrives.invalidate();
      void utils.posts.getDiscoverPosts.invalidate();
      void utils.social.getFeed.invalidate();
      void utils.posts.getFeedPosts.invalidate();
    },
  });

  const revPostMutation = trpc.posts.revPost.useMutation({
    onMutate: async ({ postId }) => {
      await utils.posts.getFeedPosts.cancel();
      await utils.posts.getDiscoverPosts.cancel();
      const prev = utils.posts.getFeedPosts.getData({ userId: user?.id || '', limit: 30 });
      const prevDiscover = utils.posts.getDiscoverPosts.getData({ userId: user?.id || '', limit: 20 });
      const updatePost = (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((p: any) => p.id === postId ? { ...p, isRevved: true, revCount: p.revCount + 1 } : p);
      };
      utils.posts.getFeedPosts.setData({ userId: user?.id || '', limit: 30 }, updatePost);
      utils.posts.getDiscoverPosts.setData({ userId: user?.id || '', limit: 20 }, updatePost);
      return { prev, prevDiscover };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.posts.getFeedPosts.setData({ userId: user?.id || '', limit: 30 }, ctx.prev);
      if (ctx?.prevDiscover) utils.posts.getDiscoverPosts.setData({ userId: user?.id || '', limit: 20 }, ctx.prevDiscover);
    },
  });

  const unrevPostMutation = trpc.posts.unrevPost.useMutation({
    onMutate: async ({ postId }) => {
      await utils.posts.getFeedPosts.cancel();
      await utils.posts.getDiscoverPosts.cancel();
      const prev = utils.posts.getFeedPosts.getData({ userId: user?.id || '', limit: 30 });
      const prevDiscover = utils.posts.getDiscoverPosts.getData({ userId: user?.id || '', limit: 20 });
      const updatePost = (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((p: any) => p.id === postId ? { ...p, isRevved: false, revCount: Math.max(0, p.revCount - 1) } : p);
      };
      utils.posts.getFeedPosts.setData({ userId: user?.id || '', limit: 30 }, updatePost);
      utils.posts.getDiscoverPosts.setData({ userId: user?.id || '', limit: 20 }, updatePost);
      return { prev, prevDiscover };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.posts.getFeedPosts.setData({ userId: user?.id || '', limit: 30 }, ctx.prev);
      if (ctx?.prevDiscover) utils.posts.getDiscoverPosts.setData({ userId: user?.id || '', limit: 20 }, ctx.prevDiscover);
    },
  });

  const revActivityMutation = trpc.social.revActivity.useMutation({
    onMutate: async ({ activityId }) => {
      await utils.social.getFeed.cancel();
      await utils.social.getDiscoverDrives.cancel();
      const prev = utils.social.getFeed.getData({ userId: user?.id || '', limit: 30 });
      const prevDiscover = utils.social.getDiscoverDrives.getData({ userId: user?.id || '', limit: 20 });
      const updateActivity = (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((a: any) => a.id === activityId ? { ...a, isRevved: true, revCount: a.revCount + 1 } : a);
      };
      utils.social.getFeed.setData({ userId: user?.id || '', limit: 30 }, updateActivity);
      utils.social.getDiscoverDrives.setData({ userId: user?.id || '', limit: 20 }, updateActivity);
      return { prev, prevDiscover };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.social.getFeed.setData({ userId: user?.id || '', limit: 30 }, ctx.prev);
      if (ctx?.prevDiscover) utils.social.getDiscoverDrives.setData({ userId: user?.id || '', limit: 20 }, ctx.prevDiscover);
    },
  });

  const unrevActivityMutation = trpc.social.unrevActivity.useMutation({
    onMutate: async ({ activityId }) => {
      await utils.social.getFeed.cancel();
      await utils.social.getDiscoverDrives.cancel();
      const prev = utils.social.getFeed.getData({ userId: user?.id || '', limit: 30 });
      const prevDiscover = utils.social.getDiscoverDrives.getData({ userId: user?.id || '', limit: 20 });
      const updateActivity = (old: any[] | undefined) => {
        if (!old) return old;
        return old.map((a: any) => a.id === activityId ? { ...a, isRevved: false, revCount: Math.max(0, a.revCount - 1) } : a);
      };
      utils.social.getFeed.setData({ userId: user?.id || '', limit: 30 }, updateActivity);
      utils.social.getDiscoverDrives.setData({ userId: user?.id || '', limit: 20 }, updateActivity);
      return { prev, prevDiscover };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.social.getFeed.setData({ userId: user?.id || '', limit: 30 }, ctx.prev);
      if (ctx?.prevDiscover) utils.social.getDiscoverDrives.setData({ userId: user?.id || '', limit: 20 }, ctx.prevDiscover);
    },
  });

  const handleRefresh = useCallback(() => {
    void feedQuery.refetch();
    void postsQuery.refetch();
    void followCountsQuery.refetch();
    void unreadCountQuery.refetch();
    if (activeTab === 'discover') {
      void discoverDrivesQuery.refetch();
      void discoverPostsQuery.refetch();
    }
  }, [feedQuery, postsQuery, followCountsQuery, unreadCountQuery, activeTab, discoverDrivesQuery, discoverPostsQuery]);

  const handleUserPress = useCallback((userId: string) => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/user-profile', params: { userId } });
  }, [router]);

  const requireAuth = useCallback((feature: string, action: () => void) => {
    if (!user?.id) {
      setAuthGateFeature(feature);
      setShowAuthGate(true);
      return;
    }
    action();
  }, [user?.id]);

  const handleOpenComments = useCallback((postId: string) => {
    if (!user?.id) {
      setAuthGateFeature('comment on posts and interact with drivers');
      setShowAuthGate(true);
      return;
    }
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCommentsPostId(postId);
  }, [user?.id]);

  const handleRevPress = useCallback((postId: string, isRevved: boolean) => {
    if (!user?.id) {
      setAuthGateFeature('rev posts and interact with drivers');
      setShowAuthGate(true);
      return;
    }
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isRevved) {
      unrevPostMutation.mutate({ postId, userId: user.id });
    } else {
      revPostMutation.mutate({ postId, userId: user.id });
    }
  }, [user?.id, revPostMutation, unrevPostMutation]);

  const handleActivityRevPress = useCallback((activityId: string, isRevved: boolean) => {
    if (!user?.id) {
      setAuthGateFeature('rev drives and interact with drivers');
      setShowAuthGate(true);
      return;
    }
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isRevved) {
      unrevActivityMutation.mutate({ activityId, userId: user.id });
    } else {
      revActivityMutation.mutate({ activityId, userId: user.id });
    }
  }, [user?.id, revActivityMutation, unrevActivityMutation]);

  const handleFollowFromDiscover = useCallback((targetUserId: string) => {
    if (!user?.id) {
      setAuthGateFeature('follow drivers and build your community');
      setShowAuthGate(true);
      return;
    }
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    followMutation.mutate({ followerId: user.id, followingId: targetUserId });
  }, [user?.id, followMutation]);

  const toggleSearch = useCallback(() => {
    setIsSearching(prev => !prev);
    setSearchQuery('');
  }, []);

  const switchTab = useCallback((tab: FeedTab) => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
    const tabValue = tab === 'drives' ? 0 : tab === 'posts' ? 1 : 2;
    Animated.spring(tabIndicatorAnim, {
      toValue: tabValue,
      useNativeDriver: true,
      tension: 300,
      friction: 20,
    }).start();
  }, [tabIndicatorAnim]);

  const drivesFeed = useMemo(() => {
    return (feedQuery.data ?? []).sort((a, b) => b.createdAt - a.createdAt);
  }, [feedQuery.data]);

  const postsFeed = useMemo(() => {
    return (postsQuery.data ?? []).sort((a, b) => b.createdAt - a.createdAt);
  }, [postsQuery.data]);

  const discoverFeed = useMemo((): DiscoverItem[] => {
    const drives: DiscoverItem[] = (discoverDrivesQuery.data ?? []).map((d) => ({
      kind: 'drive' as const,
      data: d,
    }));
    const posts: DiscoverItem[] = (discoverPostsQuery.data ?? []).map((p) => ({
      kind: 'post' as const,
      data: p,
    }));

    const seenIds = new Set<string>();
    const combined: DiscoverItem[] = [];
    for (const item of [...drives, ...posts]) {
      if (!seenIds.has(item.data.id)) {
        seenIds.add(item.data.id);
        combined.push(item);
      }
    }

    combined.sort((a, b) => b.data.createdAt - a.data.createdAt);
    return combined;
  }, [discoverDrivesQuery.data, discoverPostsQuery.data]);

  const renderActivityItem = useCallback((item: FeedItem, showFollowButton?: boolean, animIndex?: number) => {
    const initial = item.userName?.[0]?.toUpperCase() || '?';

    return (
      <AnimatedCard index={animIndex ?? 0} slideDistance={18} duration={300} delay={50}>
      <TouchableOpacity
        style={styles.feedCard}
        onPress={() => handleUserPress(item.userId)}
        activeOpacity={0.7}
      >
        <View style={styles.feedCardHeader}>
          <View style={styles.feedAvatar}>
            {item.userProfilePicture ? (
              <Image source={{ uri: item.userProfilePicture }} style={styles.feedAvatarImage} />
            ) : (
              <Text style={styles.feedAvatarText}>{initial}</Text>
            )}
          </View>
          <View style={styles.feedHeaderInfo}>
            <Text style={styles.feedUserName} numberOfLines={1}>{item.userName}</Text>
            <Text style={styles.feedTime}>{formatTimeAgo(item.createdAt)}</Text>
          </View>
          {showFollowButton && item.userId !== user?.id && (
            <TouchableOpacity
              style={styles.followBadge}
              onPress={(e) => {
                e.stopPropagation?.();
                handleFollowFromDiscover(item.userId);
              }}
              activeOpacity={0.7}
            >
              <UserPlus size={12} color="#fff" />
              <Text style={styles.followBadgeText}>Follow</Text>
            </TouchableOpacity>
          )}
          {!showFollowButton && item.carModel && (
            <View style={styles.feedCarBadge}>
              <Car size={12} color={colors.accent} />
              <Text style={styles.feedCarText} numberOfLines={1}>{item.carModel}</Text>
            </View>
          )}
        </View>

        {showFollowButton && item.carModel && (
          <View style={[styles.feedCardBody, { paddingTop: 0 }]}>
            <View style={[styles.feedCarBadge, { alignSelf: 'flex-start' as const, marginBottom: 6 }]}>
              <Car size={12} color={colors.accent} />
              <Text style={styles.feedCarText} numberOfLines={1}>{item.carModel}</Text>
            </View>
          </View>
        )}

        <View style={styles.feedCardBody}>
          <Text style={styles.feedActivityText}>Logged a drive</Text>
          {(item.city || item.country) && (
            <View style={styles.feedLocationRow}>
              <MapPin size={12} color={colors.textLight} />
              <Text style={styles.feedLocationText}>
                {item.city}{item.city && item.country ? ', ' : ''}{item.country}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.feedStatsRow}>
          <View style={styles.feedStatItem}>
            <Zap size={14} color={colors.warning} />
            <Text style={styles.feedStatValue}>{Math.round(convertSpeed(item.topSpeed))}</Text>
            <Text style={styles.feedStatUnit}>{getSpeedLabel()}</Text>
          </View>
          <View style={styles.feedStatDivider} />
          <View style={styles.feedStatItem}>
            <Navigation size={14} color={colors.accent} />
            <Text style={styles.feedStatValue}>{convertDistance(item.distance).toFixed(1)}</Text>
            <Text style={styles.feedStatUnit}>{getDistanceLabel()}</Text>
          </View>
          <View style={styles.feedStatDivider} />
          <View style={styles.feedStatItem}>
            <Clock size={14} color={colors.primary} />
            <Text style={styles.feedStatValue}>{formatDuration(item.duration)}</Text>
          </View>
        </View>

        {item.userId !== user?.id && (
          <View style={styles.postFooter}>
            <TouchableOpacity
              style={[styles.revButton, item.isRevved && styles.revButtonActive]}
              onPress={() => handleActivityRevPress(item.id, item.isRevved)}
              activeOpacity={0.7}
              testID={`activity-rev-button-${item.id}`}
            >
              <Gauge size={16} color={item.isRevved ? colors.accent : colors.textLight} />
              <Text style={[styles.revCount, item.isRevved && styles.revCountActive]}>
                {item.revCount}
              </Text>
              <Text style={[styles.revLabel, item.isRevved && styles.revLabelActive]}>
                {item.revCount === 1 ? 'rev' : 'revs'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
      </AnimatedCard>
    );
  }, [styles, colors, convertSpeed, convertDistance, getSpeedLabel, getDistanceLabel, handleUserPress, handleActivityRevPress, handleFollowFromDiscover, user?.id]);

  const renderPostItem = useCallback((item: PostItem, showFollowButton?: boolean, animIndex?: number) => {
    const initial = item.userName?.[0]?.toUpperCase() || '?';
    const carDisplay = item.userCarBrand
      ? `${item.userCarBrand}${item.userCarModel ? ` ${item.userCarModel}` : ''}`
      : null;

    return (
      <AnimatedCard index={animIndex ?? 0} slideDistance={18} duration={300} delay={50}>
      <View style={styles.feedCard}>
        <TouchableOpacity
          style={styles.feedCardHeader}
          onPress={() => handleUserPress(item.userId)}
          activeOpacity={0.7}
        >
          <View style={styles.feedAvatar}>
            {item.userProfilePicture ? (
              <Image source={{ uri: item.userProfilePicture }} style={styles.feedAvatarImage} />
            ) : (
              <Text style={styles.feedAvatarText}>{initial}</Text>
            )}
          </View>
          <View style={styles.feedHeaderInfo}>
            <Text style={styles.feedUserName} numberOfLines={1}>{item.userName}</Text>
            <Text style={styles.feedTime}>{formatTimeAgo(item.createdAt)}</Text>
          </View>
          {showFollowButton && item.userId !== user?.id ? (
            <TouchableOpacity
              style={styles.followBadge}
              onPress={() => handleFollowFromDiscover(item.userId)}
              activeOpacity={0.7}
            >
              <UserPlus size={12} color="#fff" />
              <Text style={styles.followBadgeText}>Follow</Text>
            </TouchableOpacity>
          ) : carDisplay ? (
            <View style={styles.feedCarBadge}>
              <Car size={12} color={colors.accent} />
              <Text style={styles.feedCarText} numberOfLines={1}>{carDisplay}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {showFollowButton && carDisplay && (
          <View style={[styles.postTextContainer, { paddingBottom: 4 }]}>
            <View style={[styles.feedCarBadge, { alignSelf: 'flex-start' as const }]}>
              <Car size={12} color={colors.accent} />
              <Text style={styles.feedCarText} numberOfLines={1}>{carDisplay}</Text>
            </View>
          </View>
        )}

        {item.text ? (
          <View style={styles.postTextContainer}>
            <Text style={styles.postText}>{item.text}</Text>
          </View>
        ) : null}

        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.postImage} resizeMode="cover" />
        ) : null}

        <View style={styles.postFooter}>
          <TouchableOpacity
            style={[styles.revButton, item.isRevved && styles.revButtonActive]}
            onPress={() => handleRevPress(item.id, item.isRevved)}
            activeOpacity={0.7}
            testID={`rev-button-${item.id}`}
          >
            <Gauge size={16} color={item.isRevved ? colors.accent : colors.textLight} />
            <Text style={[styles.revCount, item.isRevved && styles.revCountActive]}>
              {item.revCount}
            </Text>
            <Text style={[styles.revLabel, item.isRevved && styles.revLabelActive]}>
              {item.revCount === 1 ? 'rev' : 'revs'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.commentButton}
            onPress={() => handleOpenComments(item.id)}
            activeOpacity={0.7}
            testID={`comment-button-${item.id}`}
          >
            <MessageCircle size={16} color={colors.textLight} />
            <Text style={styles.commentCount}>
              {commentCounts[item.id] || 0}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      </AnimatedCard>
    );
  }, [styles, colors, handleUserPress, handleRevPress, handleOpenComments, handleFollowFromDiscover, user?.id, commentCounts]);

  const renderDriveItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
    return renderActivityItem(item, false, index);
  }, [renderActivityItem]);

  const renderPostFeedItem = useCallback(({ item, index }: { item: PostItem; index: number }) => {
    return renderPostItem(item, false, index);
  }, [renderPostItem]);

  const renderDiscoverItem = useCallback(({ item, index }: { item: DiscoverItem; index: number }) => {
    if (item.kind === 'drive') {
      return renderActivityItem(item.data, true, index);
    }
    return renderPostItem(item.data, true, index);
  }, [renderActivityItem, renderPostItem]);

  const renderSearchResult = useCallback(({ item }: { item: SearchUser }) => {
    const carDisplay = item.carBrand
      ? `${item.carBrand}${item.carModel ? ` ${item.carModel}` : ''}`
      : null;

    return (
      <TouchableOpacity
        style={styles.searchResultItem}
        onPress={() => {
          handleUserPress(item.id);
          setIsSearching(false);
          setSearchQuery('');
        }}
        activeOpacity={0.7}
      >
        <View style={styles.searchAvatar}>
          <Text style={styles.searchAvatarText}>{item.displayName[0].toUpperCase()}</Text>
        </View>
        <View style={styles.searchResultInfo}>
          <Text style={styles.searchResultName} numberOfLines={1}>{item.displayName}</Text>
          {carDisplay && (
            <Text style={styles.searchResultCar} numberOfLines={1}>{carDisplay}</Text>
          )}
          {(item.city || item.country) && (
            <Text style={styles.searchResultLocation} numberOfLines={1}>
              {item.city}{item.city && item.country ? ', ' : ''}{item.country}
            </Text>
          )}
        </View>
        <UserPlus size={18} color={colors.textLight} />
      </TouchableOpacity>
    );
  }, [styles, colors, handleUserPress]);

  const emptyDrives = useMemo(() => (
    <View style={styles.emptyContainer}>
      <Navigation size={48} color={colors.textLight} />
      <Text style={styles.emptyTitle}>No drives yet</Text>
      <Text style={styles.emptySubtext}>
        Follow other drivers to see their drives here
      </Text>
      <TouchableOpacity
        style={styles.emptySearchButton}
        onPress={toggleSearch}
        activeOpacity={0.7}
      >
        <Search size={16} color="#fff" />
        <Text style={styles.emptySearchButtonText}>Find Drivers</Text>
      </TouchableOpacity>
    </View>
  ), [styles, colors, toggleSearch]);

  const emptyPosts = useMemo(() => (
    <View style={styles.emptyContainer}>
      <Users size={48} color={colors.textLight} />
      <Text style={styles.emptyTitle}>No posts yet</Text>
      <Text style={styles.emptySubtext}>
        Follow other drivers or create a post
      </Text>
      <TouchableOpacity
        style={styles.emptySearchButton}
        onPress={() => requireAuth('create posts and share with the community', () => router.push('/create-post' as any))}
        activeOpacity={0.7}
      >
        <Plus size={16} color="#fff" />
        <Text style={styles.emptySearchButtonText}>Create Post</Text>
      </TouchableOpacity>
    </View>
  ), [styles, colors, requireAuth, router]);

  const emptyDiscover = useMemo(() => (
    <View style={styles.emptyContainer}>
      <Compass size={48} color={colors.textLight} />
      <Text style={styles.emptyTitle}>Nothing to discover</Text>
      <Text style={styles.emptySubtext}>
        Check back later for new drivers and content to explore
      </Text>
    </View>
  ), [styles, colors]);

  const unreadCount = unreadCountQuery.data?.count ?? 0;
  const discoverLoading = discoverDrivesQuery.isLoading || discoverPostsQuery.isLoading;
  const discoverRefetching = discoverDrivesQuery.isRefetching || discoverPostsQuery.isRefetching;

  const tabIndicatorLeft = useMemo(() => {
    if (activeTab === 'drives') return '0%' as const;
    if (activeTab === 'posts') return '33.33%' as const;
    return '66.66%' as const;
  }, [activeTab]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <View style={styles.headerRight}>
<TouchableOpacity
            style={styles.bellButton}
            onPress={() => router.push('/notifications' as any)}
            activeOpacity={0.7}
            testID="notifications-button"
          >
            <Bell size={20} color={colors.text} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.searchToggle, isSearching && styles.searchToggleActive]}
            onPress={toggleSearch}
            activeOpacity={0.7}
          >
            {isSearching ? <X size={18} color={colors.text} /> : <Search size={18} color={colors.text} />}
          </TouchableOpacity>
        </View>
      </View>

      {isSearching && (
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Search size={16} color={colors.textLight} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search drivers..."
              placeholderTextColor={colors.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              testID="search-input"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={colors.textLight} />
              </TouchableOpacity>
            )}
          </View>
          {searchQuery.length >= 2 && (
            <FlatList
              data={searchUsersQuery.data ?? []}
              renderItem={renderSearchResult}
              keyExtractor={(item) => item.id}
              style={styles.searchResults}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                searchUsersQuery.isLoading ? (
                  <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 20 }} />
                ) : (
                  <Text style={styles.searchNoResults}>No drivers found</Text>
                )
              }
            />
          )}
        </View>
      )}

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'drives' && styles.tabItemActive]}
          onPress={() => switchTab('drives')}
          activeOpacity={0.7}
          testID="tab-drives"
        >
          <Navigation size={14} color={activeTab === 'drives' ? colors.accent : colors.textLight} />
          <Text style={[styles.tabText, activeTab === 'drives' && styles.tabTextActive]}>Drives</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'posts' && styles.tabItemActive]}
          onPress={() => switchTab('posts')}
          activeOpacity={0.7}
          testID="tab-posts"
        >
          <Users size={14} color={activeTab === 'posts' ? colors.accent : colors.textLight} />
          <Text style={[styles.tabText, activeTab === 'posts' && styles.tabTextActive]}>Posts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'discover' && styles.tabItemActive]}
          onPress={() => switchTab('discover')}
          activeOpacity={0.7}
          testID="tab-discover"
        >
          <Compass size={14} color={activeTab === 'discover' ? colors.accent : colors.textLight} />
          <Text style={[styles.tabText, activeTab === 'discover' && styles.tabTextActive]}>Discover</Text>
        </TouchableOpacity>
        <Animated.View
          style={[
            styles.tabIndicator,
            {
              left: tabIndicatorLeft,
              width: '33.33%' as const,
            },
          ]}
        />
      </View>

      {activeTab === 'drives' ? (
        feedQuery.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={drivesFeed}
            renderItem={renderDriveItem}
            keyExtractor={(item) => `drive_${item.id}`}
            contentContainerStyle={[
              styles.feedList,
              drivesFeed.length === 0 && styles.feedListEmpty,
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={feedQuery.isRefetching}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
              />
            }
            ListEmptyComponent={emptyDrives}
          />
        )
      ) : activeTab === 'posts' ? (
        postsQuery.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={postsFeed}
            renderItem={renderPostFeedItem}
            keyExtractor={(item) => `post_${item.id}`}
            contentContainerStyle={[
              styles.feedList,
              postsFeed.length === 0 && styles.feedListEmpty,
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
        )
      ) : (
        discoverLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={discoverFeed}
            renderItem={renderDiscoverItem}
            keyExtractor={(item) => `discover_${item.kind}_${item.data.id}`}
            contentContainerStyle={[
              styles.feedList,
              discoverFeed.length === 0 && styles.feedListEmpty,
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={discoverRefetching}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
              />
            }
            ListEmptyComponent={emptyDiscover}
          />
        )
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => requireAuth('create posts and share with the community', () => router.push('/create-post' as any))}
        activeOpacity={0.8}
        testID="create-post-fab"
      >
        <Plus size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {commentsPostId && (
        <CommentsModal
          visible={!!commentsPostId}
          onClose={() => setCommentsPostId(null)}
          postId={commentsPostId}
          userId={user?.id || ''}
          colors={colors}
        />
      )}

      <AuthGate
        visible={showAuthGate}
        onClose={() => setShowAuthGate(false)}
        feature={authGateFeature}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerStats: {
    alignItems: 'center',
  },
  headerStatValue: {
    fontSize: 14,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  headerStatLabel: {
    fontSize: 9,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    fontSize: 10,
    fontFamily: 'Orbitron_700Bold',
    color: '#FFFFFF',
  },
  searchToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchToggleActive: {
    backgroundColor: colors.accent + '20',
    borderColor: colors.accent,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: 350,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontFamily: 'Orbitron_400Regular',
    padding: 0,
  },
  searchResults: {
    marginTop: 12,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardLight,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchAvatarText: {
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    color: colors.accent,
  },
  searchResultInfo: {
    flex: 1,
    gap: 2,
  },
  searchResultName: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  searchResultCar: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.accent,
  },
  searchResultLocation: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  searchNoResults: {
    textAlign: 'center' as const,
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 90,
  },
  feedListEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  feedCard: {
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingBottom: 10,
    gap: 10,
  },
  feedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.accent + '40',
    overflow: 'hidden',
  },
  feedAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  feedAvatarText: {
    fontSize: 15,
    fontFamily: 'Orbitron_700Bold',
    color: colors.accent,
  },
  feedHeaderInfo: {
    flex: 1,
  },
  feedUserName: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  feedTime: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 2,
  },
  feedCarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent + '12',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: 130,
  },
  feedCarText: {
    fontSize: 10,
    fontFamily: 'Orbitron_500Medium',
    color: colors.accent,
  },
  feedCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  feedActivityText: {
    fontSize: 13,
    fontFamily: 'Orbitron_500Medium',
    color: colors.text,
    marginBottom: 4,
  },
  feedLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedLocationText: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  feedStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.background,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  feedStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  feedStatValue: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  feedStatUnit: {
    fontSize: 9,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  feedStatDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.border,
  },
  postTextContainer: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  postText: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.text,
    lineHeight: 22,
  },
  postImage: {
    width: '100%',
    height: 280,
  },
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 5,
  },
  tabItemActive: {
    backgroundColor: colors.accent + '12',
  },
  tabText: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
  },
  tabTextActive: {
    color: colors.accent,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 3,
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
  revButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: colors.background,
  },
  revButtonActive: {
    backgroundColor: colors.accent + '18',
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  revCount: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
  },
  revCountActive: {
    color: colors.accent,
  },
  revLabel: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  revLabelActive: {
    color: colors.accent,
  },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: colors.background,
  },
  commentCount: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
  },
  followBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  followBadgeText: {
    fontSize: 11,
    fontFamily: 'Orbitron_600SemiBold',
    color: '#FFFFFF',
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
  emptySearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
  },
  emptySearchButtonText: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: '#FFFFFF',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});
