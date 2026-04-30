import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { User, Car, ChevronDown, ChevronRight, LogOut, Check, Navigation, Search, Camera, Plus, X, Image as ImageIcon, Eye, EyeOff, CirclePlus } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useSettings } from '@/providers/SettingsProvider';
import { ThemeColors } from '@/constants/colors';
import { useUser } from '@/providers/UserProvider';
import { useTrips } from '@/providers/TripProvider';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { CAR_BRANDS, getModelsForBrand } from '@/constants/cars';
import { trpcClient } from '@/lib/trpc';
import { COUNTRIES, getCitiesForCountry } from '@/constants/countries';
import { UserCar } from '@/types/user';

WebBrowser.maybeCompleteAuthSession();

interface AdditionalCar {
  id: string;
  brand: string;
  model: string;
  picture?: string;
}

const isValidImageUri = (uri: string | undefined | null): boolean => {
  if (!uri || typeof uri !== 'string') return false;
  const trimmed = uri.trim();
  if (trimmed.length === 0) return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('file://') || trimmed.startsWith('data:image/');
};

export default function ProfileScreen() {
  const { user, isAuthenticated, signUp, signIn, signOut, updateProfile, updateCar, updateLocation, addCar, removeCar, setPrimaryCar, signInWithGoogle, syncImagesToBackend } = useUser();
  const { syncUnsyncedTrips } = useTrips();
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signin');
  const { colors } = useSettings();
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [profilePicture, setProfilePicture] = useState(user?.profilePicture || '');
  const [selectedCountry, setSelectedCountry] = useState(user?.country || '');
  const [selectedCity, setSelectedCity] = useState(user?.city || '');
  const [selectedBrand, setSelectedBrand] = useState(user?.carBrand || '');
  const [selectedModel, setSelectedModel] = useState(user?.carModel || '');
  const [carPicture, setCarPicture] = useState(user?.carPicture || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [profilePicLoadFailed, setProfilePicLoadFailed] = useState(false);
  const [carPicLoadFailed, setCarPicLoadFailed] = useState(false);
  const [failedCarPicIds, setFailedCarPicIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      setEmail(prev => prev || user.email || '');
      setDisplayName(prev => prev || user.displayName || '');
      setProfilePicture(prev => prev || user.profilePicture || '');
      setSelectedCountry(prev => prev || user.country || '');
      setSelectedCity(prev => prev || user.city || '');
      setSelectedBrand(prev => prev || user.carBrand || '');
      setSelectedModel(prev => prev || user.carModel || '');
      setCarPicture(prev => prev || user.carPicture || '');
      setBio(prev => prev || user.bio || '');
      setProfilePicLoadFailed(false);
      setCarPicLoadFailed(false);
      setFailedCarPicIds(new Set());
    }
  }, [user]);
  const [additionalCars, setAdditionalCars] = useState<AdditionalCar[]>([]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [showAddCarForm, setShowAddCarForm] = useState(false);
  const [newCarBrand, setNewCarBrand] = useState('');
  const [newCarModel, setNewCarModel] = useState('');
  const [newCarPicture, setNewCarPicture] = useState('');
  const [showNewBrandPicker, setShowNewBrandPicker] = useState(false);
  const [showNewModelPicker, setShowNewModelPicker] = useState(false);
  const [isCheckingDisplayName, setIsCheckingDisplayName] = useState(false);
  const [displayNameError, setDisplayNameError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [resetStep, setResetStep] = useState<'email' | 'code' | 'newPassword'>('email');
  const [isResetting, setIsResetting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [newBrandSearch, setNewBrandSearch] = useState('');
  const [newModelSearch, setNewModelSearch] = useState('');

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: '229508757301-qu9290kh0vb6ijl7jpmftbkmbpotnn6m.apps.googleusercontent.com',
    iosClientId: '229508757301-kdqacnt706ifo720d6ftp617s8itd825.apps.googleusercontent.com',
    androidClientId: '229508757301-qvgii47v29imbk4qe99la4hv9shvgqm2.apps.googleusercontent.com',
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const accessToken = response.authentication?.accessToken;
      if (accessToken) {
        void (async () => {
          setIsGoogleLoading(true);
          try {
            const userInfoResponse = await fetch(
              'https://www.googleapis.com/userinfo/v2/me',
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const googleUser = await userInfoResponse.json();
            console.log('Google user info:', googleUser);
            
            if (googleUser.email) {
              await signInWithGoogle(
                googleUser.email,
                googleUser.name || googleUser.email.split('@')[0],
                googleUser.picture
              );
              console.log('[PROFILE] Google sign-in successful, triggering trip sync...');
              void syncUnsyncedTrips();
              Alert.alert('Success', 'Signed in with Google successfully');
              router.back();
            } else {
              Alert.alert('Error', 'Could not retrieve email from Google account');
            }
          } catch (error) {
            console.error('Google sign in error:', error);
            Alert.alert('Error', 'Failed to sign in with Google. Please try again.');
          } finally {
            setIsGoogleLoading(false);
          }
        })();
      }
    }
  }, [response, signInWithGoogle, syncUnsyncedTrips]);

  const handleGoogleButtonPress = async () => {
    try {
      await promptAsync();
    } catch (error) {
      console.error('Google prompt error:', error);
      Alert.alert('Error', 'Failed to open Google sign in. Please try again.');
    }
  };

  const availableModels = useMemo(() => {
    return selectedBrand ? getModelsForBrand(selectedBrand) : [];
  }, [selectedBrand]);

  const filteredBrands = useMemo(() => {
    if (!brandSearch.trim()) return CAR_BRANDS;
    const s = brandSearch.toLowerCase();
    return CAR_BRANDS.filter(b => b.name.toLowerCase().includes(s));
  }, [brandSearch]);

  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return availableModels;
    const s = modelSearch.toLowerCase();
    return availableModels.filter(m => m.toLowerCase().includes(s));
  }, [modelSearch, availableModels]);

  const filteredNewBrands = useMemo(() => {
    if (!newBrandSearch.trim()) return CAR_BRANDS;
    const s = newBrandSearch.toLowerCase();
    return CAR_BRANDS.filter(b => b.name.toLowerCase().includes(s));
  }, [newBrandSearch]);

  const availableCities = useMemo(() => {
    return selectedCountry ? getCitiesForCountry(selectedCountry) : [];
  }, [selectedCountry]);

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRIES;
    const search = countrySearch.toLowerCase();
    return COUNTRIES.filter(
      (country) =>
        country.name.toLowerCase().includes(search) ||
        country.code.toLowerCase().includes(search)
    );
  }, [countrySearch]);

  const newCarModels = useMemo(() => {
    return newCarBrand ? getModelsForBrand(newCarBrand) : [];
  }, [newCarBrand]);

  const filteredNewModels = useMemo(() => {
    if (!newModelSearch.trim()) return newCarModels;
    const s = newModelSearch.toLowerCase();
    return newCarModels.filter(m => m.toLowerCase().includes(s));
  }, [newModelSearch, newCarModels]);

  const existingCars = useMemo(() => {
    return user?.cars?.filter(c => !c.isPrimary) || [];
  }, [user?.cars]);

  const allUserCars = useMemo(() => {
    return user?.cars || [];
  }, [user?.cars]);

  const primaryCar = useMemo(() => {
    return allUserCars.find(c => c.isPrimary);
  }, [allUserCars]);

  const secondaryCars = useMemo(() => {
    return allUserCars.filter(c => !c.isPrimary);
  }, [allUserCars]);

  const handleSelectActiveCar = async (carId: string) => {
    await setPrimaryCar(carId);
    const selectedCar = user?.cars?.find(c => c.id === carId);
    if (selectedCar) {
      setSelectedBrand(selectedCar.brand);
      setSelectedModel(selectedCar.model);
      setCarPicture(selectedCar.picture || '');
    }
  };

  const showImagePickerOptions = (type: 'profile' | 'car' | 'newCar') => {
    Alert.alert(
      'Add Photo',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: () => handleCameraCapture(type),
        },
        {
          text: 'Choose from Library',
          onPress: () => handleLibraryPick(type),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleCameraCapture = async (type: 'profile' | 'car' | 'newCar') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
      return;
    }

    const aspect: [number, number] = type === 'profile' ? [1, 1] : [16, 9];
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect,
      quality: 0.8,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      if (type === 'profile') {
        setProfilePicture(uri);
      } else if (type === 'car') {
        setCarPicture(uri);
      } else {
        setNewCarPicture(uri);
      }
      console.log(`${type} picture captured:`, uri);
    }
  };

  const handleLibraryPick = async (type: 'profile' | 'car' | 'newCar') => {
    const aspect: [number, number] = type === 'profile' ? [1, 1] : [16, 9];
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.8,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      if (type === 'profile') {
        setProfilePicture(uri);
      } else if (type === 'car') {
        setCarPicture(uri);
      } else {
        setNewCarPicture(uri);
      }
      console.log(`${type} picture selected:`, uri);
    }
  };

  const pickProfilePicture = () => showImagePickerOptions('profile');
  const pickCarPicture = () => showImagePickerOptions('car');
  const pickNewCarPicture = () => showImagePickerOptions('newCar');

  const handleCountrySelect = (countryCode: string) => {
    setSelectedCountry(countryCode);
    setSelectedCity('');
    setShowCountryPicker(false);
    setCountrySearch('');
  };

  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    setShowCityPicker(false);
  };

  const handleBrandSelect = (brand: string) => {
    setSelectedBrand(brand);
    setSelectedModel('');
    setShowBrandPicker(false);
    setBrandSearch('');
    setModelSearch('');
  };

  const handleModelSelect = (model: string) => {
    setSelectedModel(model);
    setShowModelPicker(false);
    setModelSearch('');
  };

  const handleNewBrandSelect = (brand: string) => {
    setNewCarBrand(brand);
    setNewCarModel('');
    setShowNewBrandPicker(false);
    setNewBrandSearch('');
    setNewModelSearch('');
  };

  const handleNewModelSelect = (model: string) => {
    setNewCarModel(model);
    setShowNewModelPicker(false);
    setNewModelSearch('');
  };

  const handleAddCar = () => {
    if (!newCarBrand || !newCarModel) {
      Alert.alert('Error', 'Please select brand and model');
      return;
    }
    const newCar: AdditionalCar = {
      id: Date.now().toString(),
      brand: newCarBrand,
      model: newCarModel,
      picture: newCarPicture || undefined,
    };
    setAdditionalCars([...additionalCars, newCar]);
    setNewCarBrand('');
    setNewCarModel('');
    setNewCarPicture('');
    setShowAddCarForm(false);
  };

  const handleRemoveAdditionalCar = (carId: string) => {
    setAdditionalCars(additionalCars.filter(c => c.id !== carId));
  };

  const handleRemoveExistingCar = async (carId: string) => {
    const car = user?.cars?.find(c => c.id === carId);
    const isPrimary = car?.isPrimary;
    Alert.alert(
      'Remove Car',
      isPrimary
        ? 'This is your primary car. Are you sure you want to remove it?'
        : 'Are you sure you want to remove this car?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeCar(carId);
            if (isPrimary) {
              setSelectedBrand('');
              setSelectedModel('');
              setCarPicture('');
              setCarPicLoadFailed(false);
            }
          },
        },
      ]
    );
  };

  const handleUseMyLocation = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Location detection is not available on web. Please select your location manually.');
      return;
    }
    
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please enable location permissions to use this feature.');
        setIsLocating(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (geocode) {
        const countryName = geocode.country || '';
        const cityName = geocode.city || geocode.subregion || geocode.region || '';

        const matchedCountry = COUNTRIES.find(
          c => c.name.toLowerCase() === countryName.toLowerCase() ||
               c.code.toLowerCase() === (geocode.isoCountryCode || '').toLowerCase()
        );

        if (matchedCountry) {
          setSelectedCountry(matchedCountry.code);
          
          const matchedCity = matchedCountry.cities.find(
            c => c.toLowerCase() === cityName.toLowerCase()
          );
          
          if (matchedCity) {
            setSelectedCity(matchedCity);
          } else if (cityName) {
            setSelectedCity(cityName);
          }
          
          console.log('Location detected:', matchedCountry.name, cityName);
        } else {
          Alert.alert('Location Found', `We detected ${cityName}, ${countryName} but couldn't match it to our country list. Please select manually.`);
        }
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get your location. Please try again or select manually.');
    } finally {
      setIsLocating(false);
    }
  };

  const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out. Please check your connection and try again.`)), ms)
      ),
    ]);
  };

  const handleSave = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (!isAuthenticated && !password.trim()) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }
    if (!isAuthenticated && password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (!isAuthenticated && authMode === 'signup' && !displayName.trim()) {
      Alert.alert('Error', 'Please enter your display name');
      return;
    }
    if (!isAuthenticated && authMode === 'signup' && !selectedBrand) {
      Alert.alert('Error', 'Please select your car brand');
      return;
    }
    if (!isAuthenticated && authMode === 'signup' && !selectedModel) {
      Alert.alert('Error', 'Please select your car model');
      return;
    }

    if (!isAuthenticated && authMode === 'signup') {
      setIsCheckingDisplayName(true);
      try {
        const result = await withTimeout(
          trpcClient.user.checkDisplayName.query({ displayName: displayName.trim() }),
          15000,
          'Display name check'
        );
        if (!result.available) {
          setDisplayNameError('This display name is already taken');
          Alert.alert('Error', 'This display name is already taken. Please choose a different one.');
          setIsCheckingDisplayName(false);
          return;
        }
        setDisplayNameError('');
      } catch (error: any) {
        console.error('Failed to check display name:', error);
        const isTimeout = error?.message?.includes('timed out');
        if (isTimeout) {
          setIsCheckingDisplayName(false);
          Alert.alert('Connection Issue', 'Could not verify display name. Please check your connection and try again.');
          return;
        }
      } finally {
        setIsCheckingDisplayName(false);
      }
    }

    setIsSubmitting(true);
    try {
      if (isAuthenticated) {
        await updateProfile({ email, displayName, profilePicture: profilePicture || undefined, bio: bio.trim() || undefined });
        if (user?.id) {
          try {
            await trpcClient.user.updateBio.mutate({ userId: user.id, bio: bio.trim() });
          } catch (e) {
            console.error('Failed to sync bio to backend:', e);
          }
        }
        if (selectedCountry) {
          await updateLocation(selectedCountry, selectedCity);
        }
        if (selectedBrand && selectedModel) {
          await updateCar(selectedBrand, selectedModel, carPicture || undefined);
        }
        for (const car of additionalCars) {
          await addCar(car.brand, car.model, car.picture);
        }
        void syncImagesToBackend();
        Alert.alert('Success', 'Profile updated successfully');
        router.back();
      } else if (authMode === 'signin') {
        const result = await withTimeout(
          signIn(email, password),
          20000,
          'Sign in'
        );
        if (result.success) {
          console.log('[PROFILE] Sign-in successful, triggering trip sync...');
          void syncUnsyncedTrips();
          Alert.alert('Success', 'Signed in successfully');
          router.back();
        } else if (result.error === 'incorrect_password') {
          Alert.alert('Error', result.message || 'Incorrect password. Please try again.');
        } else if (result.error === 'no_password') {
          Alert.alert(
            'Use Google Sign In',
            'This account was created with Google. Please sign in with Google, or create a password by tapping "Sign Up" with the same email.'
          );
        } else if (result.error === 'not_found') {
          Alert.alert('Error', 'No account found with this email. Please sign up first.');
        } else {
          Alert.alert('Error', result.message || 'Unable to sign in. Please try again.');
        }
      } else {
        const carsToAdd: UserCar[] = additionalCars.map(c => ({
          id: c.id,
          brand: c.brand,
          model: c.model,
          picture: c.picture,
          isPrimary: false,
        }));
        await withTimeout(
          signUp(
            email, 
            displayName,
            password,
            selectedCountry || undefined, 
            selectedCity || undefined, 
            selectedBrand || undefined, 
            selectedModel || undefined,
            profilePicture || undefined,
            carPicture || undefined,
            carsToAdd.length > 0 ? carsToAdd : undefined
          ),
          30000,
          'Account creation'
        );
        console.log('[PROFILE] Sign-up successful, triggering trip sync...');
        void syncUnsyncedTrips();
        void syncImagesToBackend();
        Alert.alert('Success', 'Account created successfully');
        router.back();
      }
    } catch (error: any) {
      console.error('Profile save error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      let errorMessage = 'An unexpected error occurred. Please try again.';
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (error?.shape?.message) {
        errorMessage = error.shape.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.back();
          },
        },
      ]
    );
  };

  const handleForgotPassword = () => {
    setResetEmail(email);
    setResetCode('');
    setNewPassword('');
    setResetStep('email');
    setShowForgotPassword(true);
  };

  const handleRequestResetCode = async () => {
    if (!resetEmail.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    setIsResetting(true);
    try {
      console.log('Requesting password reset for:', resetEmail.trim());
      const result = await trpcClient.user.requestPasswordReset.mutate({ email: resetEmail.trim() });
      console.log('Password reset result:', JSON.stringify(result, null, 2));
      
      if (result.success && result.emailSent) {
        setResetStep('code');
        Alert.alert('Code Sent', 'A reset code has been sent to your email. Please check your inbox.');
      } else {
        const errorMessage = (result as { error?: string }).error || 'Failed to send reset code. Please try again.';
        console.log('Password reset error message:', errorMessage);
        Alert.alert('Error', errorMessage);
      }
    } catch (error: unknown) {
      console.error('Failed to request reset code:', error);
      let errorMessage = 'Failed to send reset code. Please try again.';
      
      if (error && typeof error === 'object') {
        const err = error as { message?: string; data?: { message?: string }; shape?: { message?: string } };
        if (err.message) {
          errorMessage = err.message;
        } else if (err.data?.message) {
          errorMessage = err.data.message;
        } else if (err.shape?.message) {
          errorMessage = err.shape.message;
        }
      }
      
      const lowerMessage = errorMessage.toLowerCase();
      if (lowerMessage.includes('429') || lowerMessage.includes('rate') || lowerMessage.includes('too many')) {
        Alert.alert('Please Wait', 'Too many requests. Please wait a minute and try again.');
      } else if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('failed to fetch')) {
        Alert.alert('Error', 'Network error. Please check your connection and try again.');
      } else if (lowerMessage.includes('non-json') || lowerMessage.includes('html')) {
        Alert.alert('Server Busy', 'The server is temporarily busy. Please try again in a moment.');
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setIsResetting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!resetCode.trim()) {
      Alert.alert('Error', 'Please enter the reset code');
      return;
    }
    setIsResetting(true);
    try {
      const result = await trpcClient.user.verifyResetCode.mutate({ 
        email: resetEmail.trim(), 
        code: resetCode.trim() 
      });
      if (result.valid) {
        setResetStep('newPassword');
      } else {
        Alert.alert('Error', result.error || 'Invalid code');
      }
    } catch (error) {
      console.error('Failed to verify code:', error);
      Alert.alert('Error', 'Failed to verify code. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim()) {
      Alert.alert('Error', 'Please enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setIsResetting(true);
    try {
      const result = await trpcClient.user.resetPassword.mutate({
        email: resetEmail.trim(),
        newPassword: newPassword,
      });

      if (result.success) {
        setShowForgotPassword(false);
        setPassword(newPassword);
        setResetEmail('');
        setResetCode('');
        setNewPassword('');
        setConfirmNewPassword('');
        setResetStep('email');
        Alert.alert('Success', 'Your password has been reset. You can now sign in.');
      } else {
        const errorMsg = (result as { error?: string }).error || 'Failed to reset password.';
        Alert.alert('Error', errorMsg);
      }
    } catch (error) {
      console.error('Failed to reset password:', error);
      Alert.alert('Error', 'Failed to reset password. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  const closeAllPickers = () => {
    setShowCountryPicker(false);
    setShowCityPicker(false);
    setShowBrandPicker(false);
    setShowModelPicker(false);
    setShowNewBrandPicker(false);
    setShowNewModelPicker(false);
    setBrandSearch('');
    setModelSearch('');
    setNewBrandSearch('');
    setNewModelSearch('');
  };

  const renderPickerDropdown = (
    items: { label: string; value: string }[],
    selectedValue: string,
    onSelect: (value: string) => void,
    searchValue: string,
    onSearchChange: (text: string) => void,
    placeholder: string,
  ) => (
    <View style={styles.pickerOptions}>
      <View style={styles.searchContainer}>
        <Search size={16} color={colors.textLight} />
        <TextInput
          style={styles.searchInput}
          value={searchValue}
          onChangeText={onSearchChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <ScrollView style={styles.pickerScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {items.length === 0 ? (
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>No results found</Text>
          </View>
        ) : (
          items.map((item, index) => (
            <TouchableOpacity
              key={`${item.value}-${index}`}
              style={[
                styles.pickerOption,
                selectedValue === item.value && styles.pickerOptionSelected,
              ]}
              onPress={() => onSelect(item.value)}
            >
              <Text
                style={[
                  styles.pickerOptionText,
                  selectedValue === item.value && styles.pickerOptionTextSelected,
                ]}
              >
                {item.label}
              </Text>
              {selectedValue === item.value && (
                <Check color={colors.accent} size={18} />
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderSectionHeader = (title: string, rightElement?: React.ReactNode) => (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionAccentBar} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {rightElement}
    </View>
  );

  const renderAuthenticatedProfile = () => (
    <>
      <View style={styles.avatarSection}>
        <TouchableOpacity style={styles.avatarContainer} onPress={pickProfilePicture}>
          <View style={styles.avatarRing}>
            {isValidImageUri(profilePicture) && !profilePicLoadFailed ? (
              <Image 
                source={{ uri: profilePicture }} 
                style={styles.avatarImage}
                onError={() => {
                  console.log('[PROFILE] Profile picture failed to load:', profilePicture);
                  setProfilePicLoadFailed(true);
                }}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <User color={colors.textInverted} size={48} />
              </View>
            )}
          </View>
          <View style={styles.cameraOverlay}>
            <CirclePlus color={colors.accent} size={28} fill={colors.background} />
          </View>
        </TouchableOpacity>
        <Text style={styles.profileName}>{displayName || 'Your Name'}</Text>
        <Text style={styles.tapToChangeText}>TAP PHOTO TO CHANGE</Text>
      </View>

      {renderSectionHeader('ACCOUNT INFO')}
      <View style={styles.sectionContent}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput
            style={[styles.input, displayNameError ? styles.inputError : null]}
            value={displayName}
            onChangeText={(text) => {
              setDisplayName(text);
              setDisplayNameError('');
            }}
            placeholder="Enter your name"
            placeholderTextColor={colors.textLight}
            autoCapitalize="words"
          />
          {displayNameError ? (
            <Text style={styles.errorText}>{displayNameError}</Text>
          ) : null}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor={colors.textLight}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>BIO</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={(text) => setBio(text.slice(0, 300))}
            placeholder="Tell others about yourself..."
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={3}
            maxLength={300}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{bio.length}/300</Text>
        </View>
      </View>

      {renderSectionHeader(
        'LOCATION',
        <TouchableOpacity
          style={styles.useLocationPill}
          onPress={handleUseMyLocation}
          disabled={isLocating}
          activeOpacity={0.7}
        >
          {isLocating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Navigation size={14} color="#FFFFFF" />
          )}
          <Text style={styles.useLocationPillText}>
            {isLocating ? 'Detecting...' : 'Use My Location'}
          </Text>
        </TouchableOpacity>
      )}
      <View style={styles.sectionContent}>
        <View style={styles.rowPickers}>
          <View style={styles.halfPicker}>
            <Text style={styles.label}>COUNTRY</Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => {
                closeAllPickers();
                setShowCountryPicker(!showCountryPicker);
              }}
            >
              <Text style={[styles.pickerText, !selectedCountry && styles.placeholderText]} numberOfLines={1}>
                {selectedCountry ? COUNTRIES.find(c => c.code === selectedCountry)?.name || selectedCountry : 'Select'}
              </Text>
              <ChevronDown color={colors.textLight} size={18} />
            </TouchableOpacity>
          </View>
          <View style={styles.halfPicker}>
            <Text style={styles.label}>CITY</Text>
            <TouchableOpacity
              style={[styles.picker, !selectedCountry && styles.pickerDisabled]}
              onPress={() => {
                if (selectedCountry) {
                  closeAllPickers();
                  setShowCityPicker(!showCityPicker);
                }
              }}
              disabled={!selectedCountry}
            >
              <Text style={[styles.pickerText, !selectedCity && styles.placeholderText]} numberOfLines={1}>
                {selectedCity || 'Select'}
              </Text>
              <ChevronDown color={colors.textLight} size={18} />
            </TouchableOpacity>
          </View>
        </View>
        {showCountryPicker && renderPickerDropdown(
          filteredCountries.map(c => ({ label: `${c.flag} ${c.name}`, value: c.code })),
          selectedCountry,
          handleCountrySelect,
          countrySearch,
          setCountrySearch,
          'Search country...',
        )}
        {showCityPicker && availableCities.length > 0 && (
          <View style={styles.pickerOptions}>
            <ScrollView style={styles.pickerScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {availableCities.map((city, cityIndex) => (
                <TouchableOpacity
                  key={city || `city-${cityIndex}`}
                  style={[
                    styles.pickerOption,
                    selectedCity === city && styles.pickerOptionSelected,
                  ]}
                  onPress={() => handleCitySelect(city)}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      selectedCity === city && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {city}
                  </Text>
                  {selectedCity === city && (
                    <Check color={colors.accent} size={18} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {renderSectionHeader('MY GARAGE')}
      <View style={styles.sectionContent}>
        {primaryCar && (
          <View style={styles.primaryCarCard}>
            <TouchableOpacity activeOpacity={0.8} onPress={pickCarPicture}>
              {isValidImageUri(primaryCar.picture) && !carPicLoadFailed ? (
                <Image
                  source={{ uri: primaryCar.picture }}
                  style={styles.primaryCarImage}
                  onError={() => {
                    console.log('[PROFILE] Car picture failed to load:', primaryCar.picture);
                    setCarPicLoadFailed(true);
                  }}
                />
              ) : (
                <View style={styles.primaryCarImagePlaceholder}>
                  <ImageIcon color="rgba(255,255,255,0.4)" size={40} />
                  <Text style={styles.primaryCarPlaceholderText}>Tap to add photo</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.primaryBadgeRow}>
              <View style={styles.primaryBadge}>
                <Text style={styles.primaryBadgeText}>PRIMARY</Text>
              </View>
              <TouchableOpacity
                style={styles.removeCarBadge}
                onPress={() => handleRemoveExistingCar(primaryCar.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X color="#FFFFFF" size={14} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!primaryCar && (
          <TouchableOpacity style={styles.carImagePicker} onPress={pickCarPicture}>
            {isValidImageUri(carPicture) && !carPicLoadFailed ? (
              <Image
                source={{ uri: carPicture }}
                style={styles.primaryCarImage}
                onError={() => {
                  console.log('[PROFILE] Car picture failed to load:', carPicture);
                  setCarPicLoadFailed(true);
                }}
              />
            ) : (
              <View style={styles.carImagePlaceholder}>
                <ImageIcon color={colors.textLight} size={32} />
                <Text style={styles.carImagePlaceholderText}>Tap to add car photo</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.rowPickers}>
          <View style={styles.halfPicker}>
            <Text style={styles.label}>BRAND</Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => {
                closeAllPickers();
                setShowBrandPicker(!showBrandPicker);
              }}
            >
              <Text style={[styles.pickerText, !selectedBrand && styles.placeholderText]} numberOfLines={1}>
                {selectedBrand || 'Select'}
              </Text>
              <ChevronDown color={colors.textLight} size={18} />
            </TouchableOpacity>
          </View>
          <View style={styles.halfPicker}>
            <Text style={styles.label}>MODEL</Text>
            <TouchableOpacity
              style={[styles.picker, !selectedBrand && styles.pickerDisabled]}
              onPress={() => {
                if (selectedBrand) {
                  closeAllPickers();
                  setShowModelPicker(!showModelPicker);
                }
              }}
              disabled={!selectedBrand}
            >
              <Text style={[styles.pickerText, !selectedModel && styles.placeholderText]} numberOfLines={1}>
                {selectedModel || 'Select'}
              </Text>
              <ChevronDown color={colors.textLight} size={18} />
            </TouchableOpacity>
          </View>
        </View>
        {showBrandPicker && renderPickerDropdown(
          filteredBrands.map(b => ({ label: b.name, value: b.name })),
          selectedBrand,
          handleBrandSelect,
          brandSearch,
          setBrandSearch,
          'Search brand...',
        )}
        {showModelPicker && availableModels.length > 0 && renderPickerDropdown(
          filteredModels.map(m => ({ label: m, value: m })),
          selectedModel,
          handleModelSelect,
          modelSearch,
          setModelSearch,
          'Search model...',
        )}

        {secondaryCars.map((car, index) => (
          <TouchableOpacity
            key={car.id || `sec-car-${index}`}
            style={styles.secondaryCarRow}
            onPress={() => handleSelectActiveCar(car.id)}
            activeOpacity={0.7}
          >
            <View style={styles.secondaryCarLeft}>
              {isValidImageUri(car.picture) && !failedCarPicIds.has(car.id) ? (
                <Image
                  source={{ uri: car.picture }}
                  style={styles.secondaryCarThumb}
                  onError={() => {
                    console.log('[PROFILE] Secondary car pic failed:', car.id, car.picture);
                    setFailedCarPicIds(prev => new Set(prev).add(car.id));
                  }}
                />
              ) : (
                <View style={styles.secondaryCarThumbPlaceholder}>
                  <Car color={colors.textLight} size={20} />
                </View>
              )}
              <View style={styles.secondaryCarInfo}>
                <Text style={styles.secondaryCarName} numberOfLines={1}>{car.brand} {car.model}</Text>
              </View>
            </View>
            <View style={styles.secondaryCarRight}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  void handleRemoveExistingCar(car.id);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X color={colors.textLight} size={16} />
              </TouchableOpacity>
              <ChevronRight color={colors.textLight} size={18} />
            </View>
          </TouchableOpacity>
        ))}

        {existingCars.length === 0 && additionalCars.length === 0 && !showAddCarForm && null}

        {additionalCars.map((car, index) => (
          <View key={car.id || `add-car-${index}`} style={styles.secondaryCarRow}>
            <View style={styles.secondaryCarLeft}>
              {isValidImageUri(car.picture) ? (
                <Image source={{ uri: car.picture }} style={styles.secondaryCarThumb} />
              ) : (
                <View style={styles.secondaryCarThumbPlaceholder}>
                  <Car color={colors.textLight} size={20} />
                </View>
              )}
              <View style={styles.secondaryCarInfo}>
                <Text style={styles.secondaryCarName} numberOfLines={1}>{car.brand} {car.model}</Text>
                <Text style={styles.newCarLabel}>New</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => handleRemoveAdditionalCar(car.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X color={colors.danger} size={18} />
            </TouchableOpacity>
          </View>
        ))}

        {showAddCarForm ? (
          <View style={styles.addCarForm}>
            <TouchableOpacity style={styles.carImagePickerSmall} onPress={pickNewCarPicture}>
              {isValidImageUri(newCarPicture) ? (
                <Image source={{ uri: newCarPicture }} style={styles.carImageSmall} />
              ) : (
                <View style={styles.carImagePlaceholderSmall}>
                  <Camera color={colors.textLight} size={20} />
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.rowPickers}>
              <View style={styles.halfPicker}>
                <Text style={styles.label}>BRAND</Text>
                <TouchableOpacity
                  style={styles.picker}
                  onPress={() => {
                    closeAllPickers();
                    setShowNewBrandPicker(!showNewBrandPicker);
                  }}
                >
                  <Text style={[styles.pickerText, !newCarBrand && styles.placeholderText]} numberOfLines={1}>
                    {newCarBrand || 'Select'}
                  </Text>
                  <ChevronDown color={colors.textLight} size={18} />
                </TouchableOpacity>
              </View>
              <View style={styles.halfPicker}>
                <Text style={styles.label}>MODEL</Text>
                <TouchableOpacity
                  style={[styles.picker, !newCarBrand && styles.pickerDisabled]}
                  onPress={() => {
                    if (newCarBrand) {
                      closeAllPickers();
                      setShowNewModelPicker(!showNewModelPicker);
                    }
                  }}
                  disabled={!newCarBrand}
                >
                  <Text style={[styles.pickerText, !newCarModel && styles.placeholderText]} numberOfLines={1}>
                    {newCarModel || 'Select'}
                  </Text>
                  <ChevronDown color={colors.textLight} size={18} />
                </TouchableOpacity>
              </View>
            </View>
            {showNewBrandPicker && renderPickerDropdown(
              filteredNewBrands.map(b => ({ label: b.name, value: b.name })),
              newCarBrand,
              handleNewBrandSelect,
              newBrandSearch,
              setNewBrandSearch,
              'Search brand...',
            )}
            {showNewModelPicker && newCarModels.length > 0 && renderPickerDropdown(
              filteredNewModels.map(m => ({ label: m, value: m })),
              newCarModel,
              handleNewModelSelect,
              newModelSearch,
              setNewModelSearch,
              'Search model...',
            )}

            <View style={styles.addCarFormButtons}>
              <TouchableOpacity
                style={styles.cancelCarButton}
                onPress={() => {
                  setShowAddCarForm(false);
                  setNewCarBrand('');
                  setNewCarModel('');
                  setNewCarPicture('');
                }}
              >
                <Text style={styles.cancelCarButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmCarButton}
                onPress={handleAddCar}
              >
                <Text style={styles.confirmCarButtonText}>Add Car</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addCarButton}
            onPress={() => setShowAddCarForm(true)}
          >
            <Plus color={colors.accent} size={20} />
            <Text style={styles.addCarButtonText}>ADD ANOTHER CAR</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.saveButton, (isSubmitting || isCheckingDisplayName) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={isSubmitting || isCheckingDisplayName}
        activeOpacity={0.8}
      >
        <Text style={styles.saveButtonText}>
          {isSubmitting || isCheckingDisplayName ? 'Saving...' : 'Save Changes'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <LogOut color={colors.accent} size={18} />
        <Text style={styles.signOutText}>SIGN OUT</Text>
      </TouchableOpacity>
    </>
  );

  const renderAuthForm = () => (
    <>
      <View style={styles.avatarSection}>
        {authMode === 'signup' ? (
          <TouchableOpacity style={styles.avatarContainer} onPress={pickProfilePicture}>
            <View style={styles.avatarRing}>
              {isValidImageUri(profilePicture) && !profilePicLoadFailed ? (
                <Image 
                  source={{ uri: profilePicture }} 
                  style={styles.avatarImage}
                  onError={() => {
                    console.log('[PROFILE] Profile picture failed to load:', profilePicture);
                    setProfilePicLoadFailed(true);
                  }}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <User color={colors.textInverted} size={48} />
                </View>
              )}
            </View>
            <View style={styles.cameraOverlay}>
              <CirclePlus color={colors.accent} size={28} fill={colors.background} />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.avatarRing}>
            <View style={styles.avatarPlaceholder}>
              <User color={colors.textInverted} size={48} />
            </View>
          </View>
        )}
        <Text style={styles.profileName}>
          {authMode === 'signin' ? 'Welcome Back' : 'Join RedLine'}
        </Text>
        <Text style={styles.avatarSubtext}>
          {authMode === 'signin'
            ? 'Sign in with your email to access your trips'
            : 'Create an account to save your trips and compete on leaderboards'}
        </Text>
        {authMode === 'signup' && <Text style={styles.tapToChangeText}>TAP PHOTO TO CHANGE</Text>}
      </View>

      {renderSectionHeader('ACCOUNT INFO')}
      <View style={styles.sectionContent}>
        {authMode === 'signup' && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>DISPLAY NAME</Text>
            <TextInput
              style={[styles.input, displayNameError ? styles.inputError : null]}
              value={displayName}
              onChangeText={(text) => {
                setDisplayName(text);
                setDisplayNameError('');
              }}
              placeholder="Enter your name"
              placeholderTextColor={colors.textLight}
              autoCapitalize="words"
            />
            {displayNameError ? (
              <Text style={styles.errorText}>{displayNameError}</Text>
            ) : null}
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor={colors.textLight}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>PASSWORD</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder={authMode === 'signin' ? 'Enter your password' : 'Create a password'}
              placeholderTextColor={colors.textLight}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff size={20} color={colors.textLight} />
              ) : (
                <Eye size={20} color={colors.textLight} />
              )}
            </TouchableOpacity>
          </View>
          {authMode === 'signup' && (
            <Text style={styles.passwordHint}>Must be at least 6 characters</Text>
          )}
          {authMode === 'signin' && (
            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotPasswordButton}>
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}
        </View>

        {authMode === 'signup' && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>BIO</Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={(text) => setBio(text.slice(0, 300))}
              placeholder="Tell others about yourself..."
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
              maxLength={300}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{bio.length}/300</Text>
          </View>
        )}
      </View>

      {authMode === 'signup' && (
        <>
          {renderSectionHeader(
            'LOCATION',
            <TouchableOpacity
              style={styles.useLocationPill}
              onPress={handleUseMyLocation}
              disabled={isLocating}
              activeOpacity={0.7}
            >
              {isLocating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Navigation size={14} color="#FFFFFF" />
              )}
              <Text style={styles.useLocationPillText}>
                {isLocating ? 'Detecting...' : 'Use My Location'}
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.sectionContent}>
            <View style={styles.rowPickers}>
              <View style={styles.halfPicker}>
                <Text style={styles.label}>COUNTRY</Text>
                <TouchableOpacity
                  style={styles.picker}
                  onPress={() => {
                    closeAllPickers();
                    setShowCountryPicker(!showCountryPicker);
                  }}
                >
                  <Text style={[styles.pickerText, !selectedCountry && styles.placeholderText]} numberOfLines={1}>
                    {selectedCountry ? COUNTRIES.find(c => c.code === selectedCountry)?.name || selectedCountry : 'Select'}
                  </Text>
                  <ChevronDown color={colors.textLight} size={18} />
                </TouchableOpacity>
              </View>
              <View style={styles.halfPicker}>
                <Text style={styles.label}>CITY</Text>
                <TouchableOpacity
                  style={[styles.picker, !selectedCountry && styles.pickerDisabled]}
                  onPress={() => {
                    if (selectedCountry) {
                      closeAllPickers();
                      setShowCityPicker(!showCityPicker);
                    }
                  }}
                  disabled={!selectedCountry}
                >
                  <Text style={[styles.pickerText, !selectedCity && styles.placeholderText]} numberOfLines={1}>
                    {selectedCity || 'Select'}
                  </Text>
                  <ChevronDown color={colors.textLight} size={18} />
                </TouchableOpacity>
              </View>
            </View>
            {showCountryPicker && renderPickerDropdown(
              filteredCountries.map(c => ({ label: `${c.flag} ${c.name}`, value: c.code })),
              selectedCountry,
              handleCountrySelect,
              countrySearch,
              setCountrySearch,
              'Search country...',
            )}
            {showCityPicker && availableCities.length > 0 && (
              <View style={styles.pickerOptions}>
                <ScrollView style={styles.pickerScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {availableCities.map((city, cityIndex) => (
                    <TouchableOpacity
                      key={city || `city-${cityIndex}`}
                      style={[
                        styles.pickerOption,
                        selectedCity === city && styles.pickerOptionSelected,
                      ]}
                      onPress={() => handleCitySelect(city)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          selectedCity === city && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {city}
                      </Text>
                      {selectedCity === city && (
                        <Check color={colors.accent} size={18} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {renderSectionHeader('PRIMARY CAR')}
          <View style={styles.sectionContent}>
            <TouchableOpacity style={styles.carImagePicker} onPress={pickCarPicture}>
              {isValidImageUri(carPicture) ? (
                <Image source={{ uri: carPicture }} style={styles.primaryCarImage} />
              ) : (
                <View style={styles.carImagePlaceholder}>
                  <ImageIcon color={colors.textLight} size={32} />
                  <Text style={styles.carImagePlaceholderText}>Tap to add car photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.rowPickers}>
              <View style={styles.halfPicker}>
                <Text style={styles.label}>BRAND</Text>
                <TouchableOpacity
                  style={styles.picker}
                  onPress={() => {
                    closeAllPickers();
                    setShowBrandPicker(!showBrandPicker);
                  }}
                >
                  <Text style={[styles.pickerText, !selectedBrand && styles.placeholderText]} numberOfLines={1}>
                    {selectedBrand || 'Select'}
                  </Text>
                  <ChevronDown color={colors.textLight} size={18} />
                </TouchableOpacity>
              </View>
              <View style={styles.halfPicker}>
                <Text style={styles.label}>MODEL</Text>
                <TouchableOpacity
                  style={[styles.picker, !selectedBrand && styles.pickerDisabled]}
                  onPress={() => {
                    if (selectedBrand) {
                      closeAllPickers();
                      setShowModelPicker(!showModelPicker);
                    }
                  }}
                  disabled={!selectedBrand}
                >
                  <Text style={[styles.pickerText, !selectedModel && styles.placeholderText]} numberOfLines={1}>
                    {selectedModel || 'Select'}
                  </Text>
                  <ChevronDown color={colors.textLight} size={18} />
                </TouchableOpacity>
              </View>
            </View>
            {showBrandPicker && renderPickerDropdown(
              filteredBrands.map(b => ({ label: b.name, value: b.name })),
              selectedBrand,
              handleBrandSelect,
              brandSearch,
              setBrandSearch,
              'Search brand...',
            )}
            {showModelPicker && availableModels.length > 0 && renderPickerDropdown(
              filteredModels.map(m => ({ label: m, value: m })),
              selectedModel,
              handleModelSelect,
              modelSearch,
              setModelSearch,
              'Search model...',
            )}

            {additionalCars.map((car, index) => (
              <View key={car.id || `add-car-${index}`} style={styles.secondaryCarRow}>
                <View style={styles.secondaryCarLeft}>
                  {isValidImageUri(car.picture) ? (
                    <Image source={{ uri: car.picture }} style={styles.secondaryCarThumb} />
                  ) : (
                    <View style={styles.secondaryCarThumbPlaceholder}>
                      <Car color={colors.textLight} size={20} />
                    </View>
                  )}
                  <View style={styles.secondaryCarInfo}>
                    <Text style={styles.secondaryCarName} numberOfLines={1}>{car.brand} {car.model}</Text>
                    <Text style={styles.newCarLabel}>New</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveAdditionalCar(car.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X color={colors.danger} size={18} />
                </TouchableOpacity>
              </View>
            ))}

            {showAddCarForm ? (
              <View style={styles.addCarForm}>
                <TouchableOpacity style={styles.carImagePickerSmall} onPress={pickNewCarPicture}>
                  {newCarPicture ? (
                    <Image source={{ uri: newCarPicture }} style={styles.carImageSmall} />
                  ) : (
                    <View style={styles.carImagePlaceholderSmall}>
                      <Camera color={colors.textLight} size={20} />
                    </View>
                  )}
                </TouchableOpacity>
                <View style={styles.rowPickers}>
                  <View style={styles.halfPicker}>
                    <Text style={styles.label}>BRAND</Text>
                    <TouchableOpacity
                      style={styles.picker}
                      onPress={() => {
                        closeAllPickers();
                        setShowNewBrandPicker(!showNewBrandPicker);
                      }}
                    >
                      <Text style={[styles.pickerText, !newCarBrand && styles.placeholderText]} numberOfLines={1}>
                        {newCarBrand || 'Select'}
                      </Text>
                      <ChevronDown color={colors.textLight} size={18} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.halfPicker}>
                    <Text style={styles.label}>MODEL</Text>
                    <TouchableOpacity
                      style={[styles.picker, !newCarBrand && styles.pickerDisabled]}
                      onPress={() => {
                        if (newCarBrand) {
                          closeAllPickers();
                          setShowNewModelPicker(!showNewModelPicker);
                        }
                      }}
                      disabled={!newCarBrand}
                    >
                      <Text style={[styles.pickerText, !newCarModel && styles.placeholderText]} numberOfLines={1}>
                        {newCarModel || 'Select'}
                      </Text>
                      <ChevronDown color={colors.textLight} size={18} />
                    </TouchableOpacity>
                  </View>
                </View>
                {showNewBrandPicker && renderPickerDropdown(
                  filteredNewBrands.map(b => ({ label: b.name, value: b.name })),
                  newCarBrand,
                  handleNewBrandSelect,
                  newBrandSearch,
                  setNewBrandSearch,
                  'Search brand...',
                )}
                {showNewModelPicker && newCarModels.length > 0 && renderPickerDropdown(
                  filteredNewModels.map(m => ({ label: m, value: m })),
                  newCarModel,
                  handleNewModelSelect,
                  newModelSearch,
                  setNewModelSearch,
                  'Search model...',
                )}
                <View style={styles.addCarFormButtons}>
                  <TouchableOpacity
                    style={styles.cancelCarButton}
                    onPress={() => {
                      setShowAddCarForm(false);
                      setNewCarBrand('');
                      setNewCarModel('');
                      setNewCarPicture('');
                    }}
                  >
                    <Text style={styles.cancelCarButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmCarButton}
                    onPress={handleAddCar}
                  >
                    <Text style={styles.confirmCarButtonText}>Add Car</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addCarButton}
                onPress={() => setShowAddCarForm(true)}
              >
                <Plus color={colors.accent} size={20} />
                <Text style={styles.addCarButtonText}>ADD ANOTHER CAR</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      <TouchableOpacity
        style={[styles.saveButton, (isSubmitting || isCheckingDisplayName) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={isSubmitting || isCheckingDisplayName}
        activeOpacity={0.8}
      >
        <Text style={styles.saveButtonText}>
          {isSubmitting || isCheckingDisplayName ? 'Saving...' : authMode === 'signin' ? 'Sign In' : 'Create Account'}
        </Text>
      </TouchableOpacity>

      <View style={styles.dividerContainer}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={[styles.googleButton, (isGoogleLoading || !request) && styles.googleButtonDisabled]}
        onPress={handleGoogleButtonPress}
        disabled={isGoogleLoading || !request}
        activeOpacity={0.7}
      >
        {isGoogleLoading ? (
          <ActivityIndicator size="small" color="#4285F4" />
        ) : (
          <>
            <View style={styles.googleIconContainer}>
              <Text style={styles.googleIcon}>G</Text>
            </View>
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.switchAuthButton}
        onPress={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
      >
        <Text style={styles.switchAuthText}>
          {authMode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <Text style={styles.switchAuthLink}>
            {authMode === 'signin' ? 'Sign Up' : 'Sign In'}
          </Text>
        </Text>
      </TouchableOpacity>
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: isAuthenticated ? 'Edit Profile' : authMode === 'signin' ? 'Sign In' : 'Create Account',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontSize: 16, fontWeight: '600' as const },
          headerTitleAlign: 'center',
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isAuthenticated ? renderAuthenticatedProfile() : renderAuthForm()}
        </ScrollView>
      </KeyboardAvoidingView>

      {showForgotPassword && (
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {resetStep === 'email' ? 'Reset Password' : resetStep === 'code' ? 'Enter Code' : 'New Password'}
              </Text>
              <TouchableOpacity onPress={() => setShowForgotPassword(false)} style={styles.modalCloseButton}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {resetStep === 'email' && (
              <>
                <Text style={styles.modalDescription}>
                  Enter your email address and we will send you a code to reset your password.
                </Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>EMAIL</Text>
                  <TextInput
                    style={styles.input}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    placeholder="Enter your email"
                    placeholderTextColor={colors.textLight}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.saveButton, isResetting && styles.saveButtonDisabled]}
                  onPress={handleRequestResetCode}
                  disabled={isResetting}
                >
                  <Text style={styles.saveButtonText}>
                    {isResetting ? 'Sending...' : 'Send Reset Code'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {resetStep === 'code' && (
              <>
                <Text style={styles.modalDescription}>
                  Enter the 6-digit code sent to {resetEmail}
                </Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>RESET CODE</Text>
                  <TextInput
                    style={styles.input}
                    value={resetCode}
                    onChangeText={setResetCode}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor={colors.textLight}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.saveButton, isResetting && styles.saveButtonDisabled]}
                  onPress={handleVerifyCode}
                  disabled={isResetting}
                >
                  <Text style={styles.saveButtonText}>
                    {isResetting ? 'Verifying...' : 'Verify Code'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRequestResetCode} style={styles.resendCodeButton}>
                  <Text style={styles.resendCodeText}>Resend Code</Text>
                </TouchableOpacity>
              </>
            )}

            {resetStep === 'newPassword' && (
              <>
                <Text style={styles.modalDescription}>
                  Enter your new password.
                </Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>NEW PASSWORD</Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={styles.passwordInput}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Enter new password"
                      placeholderTextColor={colors.textLight}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.passwordToggle}
                      onPress={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff size={20} color={colors.textLight} />
                      ) : (
                        <Eye size={20} color={colors.textLight} />
                      )}
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.passwordHint}>Must be at least 6 characters</Text>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>CONFIRM PASSWORD</Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={styles.passwordInput}
                      value={confirmNewPassword}
                      onChangeText={setConfirmNewPassword}
                      placeholder="Confirm new password"
                      placeholderTextColor={colors.textLight}
                      secureTextEntry={!showConfirmNewPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.passwordToggle}
                      onPress={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                    >
                      {showConfirmNewPassword ? (
                        <EyeOff size={20} color={colors.textLight} />
                      ) : (
                        <Eye size={20} color={colors.textLight} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.saveButton, isResetting && styles.saveButtonDisabled]}
                  onPress={handleResetPassword}
                  disabled={isResetting}
                >
                  <Text style={styles.saveButtonText}>
                    {isResetting ? 'Resetting...' : 'Reset Password'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 50,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 8,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: `${colors.accent}40`,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  avatarImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
  },
  avatarPlaceholder: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
  },
  profileName: {
    fontSize: 20,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    marginBottom: 4,
  },
  avatarSubtext: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  tapToChangeText: {
    fontSize: 11,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
    marginTop: 6,
    letterSpacing: 1.5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 16,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionAccentBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Orbitron_700Bold',
    color: colors.text,
    letterSpacing: 1,
  },
  sectionContent: {
    marginBottom: 24,
  },
  useLocationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  useLocationPillText: {
    fontSize: 11,
    fontFamily: 'Orbitron_600SemiBold',
    color: '#FFFFFF',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.textLight,
    marginBottom: 8,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: 'Orbitron_400Regular',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bioInput: {
    height: 80,
    paddingTop: 14,
  },
  charCount: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    textAlign: 'right' as const,
    marginTop: 4,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Orbitron_400Regular',
    color: colors.danger,
    marginTop: 6,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 15,
    fontFamily: 'Orbitron_400Regular',
    color: colors.text,
  },
  passwordToggle: {
    padding: 14,
  },
  passwordHint: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 6,
  },
  rowPickers: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  halfPicker: {
    flex: 1,
    marginBottom: 12,
  },
  picker: {
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerDisabled: {
    opacity: 0.5,
  },
  pickerText: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.text,
    flex: 1,
  },
  placeholderText: {
    color: colors.textLight,
  },
  pickerOptions: {
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 250,
    overflow: 'hidden',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.text,
    padding: 0,
  },
  noResults: {
    padding: 16,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  pickerScroll: {
    maxHeight: 200,
  },
  pickerOption: {
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerOptionSelected: {
    backgroundColor: `${colors.accent}10`,
  },
  pickerOptionText: {
    fontSize: 14,
    fontFamily: 'Orbitron_400Regular',
    color: colors.text,
  },
  pickerOptionTextSelected: {
    color: colors.accent,
    fontFamily: 'Orbitron_500Medium',
  },
  primaryCarCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
    backgroundColor: colors.cardBackground,
  },
  primaryCarImage: {
    width: '100%',
    height: 180,
  },
  primaryCarImagePlaceholder: {
    width: '100%',
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryCarPlaceholderText: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
  },
  primaryBadgeRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  primaryBadge: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  removeCarBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBadgeText: {
    fontSize: 10,
    fontFamily: 'Orbitron_700Bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  carImagePicker: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: colors.cardBackground,
  },
  carImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.cardLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  carImagePlaceholderText: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginTop: 8,
  },
  secondaryCarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryCarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  secondaryCarThumb: {
    width: 56,
    height: 38,
    borderRadius: 8,
  },
  secondaryCarThumbPlaceholder: {
    width: 56,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryCarInfo: {
    flex: 1,
  },
  secondaryCarName: {
    fontSize: 14,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  secondaryCarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newCarLabel: {
    fontSize: 11,
    fontFamily: 'Orbitron_400Regular',
    color: colors.accent,
    marginTop: 2,
  },
  addCarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  addCarButtonText: {
    fontSize: 12,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.accent,
    letterSpacing: 1,
  },
  addCarForm: {
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  carImagePickerSmall: {
    width: 80,
    height: 54,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
    alignSelf: 'center',
  },
  carImageSmall: {
    width: '100%',
    height: '100%',
  },
  carImagePlaceholderSmall: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  addCarFormButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelCarButton: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  cancelCarButtonText: {
    fontSize: 13,
    fontFamily: 'Orbitron_500Medium',
    color: colors.textLight,
  },
  confirmCarButton: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  confirmCarButtonText: {
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Orbitron_700Bold',
    letterSpacing: 0.5,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 16,
  },
  signOutText: {
    color: colors.accent,
    fontSize: 13,
    fontFamily: 'Orbitron_600SemiBold',
    letterSpacing: 1,
  },
  switchAuthButton: {
    alignItems: 'center',
    marginTop: 20,
    padding: 12,
  },
  switchAuthText: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
  },
  switchAuthLink: {
    color: colors.accent,
    fontFamily: 'Orbitron_600SemiBold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginHorizontal: 16,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardLight,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIcon: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 15,
    fontFamily: 'Orbitron_500Medium',
    color: colors.text,
  },
  forgotPasswordButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    fontSize: 13,
    fontFamily: 'Orbitron_500Medium',
    color: colors.accent,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  modalContent: {
    backgroundColor: colors.cardLight,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Orbitron_600SemiBold',
    color: colors.text,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalDescription: {
    fontSize: 13,
    fontFamily: 'Orbitron_400Regular',
    color: colors.textLight,
    marginBottom: 20,
    lineHeight: 20,
  },
  resendCodeButton: {
    alignItems: 'center',
    marginTop: 16,
    padding: 8,
  },
  resendCodeText: {
    fontSize: 13,
    fontFamily: 'Orbitron_500Medium',
    color: colors.accent,
  },
});
