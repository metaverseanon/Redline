import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Platform,
  Image,
  Animated,
  Keyboard,
} from 'react-native';
import { X, Send, Trash2, MessageCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { trpc } from '@/lib/trpc';
import { ThemeColors } from '@/constants/colors';

interface CommentsModalProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
  userId: string;
  colors: ThemeColors;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CommentsModal({ visible, onClose, postId, userId, colors }: CommentsModalProps) {
  const insets = useSafeAreaInsets();
  const [commentText, setCommentText] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const utils = trpc.useUtils();

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const commentsQuery = trpc.posts.getComments.useQuery(
    { postId },
    { enabled: visible && !!postId }
  );

  const addCommentMutation = trpc.posts.addComment.useMutation({
    onSuccess: () => {
      setCommentText('');
      Keyboard.dismiss();
      void utils.posts.getComments.invalidate({ postId });
      void utils.posts.getCommentCount.invalidate();
    },
  });

  const deleteCommentMutation = trpc.posts.deleteComment.useMutation({
    onSuccess: () => {
      void utils.posts.getComments.invalidate({ postId });
      void utils.posts.getCommentCount.invalidate();
    },
  });

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 200,
        friction: 25,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, slideAnim]);

  const handleSubmit = useCallback(() => {
    const trimmed = commentText.trim();
    if (!trimmed || !userId) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addCommentMutation.mutate({ postId, userId, text: trimmed });
  }, [commentText, userId, postId, addCommentMutation]);

  const handleDelete = useCallback((commentId: string) => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteCommentMutation.mutate({ commentId, userId });
  }, [userId, deleteCommentMutation]);

  const comments = commentsQuery.data ?? [];

  const renderComment = useCallback(({ item }: { item: typeof comments[0] }) => {
    const initial = item.userName?.[0]?.toUpperCase() || '?';
    const isOwn = item.userId === userId;

    return (
      <Animated.View style={styles.commentItem}>
        <View style={styles.commentAvatar}>
          {item.userProfilePicture ? (
            <Image source={{ uri: item.userProfilePicture }} style={styles.commentAvatarImage} />
          ) : (
            <Text style={styles.commentAvatarText}>{initial}</Text>
          )}
        </View>
        <View style={styles.commentContent}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentUserName} numberOfLines={1}>{item.userName}</Text>
            <Text style={styles.commentTime}>{formatTimeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.commentText}>{item.text}</Text>
        </View>
        {isOwn && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item.id)}
            activeOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Trash2 size={14} color={colors.danger} />
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  }, [styles, colors, userId, handleDelete]);

  const canSend = commentText.trim().length > 0 && !addCommentMutation.isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.handleBar}>
          <View style={styles.handle} />
        </View>

        <View style={styles.header}>
          <MessageCircle size={20} color={colors.text} />
          <Text style={styles.headerTitle}>Comments</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <X size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {commentsQuery.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MessageCircle size={40} color={colors.textLight} />
            <Text style={styles.emptyTitle}>No comments yet</Text>
            <Text style={styles.emptySubtext}>Be the first to comment</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            renderItem={renderComment}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.commentsList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View style={[styles.inputContainer, { paddingBottom: keyboardHeight > 0 ? 10 : Math.max(insets.bottom, 10), marginBottom: keyboardHeight > 0 ? keyboardHeight : 0 }]}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Write a comment..."
            placeholderTextColor={colors.textLight}
            value={commentText}
            onChangeText={setCommentText}
            maxLength={500}
            multiline
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
            blurOnSubmit
            testID="comment-input"
          />
          <TouchableOpacity
            style={[styles.sendButton, canSend && styles.sendButtonActive]}
            onPress={handleSubmit}
            disabled={!canSend}
            activeOpacity={0.7}
            testID="send-comment-button"
          >
            {addCommentMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={18} color={canSend ? '#fff' : colors.textLight} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(CommentsModal);

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  handleBar: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  commentsList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent + '30',
    overflow: 'hidden',
  },
  commentAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  commentAvatarText: {
    fontSize: 13,
    fontFamily: 'Orbitron_700Bold',
    color: colors.accent,
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  commentUserName: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
    flexShrink: 1,
  },
  commentTime: {
    fontSize: 10,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  commentText: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.text,
    lineHeight: 19,
  },
  deleteButton: {
    padding: 6,
    marginTop: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardLight,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
