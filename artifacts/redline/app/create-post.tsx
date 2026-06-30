import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { ImagePlus, X, Send, ArrowLeft, Music, AtSign, Search, Check } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';
import { trpc } from '@/lib/trpc';
import { uploadPostImage } from '@/lib/imageUpload';
import { ThemeColors } from '@/constants/colors';
import { Soundtrack } from '@/types/trip';
import TrackPickerModal from '@/components/TrackPickerModal';
import SoundtrackBadge from '@/components/SoundtrackBadge';
import ProBadge from '@/components/ProBadge';
import { useSubscription } from '@/lib/revenuecat';

export default function CreatePostScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { colors } = useSettings();
  const { isSubscribed, presentPaywall, getLastPaywallError } = useSubscription();
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [soundtrack, setSoundtrack] = useState<Soundtrack | null>(null);
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [taggedUsers, setTaggedUsers] = useState<{ id: string; name: string }[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagQuery, setTagQuery] = useState('');

  const styles = useMemo(() => createStyles(colors), [colors]);
  const utils = trpc.useUtils();

  const tagSearchQuery = trpc.social.searchUsers.useQuery(
    { query: tagQuery, currentUserId: user?.id || '' },
    { enabled: !!user?.id && showTagPicker && tagQuery.trim().length >= 2 },
  );

  const toggleTaggedUser = useCallback((u: { id: string; name: string }) => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTaggedUsers((prev) =>
      prev.some((t) => t.id === u.id)
        ? prev.filter((t) => t.id !== u.id)
        : prev.length >= 20
          ? prev
          : [...prev, u],
    );
  }, []);

  const removeTaggedUser = useCallback((id: string) => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTaggedUsers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const createPostMutation = trpc.posts.createPost.useMutation({
    onSuccess: (data) => {
      console.log('[CREATE_POST] Post created successfully, data:', JSON.stringify(data));
      if (data?.success) {
        void utils.posts.getFeedPosts.invalidate();
        void utils.posts.getUserPosts.invalidate();
        if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } else {
        console.error('[CREATE_POST] Post creation returned unsuccessful');
        Alert.alert('Error', 'Failed to create post. Please try again.');
        setIsSubmitting(false);
      }
    },
    onError: (error) => {
      console.error('[CREATE_POST] Mutation error:', error.message, error);
      Alert.alert('Error', error.message || 'Failed to create post. Please try again.');
      setIsSubmitting(false);
    },
  });

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error('[CREATE_POST] Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  }, []);

  const removeImage = useCallback(() => {
    setImageUri(null);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const removeSoundtrack = useCallback(() => {
    setSoundtrack(null);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleAddSoundtrack = useCallback(async () => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isSubscribed) {
      try {
        const result = await presentPaywall('create_post_soundtrack');
        if (result === 'not_presented' || result === 'error') {
          const reason = getLastPaywallError?.();
          Alert.alert(
            'Drive Soundtrack',
            reason ?? 'The upgrade screen could not be opened right now. Please try again in a moment.',
          );
        }
      } catch (e: any) {
        Alert.alert('Drive Soundtrack', `The upgrade screen could not be opened: ${e?.message ?? 'unknown error'}`);
      }
      return;
    }
    setShowTrackPicker(true);
  }, [isSubscribed, presentPaywall, getLastPaywallError]);

  const handleSubmit = useCallback(async () => {
    if (!user?.id) return;
    if (!text.trim() && !imageUri) {
      Alert.alert('Empty Post', 'Add some text or an image to your post.');
      return;
    }

    setIsSubmitting(true);
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let uploadedImageUrl: string | undefined;
      if (imageUri) {
        console.log('[CREATE_POST] Uploading image directly to Supabase Storage...');
        console.log('[CREATE_POST] Image URI:', imageUri.substring(0, 80));

        const postId = Date.now().toString();

        try {
          const url = await uploadPostImage(imageUri, user.id, postId);
          if (url) {
            uploadedImageUrl = url;
            console.log('[CREATE_POST] Image uploaded:', url.substring(0, 80));
          } else {
            console.error('[CREATE_POST] Direct upload returned null');
            Alert.alert('Upload Failed', 'Could not upload image. Please try again.');
            setIsSubmitting(false);
            return;
          }
        } catch (uploadError: any) {
          console.error('[CREATE_POST] Upload error:', uploadError);
          Alert.alert('Upload Failed', uploadError?.message || 'Could not upload image. Try again.');
          setIsSubmitting(false);
          return;
        }
      }

      createPostMutation.mutate({
        userId: user.id,
        text: text.trim() || undefined,
        imageUrl: uploadedImageUrl,
        soundtrack: soundtrack ?? undefined,
        taggedUsers: taggedUsers.length > 0 ? taggedUsers : undefined,
      });
    } catch (error) {
      console.error('[CREATE_POST] Submit error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  }, [user?.id, text, imageUri, soundtrack, taggedUsers, createPostMutation]);

  const canSubmit = (text.trim().length > 0 || !!imageUri) && !isSubmitting;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'New Post',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              activeOpacity={0.7}
              testID="back-button"
            >
              <ArrowLeft size={22} color={colors.text} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[styles.postButton, !canSubmit && styles.postButtonDisabled]}
              activeOpacity={0.7}
              testID="submit-post-button"
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Send size={16} color="#FFFFFF" />
                  <Text style={styles.postButtonText}>Post</Text>
                </>
              )}
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              {user?.profilePicture && !avatarError ? (
                <ExpoImage
                  source={{ uri: user.profilePicture }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={150}
                  onError={() => {
                    console.log('[CREATE_POST] Avatar image failed to load:', user.profilePicture);
                    setAvatarError(true);
                  }}
                />
              ) : (
                <Text style={styles.avatarText}>{user?.displayName?.[0]?.toUpperCase() || '?'}</Text>
              )}
            </View>
            <Text style={styles.userName}>{user?.displayName || 'You'}</Text>
          </View>

          <TextInput
            style={styles.textInput}
            placeholder="Show off your ride..."
            placeholderTextColor={colors.textLight}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            autoFocus
            textAlignVertical="top"
            testID="post-text-input"
          />

          {imageUri ? (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={removeImage}
                activeOpacity={0.7}
              >
                <X size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : null}

          {soundtrack ? (
            <View style={styles.soundtrackContainer}>
              <SoundtrackBadge soundtrack={soundtrack} onRemove={removeSoundtrack} />
            </View>
          ) : null}

          {taggedUsers.length > 0 ? (
            <View style={styles.tagChipsRow}>
              {taggedUsers.map((u) => (
                <View key={u.id} style={styles.tagChip}>
                  <AtSign size={12} color={colors.accent} />
                  <Text style={styles.tagChipText} numberOfLines={1}>{u.name}</Text>
                  <TouchableOpacity onPress={() => removeTaggedUser(u.id)} hitSlop={8}>
                    <X size={13} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.toolbar}>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={pickImage}
              activeOpacity={0.7}
              testID="pick-image-button"
            >
              <ImagePlus size={22} color={colors.accent} />
              <Text style={styles.toolbarButtonText}>Add Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => { void handleAddSoundtrack(); }}
              activeOpacity={0.7}
              testID="add-soundtrack-button"
            >
              <Music size={22} color={colors.accent} />
              <Text style={styles.toolbarButtonText}>{soundtrack ? 'Change Song' : 'Add Song'}</Text>
              {!isSubscribed && <ProBadge size="sm" />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => {
                if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowTagPicker(true);
              }}
              activeOpacity={0.7}
              testID="tag-people-button"
            >
              <AtSign size={22} color={colors.accent} />
              <Text style={styles.toolbarButtonText}>
                {taggedUsers.length > 0 ? `Tagged (${taggedUsers.length})` : 'Tag People'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.charCount}>{text.length}/500</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <TrackPickerModal
        visible={showTrackPicker}
        onClose={() => setShowTrackPicker(false)}
        onSelect={(track) => setSoundtrack(track)}
      />

      <Modal
        visible={showTagPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTagPicker(false)}
      >
        <View style={styles.tagModalOverlay}>
          <View style={styles.tagModalSheet}>
            <View style={styles.tagModalHeader}>
              <Text style={styles.tagModalTitle}>Tag People</Text>
              <TouchableOpacity
                onPress={() => { setShowTagPicker(false); setTagQuery(''); }}
                style={styles.tagModalClose}
                activeOpacity={0.7}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.tagSearchWrapper}>
              <Search size={18} color={colors.textLight} />
              <TextInput
                style={styles.tagSearchInput}
                placeholder="Search drivers..."
                placeholderTextColor={colors.textLight}
                value={tagQuery}
                onChangeText={setTagQuery}
                autoCapitalize="none"
                autoCorrect={false}
                testID="tag-search-input"
              />
              {tagQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setTagQuery('')} hitSlop={8}>
                  <X size={16} color={colors.textLight} />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView style={styles.tagResults} keyboardShouldPersistTaps="handled">
              {tagQuery.trim().length < 2 ? (
                <Text style={styles.tagHint}>Type at least 2 characters to search.</Text>
              ) : tagSearchQuery.isLoading ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
              ) : (tagSearchQuery.data ?? []).length === 0 ? (
                <Text style={styles.tagHint}>No drivers found.</Text>
              ) : (
                (tagSearchQuery.data ?? []).map((u) => {
                  const selected = taggedUsers.some((t) => t.id === u.id);
                  const name = u.displayName?.trim() || 'Driver';
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.tagResultItem}
                      onPress={() => toggleTaggedUser({ id: u.id, name })}
                      activeOpacity={0.7}
                    >
                      <View style={styles.tagResultAvatar}>
                        <Text style={styles.tagResultAvatarText}>{name[0]?.toUpperCase() || '?'}</Text>
                      </View>
                      <View style={styles.tagResultInfo}>
                        <Text style={styles.tagResultName} numberOfLines={1}>{name}</Text>
                        {(u.carBrand || u.carModel) ? (
                          <Text style={styles.tagResultCar} numberOfLines={1}>
                            {[u.carBrand, u.carModel].filter(Boolean).join(' ')}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[styles.tagCheck, selected && styles.tagCheckActive]}>
                        {selected ? <Check size={14} color="#FFFFFF" /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.tagDoneButton}
              onPress={() => { setShowTagPicker(false); setTagQuery(''); }}
              activeOpacity={0.8}
            >
              <Text style={styles.tagDoneButtonText}>
                {taggedUsers.length > 0 ? `Done · ${taggedUsers.length} tagged` : 'Done'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
    },
    backButton: {
      padding: 4,
      marginRight: 8,
    },
    postButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.accent,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    postButtonDisabled: {
      opacity: 0.4,
    },
    postButtonText: {
      fontSize: 14,
      fontFamily: 'Orbitron_600SemiBold',
      color: '#FFFFFF',
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent + '20',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.accent + '40',
      overflow: 'hidden',
    },
    avatarImage: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    avatarText: {
      fontSize: 18,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
    userName: {
      fontSize: 16,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
    },
    textInput: {
      fontSize: 16,
      color: colors.text,
      minHeight: 100,
      fontFamily: 'Orbitron_400Regular',
      lineHeight: 24,
      padding: 0,
    },
    imagePreviewContainer: {
      marginTop: 16,
      borderRadius: 16,
      overflow: 'hidden',
      position: 'relative',
    },
    imagePreview: {
      width: '100%',
      height: 260,
      borderRadius: 16,
    },
    removeImageButton: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    soundtrackContainer: {
      marginTop: 16,
    },
    toolbar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 20,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    toolbarButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.accent + '12',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
    },
    toolbarButtonText: {
      fontSize: 14,
      fontFamily: 'Orbitron_500Medium',
      color: colors.accent,
    },
    charCount: {
      fontSize: 12,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      textAlign: 'right' as const,
      marginTop: 12,
    },
    tagChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 16,
    },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.accent + '18',
      borderWidth: 1,
      borderColor: colors.accent + '40',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      maxWidth: 180,
    },
    tagChipText: {
      fontSize: 12,
      fontFamily: 'Orbitron_500Medium',
      color: colors.accent,
      flexShrink: 1,
    },
    tagModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    tagModalSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 28,
      maxHeight: '80%',
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    tagModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    tagModalTitle: {
      fontSize: 18,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
    },
    tagModalClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.cardLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tagSearchWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.cardLight,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tagSearchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      fontFamily: 'Orbitron_400Regular',
      padding: 0,
    },
    tagResults: {
      marginTop: 12,
    },
    tagHint: {
      textAlign: 'center' as const,
      fontSize: 13,
      fontFamily: 'Orbitron_400Regular',
      color: colors.textLight,
      marginTop: 24,
    },
    tagResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
    },
    tagResultAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent + '20',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    tagResultAvatarText: {
      fontSize: 16,
      fontFamily: 'Orbitron_700Bold',
      color: colors.accent,
    },
    tagResultInfo: {
      flex: 1,
      gap: 2,
    },
    tagResultName: {
      fontSize: 14,
      fontFamily: 'Orbitron_600SemiBold',
      color: colors.text,
    },
    tagResultCar: {
      fontSize: 11,
      fontFamily: 'Orbitron_400Regular',
      color: colors.accent,
    },
    tagCheck: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tagCheckActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    tagDoneButton: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 16,
    },
    tagDoneButtonText: {
      fontSize: 15,
      fontFamily: 'Orbitron_600SemiBold',
      color: '#FFFFFF',
    },
  });
