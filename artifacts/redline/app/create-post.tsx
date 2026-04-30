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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ImagePlus, X, Send, ArrowLeft } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';
import { trpc } from '@/lib/trpc';
import { uploadPostImage } from '@/lib/imageUpload';
import { ThemeColors } from '@/constants/colors';

export default function CreatePostScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { colors } = useSettings();
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const utils = trpc.useUtils();

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
      });
    } catch (error) {
      console.error('[CREATE_POST] Submit error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  }, [user?.id, text, imageUri, createPostMutation]);

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
                <Image
                  source={{ uri: user.profilePicture }}
                  style={styles.avatarImage}
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
          </View>

          <Text style={styles.charCount}>{text.length}/500</Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
    toolbar: {
      flexDirection: 'row',
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
  });
