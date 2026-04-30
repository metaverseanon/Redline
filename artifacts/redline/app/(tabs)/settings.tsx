import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Linking, Image, Switch, Platform, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { router } from 'expo-router';
import { ChevronRight, Gauge, Ruler, FileText, Shield, User, Car, Sun, Moon, HelpCircle, Bell, Mail, MessageSquare, X, Send, Check, Trophy, Instagram, Link2, Unlink, ImageIcon, Share2, Trash2, QrCode, MapPin } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettings, SpeedUnit, DistanceUnit } from '@/providers/SettingsProvider';
import { useUser } from '@/providers/UserProvider';
import { useNotifications } from '@/providers/NotificationProvider';
import { ThemeType } from '@/constants/colors';
import { useAchievements } from '@/providers/AchievementProvider';
import { useState, useEffect } from 'react';
import { trpc, trpcClient } from '@/lib/trpc';
import DailyCard from '@/components/DailyCard';

export default function SettingsScreen() {
  const { settings, colors, setSpeedUnit, setDistanceUnit, setTheme } = useSettings();
  const { user, isAuthenticated, getCarDisplayName, updateSocialAccounts, signOut } = useUser();
  const { notificationsEnabled, registerForPushNotifications, disableNotifications } = useNotifications();
  const { unlockedCount, totalCount } = useAchievements();

  const [isTogglingNotifications, setIsTogglingNotifications] = useState(false);
  const [isTogglingWeeklyRecap, setIsTogglingWeeklyRecap] = useState(false);
  const [weeklyRecapEnabled, setWeeklyRecapEnabled] = useState(true);
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [socialModalVisible, setSocialModalVisible] = useState(false);
  const [socialPlatform, setSocialPlatform] = useState<'instagram' | 'tiktok'>('instagram');
  const [socialUsername, setSocialUsername] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);

  const profileUrl = user?.id ? `https://redlineapp.io/profile/${user.id}` : '';
  const qrCodeUrl = profileUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(profileUrl)}&bgcolor=000000&color=FFFFFF&margin=16` : '';

  const handleShowQR = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setShowQRModal(true);
  };


  const weeklyRecapQuery = trpc.user.getWeeklyRecapEnabled.useQuery(
    { userId: user?.id || '' },
    { enabled: !!user?.id }
  );

  const updateWeeklyRecapMutation = trpc.user.updateWeeklyRecapEnabled.useMutation();

  useEffect(() => {
    if (weeklyRecapQuery.data !== undefined) {
      setWeeklyRecapEnabled(weeklyRecapQuery.data.enabled);
    }
  }, [weeklyRecapQuery.data]);

  const speedOptions: { value: SpeedUnit; label: string }[] = [
    { value: 'kmh', label: 'km/h' },
    { value: 'mph', label: 'mph' },
  ];

  const distanceOptions: { value: DistanceUnit; label: string }[] = [
    { value: 'km', label: 'Kilometers' },
    { value: 'mi', label: 'Miles' },
  ];

  const themeOptions: { value: ThemeType; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ];

  const openPrivacyPolicy = () => {
    void Linking.openURL('https://redlineapp.io/privacy.html');
  };

  const openTermsOfUse = () => {
    void Linking.openURL('https://redlineapp.io/terms.html');
  };

  const openHelpCenter = () => {
    void Linking.openURL('https://redlineapp.io/help.html');
  };

  const sendFeedbackMutation = trpc.user.sendFeedback.useMutation({
    onSuccess: () => {
      Alert.alert('Thank you!', 'Your feedback has been sent successfully.');
      setFeedbackText('');
      setFeedbackModalVisible(false);
    },
    onError: (error: any) => {
      console.error('[SETTINGS] Failed to send feedback:', error);
      Alert.alert('Error', 'Failed to send feedback. Please try again.');
    },
  });

  const handleSendFeedback = () => {
    if (!feedbackText.trim()) {
      Alert.alert('Empty Feedback', 'Please enter your feedback before sending.');
      return;
    }
    sendFeedbackMutation.mutate({
      userId: user?.id || 'anonymous',
      email: user?.email || 'unknown',
      displayName: user?.displayName || 'Anonymous',
      feedback: feedbackText.trim(),
    });
  };

  const handleNotificationToggle = async (value: boolean) => {
    if (Platform.OS === 'web') {
      return;
    }
    
    setIsTogglingNotifications(true);
    try {
      if (value) {
        console.log('[SETTINGS] Enabling notifications...');
        await registerForPushNotifications(user?.id);
        console.log('[SETTINGS] Notifications enabled successfully');
      } else {
        console.log('[SETTINGS] Disabling notifications...');
        await disableNotifications(user?.id);
        console.log('[SETTINGS] Notifications disabled');
      }
    } catch (error: any) {
      console.error('[SETTINGS] Failed to toggle notifications:', error);
      const message = error?.message || String(error) || 'Unknown error';
      
      if (message.includes('not granted') || message.includes('Permission')) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in your device settings.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Error',
          `Failed to enable notifications: ${message}`,
          [{ text: 'OK' }]
        );
      }
    } finally {
      setIsTogglingNotifications(false);
    }
  };

  const openProfile = () => {
    router.push('/profile' as any);
  };

  const openAchievements = () => {
    router.push('/achievements' as any);
  };

  const handleShareProfile = async () => {
    if (!user?.id) return;
    const profileUrl = `https://redlineapp.io/profile/${user.id}`;
    try {
      if (Platform.OS === 'web') {
        try {
          await navigator.clipboard.writeText(profileUrl);
          Alert.alert('Copied!', 'Profile link copied to clipboard.');
        } catch {
          const textArea = document.createElement('textarea');
          textArea.value = profileUrl;
          textArea.style.position = 'fixed';
          textArea.style.left = '-9999px';
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          Alert.alert('Copied!', 'Profile link copied to clipboard.');
        }
      } else {
        await Share.share({
          message: `Check out my RedLine profile: ${profileUrl}`,
          url: profileUrl,
        });
      }
    } catch (error) {
      console.error('[SETTINGS] Failed to share profile:', error);
    }
  };

  const openSocialModal = (platform: 'instagram' | 'tiktok') => {
    setSocialPlatform(platform);
    setSocialUsername(
      platform === 'instagram'
        ? (user?.instagramUsername || '')
        : (user?.tiktokUsername || '')
    );
    setSocialModalVisible(true);
  };

  const handleSaveSocial = async () => {
    const trimmed = socialUsername.trim().replace(/^@/, '');
    if (socialPlatform === 'instagram') {
      void updateSocialAccounts(trimmed || undefined, user?.tiktokUsername);
    } else {
      void updateSocialAccounts(user?.instagramUsername, trimmed || undefined);
    }
    setSocialModalVisible(false);
    setSocialUsername('');
  };

  const handleDisconnectSocial = (platform: 'instagram' | 'tiktok') => {
    if (platform === 'instagram') {
      void updateSocialAccounts(undefined, user?.tiktokUsername);
    } else {
      void updateSocialAccounts(user?.instagramUsername, undefined);
    }
  };

  const handleWeeklyRecapToggle = async (value: boolean) => {
    if (!user?.id) return;
    
    setIsTogglingWeeklyRecap(true);
    setWeeklyRecapEnabled(value);
    
    try {
      await updateWeeklyRecapMutation.mutateAsync({
        userId: user.id,
        enabled: value,
      });
      console.log('[SETTINGS] Weekly recap preference updated to:', value);
    } catch (error) {
      console.error('[SETTINGS] Failed to update weekly recap preference:', error);
      setWeeklyRecapEnabled(!value);
      Alert.alert('Error', 'Failed to update preference. Please try again.');
    } finally {
      setIsTogglingWeeklyRecap(false);
    }
  };



  const carName = getCarDisplayName();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    navHeader: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
      alignItems: 'center' as const,
    },
    navTitle: {
      fontSize: 16,
      fontFamily: 'Orbitron_700Bold',
      color: colors.text,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingTop: 8,
      paddingBottom: 40,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.textLight,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 12,
      marginTop: 8,
    },
    settingsCard: {
      backgroundColor: colors.cardLight,
      borderRadius: 16,
      marginBottom: 24,
      overflow: 'hidden',
    },
    settingItem: {
      padding: 16,
    },
    settingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    settingIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    settingLabel: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.text,
    },
    optionsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    optionButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: colors.background === '#000000' ? '#1C1C1E' : colors.background,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    optionButtonActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    optionText: {
      fontSize: 15,
      fontWeight: '500' as const,
      color: colors.textLight,
    },
    optionTextActive: {
      color: '#FFFFFF',
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 16,
    },
    linkItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
    },
    linkContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 8,
    },
    linkText: {
      fontSize: 16,
      fontWeight: '500' as const,
      color: colors.text,
    },
    footer: {
      alignItems: 'center',
      marginTop: -24,
    },
    footerLogo: {
      width: 144,
      height: 144,
      marginBottom: -36,
    },
    footerText: {
      fontSize: 13,
      fontWeight: '400' as const,
      color: colors.textLight,
    },
    profileItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
    },
    profileContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    avatarContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.cardBackground,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      overflow: 'hidden' as const,
    },
    avatarImage: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.text,
      marginBottom: 2,
    },
    profileEmail: {
      fontSize: 13,
      fontWeight: '400' as const,
      color: colors.textLight,
    },
    carItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    notificationItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
    },
    notificationContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    notificationTextContainer: {
      flex: 1,
    },
    notificationDescription: {
      fontSize: 13,
      fontWeight: '400' as const,
      color: colors.textLight,
      marginTop: 2,
    },
    linkItemDisabled: {
      opacity: 0.5,
    },
    linkTextDisabled: {
      color: colors.textLight,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.cardLight,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.text,
    },
    modalSubtitle: {
      fontSize: 14,
      color: colors.textLight,
      marginBottom: 16,
    },
    feedbackInput: {
      backgroundColor: colors.background === '#000000' ? '#1C1C1E' : colors.background,
      borderRadius: 12,
      padding: 16,
      fontSize: 15,
      color: colors.text,
      minHeight: 140,
      borderWidth: 1,
      borderColor: colors.border,
    },
    charCount: {
      fontSize: 12,
      color: colors.textLight,
      textAlign: 'right' as const,
      marginTop: 6,
      marginBottom: 16,
    },
    sendButton: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonText: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: '#FFFFFF',
    },
    connectBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accent + '14',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    connectBadgeText: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: colors.accent,
    },
    disconnectButton: {
      padding: 8,
    },
    socialInput: {
      backgroundColor: colors.background === '#000000' ? '#1C1C1E' : colors.background,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    socialInputPrefix: {
      fontSize: 14,
      color: colors.textLight,
      marginBottom: 8,
    },
    checkboxList: {
      gap: 4,
    },
    checkboxRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.background === '#000000' ? '#1C1C1E' : colors.background,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: 12,
    },
    checkboxActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkboxLabel: {
      fontSize: 15,
      fontWeight: '500' as const,
      color: colors.text,
    },
    deleteAccountButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#FF3B3040',
      backgroundColor: '#FF3B3010',
      marginBottom: 32,
    },
    deleteAccountText: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: '#FF3B30',
    },
    qrModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    qrModalContent: {
      backgroundColor: colors.cardLight,
      borderRadius: 24,
      padding: 28,
      alignItems: 'center' as const,
      width: '85%',
      maxWidth: 360,
    },
    qrModalHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      width: '100%',
      marginBottom: 20,
    },
    qrModalTitle: {
      fontSize: 18,
      fontWeight: '700' as const,
      color: colors.text,
    },
    qrCodeWrapper: {
      backgroundColor: '#000',
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      width: 280,
      height: 280,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    qrCodeImage: {
      width: 248,
      height: 248,
    },
    qrUserName: {
      fontSize: 18,
      fontWeight: '700' as const,
      color: colors.text,
      marginBottom: 4,
    },
    qrLocationRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      marginBottom: 8,
    },
    qrLocationText: {
      fontSize: 13,
      color: colors.textLight,
    },
    qrHint: {
      fontSize: 12,
      color: colors.textLight,
      textAlign: 'center' as const,
      marginTop: 4,
      marginBottom: 16,
      paddingHorizontal: 12,
    },
    qrShareButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.accent,
      paddingVertical: 10,
      paddingHorizontal: 24,
      borderRadius: 20,
      gap: 8,
    },
    qrShareButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600' as const,
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navHeader}>
        <Text style={styles.navTitle}>Settings</Text>
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Account</Text>
        
        <View style={styles.settingsCard}>
          <TouchableOpacity style={styles.profileItem} onPress={openProfile} activeOpacity={0.7}>
            <View style={styles.profileContent}>
              <View style={styles.avatarContainer}>
                {user?.profilePicture ? (
                  <Image source={{ uri: user.profilePicture }} style={styles.avatarImage} />
                ) : (
                  <User size={24} color={colors.textInverted} />
                )}
              </View>
              <View style={styles.profileInfo}>
                {isAuthenticated ? (
                  <>
                    <Text style={styles.profileName}>{user?.displayName}</Text>
                    <Text style={styles.profileEmail}>{user?.email}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.profileName}>Sign In</Text>
                    <Text style={styles.profileEmail}>Create account to save your trips</Text>
                  </>
                )}
              </View>
            </View>
            <ChevronRight size={20} color={colors.textLight} />
          </TouchableOpacity>

          {isAuthenticated && carName && (
            <>
              <View style={styles.divider} />
              <View style={styles.carItem}>
                <View style={styles.linkContent}>
                  <View style={styles.settingIconContainer}>
                    <Car size={20} color={colors.accent} />
                  </View>
                  <Text style={styles.linkText}>{carName}</Text>
                </View>
              </View>
            </>
          )}

          {isAuthenticated && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.linkItem} onPress={handleShowQR} activeOpacity={0.7}>
                <View style={styles.linkContent}>
                  <View style={[styles.settingIconContainer, { backgroundColor: colors.accent + '18' }]}>
                    <QrCode size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkText}>Share Profile</Text>
                    <Text style={styles.notificationDescription}>Share your profile link or QR code</Text>
                  </View>
                </View>
                <ChevronRight size={20} color={colors.textLight} />
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.settingsCard}>
          <TouchableOpacity style={styles.linkItem} onPress={openAchievements} activeOpacity={0.7}>
            <View style={styles.linkContent}>
              <View style={[styles.settingIconContainer, { backgroundColor: '#FFD700' + '18' }]}>
                <Trophy size={20} color="#FFD700" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkText}>Achievements</Text>
                <Text style={styles.notificationDescription}>{unlockedCount}/{totalCount} unlocked</Text>
              </View>
            </View>
            <ChevronRight size={20} color={colors.textLight} />
          </TouchableOpacity>
        </View>

        {isAuthenticated && (
          <View style={{ marginBottom: 8 }}>
            <DailyCard />
          </View>
        )}

        {isAuthenticated && (
          <>
            <Text style={styles.sectionTitle}>My Content</Text>
            <View style={styles.settingsCard}>
              <TouchableOpacity style={styles.linkItem} onPress={() => router.push('/my-posts' as any)} activeOpacity={0.7}>
                <View style={styles.linkContent}>
                  <View style={[styles.settingIconContainer, { backgroundColor: colors.accent + '18' }]}>
                    <ImageIcon size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkText}>My Posts</Text>
                    <Text style={styles.notificationDescription}>View and manage your posts</Text>
                  </View>
                </View>
                <ChevronRight size={20} color={colors.textLight} />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Social Accounts</Text>
            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={styles.linkItem}
                onPress={() => openSocialModal('instagram')}
                activeOpacity={0.7}
              >
                <View style={styles.linkContent}>
                  <View style={[styles.settingIconContainer, { backgroundColor: '#E1306C18' }]}>
                    <Instagram size={20} color="#E1306C" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkText}>Instagram</Text>
                    {user?.instagramUsername ? (
                      <Text style={styles.notificationDescription}>@{user.instagramUsername}</Text>
                    ) : (
                      <Text style={styles.notificationDescription}>Not connected</Text>
                    )}
                  </View>
                </View>
                {user?.instagramUsername ? (
                  <TouchableOpacity
                    onPress={() => handleDisconnectSocial('instagram')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.disconnectButton}
                  >
                    <Unlink size={16} color={colors.danger} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.connectBadge}>
                    <Link2 size={14} color={colors.accent} />
                    <Text style={styles.connectBadgeText}>Connect</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.linkItem}
                onPress={() => openSocialModal('tiktok')}
                activeOpacity={0.7}
              >
                <View style={styles.linkContent}>
                  <View style={[styles.settingIconContainer, { backgroundColor: '#00000018' }]}>
                    <Text style={{ fontSize: 16, fontWeight: '900' as const }}>T</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkText}>TikTok</Text>
                    {user?.tiktokUsername ? (
                      <Text style={styles.notificationDescription}>@{user.tiktokUsername}</Text>
                    ) : (
                      <Text style={styles.notificationDescription}>Not connected</Text>
                    )}
                  </View>
                </View>
                {user?.tiktokUsername ? (
                  <TouchableOpacity
                    onPress={() => handleDisconnectSocial('tiktok')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.disconnectButton}
                  >
                    <Unlink size={16} color={colors.danger} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.connectBadge}>
                    <Link2 size={14} color={colors.accent} />
                    <Text style={styles.connectBadgeText}>Connect</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Preferences</Text>
        
        <View style={styles.settingsCard}>
          <View style={styles.settingItem}>
            <View style={styles.settingHeader}>
              <View style={styles.settingIconContainer}>
                <Sun size={20} color={colors.accent} />
              </View>
              <Text style={styles.settingLabel}>Appearance</Text>
            </View>
            <View style={styles.optionsRow}>
              {themeOptions.map((option) => {
                const IconComponent = option.icon;
                const isActive = settings.theme === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      isActive && styles.optionButtonActive,
                    ]}
                    onPress={() => setTheme(option.value)}
                    activeOpacity={0.7}
                  >
                    <IconComponent 
                      size={18} 
                      color={isActive ? '#FFFFFF' : colors.text} 
                    />
                    <Text
                      style={[
                        styles.optionText,
                        isActive && styles.optionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.settingItem}>
            <View style={styles.settingHeader}>
              <View style={styles.settingIconContainer}>
                <Gauge size={20} color={colors.accent} />
              </View>
              <Text style={styles.settingLabel}>Speed Unit</Text>
            </View>
            <View style={styles.optionsRow}>
              {speedOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    settings.speedUnit === option.value && styles.optionButtonActive,
                  ]}
                  onPress={() => setSpeedUnit(option.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.optionText,
                      settings.speedUnit === option.value && styles.optionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.settingItem}>
            <View style={styles.settingHeader}>
              <View style={styles.settingIconContainer}>
                <Ruler size={20} color={colors.accent} />
              </View>
              <Text style={styles.settingLabel}>Distance Unit</Text>
            </View>
            <View style={styles.optionsRow}>
              {distanceOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    settings.distanceUnit === option.value && styles.optionButtonActive,
                  ]}
                  onPress={() => setDistanceUnit(option.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.optionText,
                      settings.distanceUnit === option.value && styles.optionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Notifications</Text>
        
        <View style={styles.settingsCard}>
          <View style={styles.notificationItem}>
            <View style={styles.notificationContent}>
              <View style={styles.settingIconContainer}>
                <Bell size={20} color={colors.accent} />
              </View>
              <View style={styles.notificationTextContainer}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.notificationDescription}>
                  {Platform.OS === 'web' 
                    ? 'Not available on web'
                    : 'Get notified about your trips'
                  }
                </Text>
              </View>
            </View>
            {Platform.OS !== 'web' && (
              isTogglingNotifications ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotificationToggle}
                  trackColor={{ false: colors.border, true: colors.accent + '80' }}
                  thumbColor={notificationsEnabled ? colors.accent : colors.textLight}
                />
              )
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.notificationItem}>
            <View style={styles.notificationContent}>
              <View style={styles.settingIconContainer}>
                <Mail size={20} color={colors.accent} />
              </View>
              <View style={styles.notificationTextContainer}>
                <Text style={styles.settingLabel}>Weekly Recap Email</Text>
                <Text style={styles.notificationDescription}>
                  Receive weekly email with your driving stats
                </Text>
              </View>
            </View>
            {isTogglingWeeklyRecap ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Switch
                value={weeklyRecapEnabled}
                onValueChange={handleWeeklyRecapToggle}
                trackColor={{ false: colors.border, true: colors.accent + '80' }}
                thumbColor={weeklyRecapEnabled ? colors.accent : colors.textLight}
                disabled={!isAuthenticated}
              />
            )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Legal</Text>
        
        <View style={styles.settingsCard}>
          <TouchableOpacity style={styles.linkItem} onPress={openPrivacyPolicy} activeOpacity={0.7}>
            <View style={styles.linkContent}>
              <View style={styles.settingIconContainer}>
                <Shield size={20} color={colors.accent} />
              </View>
              <Text style={styles.linkText}>Privacy Policy</Text>
            </View>
            <ChevronRight size={20} color={colors.textLight} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.linkItem} onPress={openTermsOfUse} activeOpacity={0.7}>
            <View style={styles.linkContent}>
              <View style={styles.settingIconContainer}>
                <FileText size={20} color={colors.accent} />
              </View>
              <Text style={styles.linkText}>Terms of Use</Text>
            </View>
            <ChevronRight size={20} color={colors.textLight} />
          </TouchableOpacity>

        </View>

        <Text style={styles.sectionTitle}>About</Text>
        
        <View style={styles.settingsCard}>
          <TouchableOpacity style={styles.linkItem} onPress={openHelpCenter} activeOpacity={0.7}>
            <View style={styles.linkContent}>
              <View style={styles.settingIconContainer}>
                <HelpCircle size={20} color={colors.accent} />
              </View>
              <Text style={styles.linkText}>Help Center</Text>
            </View>
            <ChevronRight size={20} color={colors.textLight} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.linkItem} onPress={() => setFeedbackModalVisible(true)} activeOpacity={0.7}>
            <View style={styles.linkContent}>
              <View style={styles.settingIconContainer}>
                <MessageSquare size={20} color={colors.accent} />
              </View>
              <Text style={styles.linkText}>Leave Feedback</Text>
            </View>
            <ChevronRight size={20} color={colors.textLight} />
          </TouchableOpacity>
        </View>

        {isAuthenticated && (
          <>
            <Text style={styles.sectionTitle}>Danger Zone</Text>
            <TouchableOpacity
              style={styles.deleteAccountButton}
              onPress={() => {
                Alert.alert(
                  'Delete Account',
                  'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently removed.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          if (user?.id) {
                            await trpcClient.user.deleteAccount.mutate({ userId: user.id });
                            console.log('[SETTINGS] Account deleted from backend');
                          }
                        } catch (error) {
                          console.error('[SETTINGS] Backend delete failed:', error);
                        }
                        await signOut();
                        router.replace('/' as any);
                      },
                    },
                  ]
                );
              }}
              activeOpacity={0.7}
            >
              <Trash2 size={18} color="#FF3B30" />
              <Text style={styles.deleteAccountText}>Delete Account</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.footer}>
          <Image
            source={{ uri: settings.theme === 'dark' ? 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/pt2pvulnkkxt2nez0x5hi' : 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/f6dxycsffzouzbzezjis9' }}
            style={styles.footerLogo}
            resizeMode="contain"
          />
          <Text style={styles.footerText}>RedLine v1.5.0</Text>
        </View>
      </ScrollView>
      <Modal
        visible={feedbackModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFeedbackModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Leave Feedback</Text>
              <TouchableOpacity onPress={() => setFeedbackModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={colors.textLight} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>We{"'"}d love to hear your thoughts, suggestions, or issues.</Text>
            <TextInput
              style={styles.feedbackInput}
              placeholder="Type your feedback here..."
              placeholderTextColor={colors.textLight}
              value={feedbackText}
              onChangeText={setFeedbackText}
              multiline
              textAlignVertical="top"
              maxLength={1000}
            />
            <Text style={styles.charCount}>{feedbackText.length}/1000</Text>
            <TouchableOpacity
              style={[styles.sendButton, (!feedbackText.trim() || sendFeedbackMutation.isPending) && styles.sendButtonDisabled]}
              onPress={handleSendFeedback}
              disabled={!feedbackText.trim() || sendFeedbackMutation.isPending}
              activeOpacity={0.7}
            >
              {sendFeedbackMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Send size={18} color="#FFFFFF" />
                  <Text style={styles.sendButtonText}>Send Feedback</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={socialModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSocialModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {socialPlatform === 'instagram' ? 'Instagram' : 'TikTok'}
              </Text>
              <TouchableOpacity onPress={() => setSocialModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={colors.textLight} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Enter your {socialPlatform === 'instagram' ? 'Instagram' : 'TikTok'} username to display it on your shared trip cards.
            </Text>
            <Text style={styles.socialInputPrefix}>
              @
            </Text>
            <TextInput
              style={styles.socialInput}
              placeholder={socialPlatform === 'instagram' ? 'username' : 'username'}
              placeholderTextColor={colors.textLight}
              value={socialUsername}
              onChangeText={(t) => setSocialUsername(t.replace(/\s/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
            />
            <TouchableOpacity
              style={[styles.sendButton, !socialUsername.trim() && styles.sendButtonDisabled]}
              onPress={handleSaveSocial}
              disabled={!socialUsername.trim()}
              activeOpacity={0.7}
            >
              <Check size={18} color="#FFFFFF" />
              <Text style={styles.sendButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={showQRModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQRModal(false)}
      >
        <TouchableOpacity
          style={styles.qrModalOverlay}
          activeOpacity={1}
          onPress={() => setShowQRModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.qrModalContent}>
            <View style={styles.qrModalHeader}>
              <Text style={styles.qrModalTitle}>Share Profile</Text>
              <TouchableOpacity
                onPress={() => setShowQRModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={22} color={colors.textLight} />
              </TouchableOpacity>
            </View>
            <View style={styles.qrCodeWrapper}>
              {qrCodeUrl ? (
                <Image
                  source={{ uri: qrCodeUrl }}
                  style={styles.qrCodeImage}
                  resizeMode="contain"
                />
              ) : (
                <ActivityIndicator size="large" color={colors.accent} />
              )}
            </View>
            <Text style={styles.qrUserName}>{user?.displayName}</Text>
            {(user?.city || user?.country) && (
              <View style={styles.qrLocationRow}>
                <MapPin size={12} color={colors.accent} />
                <Text style={styles.qrLocationText}>
                  {user?.city}{user?.city && user?.country ? ', ' : ''}{user?.country}
                </Text>
              </View>
            )}
            <Text style={styles.qrHint}>Point your camera at this code to open your profile</Text>
            <TouchableOpacity style={styles.qrShareButton} onPress={handleShareProfile} activeOpacity={0.7}>
              <Share2 size={16} color="#fff" />
              <Text style={styles.qrShareButtonText}>Share Link</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
