import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { UserProfile, UserCar } from '@/types/user';
import { trpcClient } from '@/lib/trpc';
import { COUNTRIES } from '@/constants/countries';
import { uploadProfilePicture, uploadCarPicture } from '@/lib/imageUpload';

const USER_KEY = 'user_profile';

export const [UserProvider, useUser] = createContextHook(() => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const userRef = useRef<UserProfile | null>(null);

  useEffect(() => {
    void loadUser();
  }, []);

  const locationSyncedRef = useRef(false);

  useEffect(() => {
    const autoDetectLocation = async () => {
      if (locationSyncedRef.current) return;
      locationSyncedRef.current = true;

      const currentUser = userRef.current;
      if (!currentUser) return;

      if (Platform.OS === 'web') return;

      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('[LOCATION] No location permission, skipping auto-detect');
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const [geocode] = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        if (!geocode) return;

        const countryName = geocode.country || '';
        const cityName = geocode.city || geocode.subregion || geocode.region || '';

        const matchedCountry = COUNTRIES.find(
          c => c.name.toLowerCase() === countryName.toLowerCase() ||
               c.code.toLowerCase() === (geocode.isoCountryCode || '').toLowerCase()
        );

        if (!matchedCountry) {
          console.log('[LOCATION] Could not match country:', countryName);
          return;
        }

        const newCountry = matchedCountry.code;
        const matchedCity = matchedCountry.cities.find(
          c => c.toLowerCase() === cityName.toLowerCase()
        ) || cityName;

        if (newCountry === currentUser.country && matchedCity === currentUser.city) {
          console.log('[LOCATION] Location unchanged, skipping update');
          return;
        }

        console.log('[LOCATION] Auto-updating location:', matchedCountry.name, matchedCity);
        const updatedUser = { ...currentUser, country: newCountry, city: matchedCity };
        await saveUser(updatedUser);

        try {
          await trpcClient.user.updateUserLocation.mutate({
            userId: currentUser.id,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          console.log('[LOCATION] Location synced to backend');
        } catch (backendError) {
          console.error('[LOCATION] Failed to sync location to backend:', backendError);
        }
      } catch (error) {
        console.error('[LOCATION] Auto-detect location failed:', error);
      }
    };

    if (user && !isLoading) {
      void autoDetectLocation();
    }
  }, [user, isLoading]);

  const profileSyncedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const maxRetries = 5;

    const ensureUserInBackend = async (retryCount = 0) => {
      if (cancelled || profileSyncedRef.current) return;

      const currentUser = userRef.current;
      if (!currentUser?.id || !currentUser?.displayName) return;

      try {
        console.log('[USER] Ensuring user exists in backend DB:', currentUser.id, currentUser.displayName, retryCount > 0 ? `(retry ${retryCount})` : '');
        const result = await trpcClient.user.ensureUser.mutate({
          id: currentUser.id,
          email: currentUser.email || '',
          displayName: currentUser.displayName,
          country: currentUser.country,
          city: currentUser.city,
          carBrand: currentUser.carBrand,
          carModel: currentUser.carModel,
          bio: currentUser.bio,
          profilePicture: currentUser.profilePicture || null,
        });
        if (result && 'success' in result && !result.success) {
          console.warn('[USER] ensureUser returned failure:', result);
          throw new Error(('error' in result ? String(result.error) : 'Unknown backend error'));
        }
        profileSyncedRef.current = true;
        console.log('[USER] ensureUser sync complete');
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`[USER] ensureUser sync failed (attempt ${retryCount + 1}/${maxRetries}):`, msg);
        if (retryCount < maxRetries - 1) {
          const delay = Math.min(3000 * Math.pow(1.5, retryCount), 15000);
          console.log('[USER] Retrying ensureUser in', Math.round(delay), 'ms');
          await new Promise(resolve => setTimeout(resolve, delay));
          if (!cancelled) {
            await ensureUserInBackend(retryCount + 1);
          }
        } else {
          console.warn('[USER] ensureUser sync failed after all retries, will retry on next app focus');
          profileSyncedRef.current = false;
        }
      }
    };

    if (user && !isLoading) {
      void ensureUserInBackend();
    }

    return () => { cancelled = true; };
  }, [user, isLoading]);

  useEffect(() => {
    const syncTimezone = async () => {
      const currentUser = userRef.current;
      if (!currentUser) return;
      
      const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detectedTimezone && currentUser.timezone !== detectedTimezone) {
        console.log('Updating user timezone:', detectedTimezone);
        const updatedUser = { ...currentUser, timezone: detectedTimezone };
        await saveUser(updatedUser);
        
        try {
          await trpcClient.user.updateTimezone.mutate({
            userId: currentUser.id,
            timezone: detectedTimezone,
          });
          console.log('Timezone synced to backend');
        } catch (error) {
          console.error('Failed to sync timezone to backend:', error);
        }
      }
    };
    
    if (user && !isLoading) {
      void syncTimezone();
    }
  }, [user, isLoading]);

  const loadUser = async () => {
    try {
      const stored = await AsyncStorage.getItem(USER_KEY);
      if (stored) {
        const userData = JSON.parse(stored);
        userRef.current = userData;
        setUser(userData);
      }
    } catch (error) {
      console.error('Failed to load user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveUser = async (userData: UserProfile) => {
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
      userRef.current = userData;
      setUser(userData);
    } catch (error) {
      console.error('Failed to save user:', error);
    }
  };

  const signUp = useCallback(async (
    email: string, 
    displayName: string,
    password: string,
    country?: string, 
    city?: string, 
    carBrand?: string, 
    carModel?: string,
    profilePicture?: string,
    carPicture?: string,
    additionalCars?: UserCar[]
  ) => {
    const cars: UserCar[] = [];
    if (carBrand && carModel) {
      cars.push({
        id: Date.now().toString(),
        brand: carBrand,
        model: carModel,
        picture: carPicture,
        isPrimary: true,
      });
    }
    if (additionalCars) {
      cars.push(...additionalCars);
    }
    const userId = Date.now().toString();

    try {
      console.log('Attempting to register user:', { email, displayName, country, city, carBrand, carModel });
      const result = await trpcClient.user.register.mutate({
        id: userId,
        email,
        displayName,
        password,
        country,
        city,
        carBrand,
        carModel,
      });
      console.log('Registration result:', JSON.stringify(result, null, 2));
      
      if (!result.success) {
        const errorMsg = (result as { error?: string }).error || 'Registration failed';
        console.error('Registration failed with error:', errorMsg);
        throw new Error(errorMsg);
      }
      console.log('User registered on backend successfully');
    } catch (error: any) {
      console.error('Failed to register user on backend:', error);
      // Extract the most useful error message
      let errorMessage = 'Registration failed. Please try again.';
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (error?.shape?.message) {
        errorMessage = error.shape.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      throw new Error(errorMessage);
    }

    const newUser: UserProfile = {
      id: userId,
      email: email.trim().toLowerCase(),
      displayName,
      profilePicture,
      country,
      city,
      carBrand,
      carModel,
      carPicture,
      cars: cars.length > 0 ? cars : undefined,
      createdAt: Date.now(),
    };
    await saveUser(newUser);

    return newUser;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await trpcClient.user.login.mutate({ email, password });
      
      if (!result.success) {
        return { 
          success: false, 
          error: result.error || 'incorrect_password',
          message: result.message 
        };
      }

      const stored = await AsyncStorage.getItem(USER_KEY);
      let userData: UserProfile;
      
      if (stored) {
        const localData = JSON.parse(stored);
        if (localData.email?.toLowerCase() === email.toLowerCase()) {
          userData = {
            ...localData,
            ...result.user,
          };
        } else {
          userData = {
            ...result.user,
            createdAt: result.user?.createdAt || Date.now(),
          } as UserProfile;
        }
      } else {
        userData = {
          ...result.user,
          createdAt: result.user?.createdAt || Date.now(),
        } as UserProfile;
      }

      await saveUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'network_error', message: 'Failed to connect. Please try again.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(USER_KEY);
      setUser(null);
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  }, []);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const updatedUser = { ...currentUser, ...updates };
    await saveUser(updatedUser);
  }, []);

  const updateCar = useCallback(async (carBrand: string, carModel: string, carPicture?: string) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const updatedCars = currentUser.cars ? [...currentUser.cars] : [];
    const primaryIndex = updatedCars.findIndex(c => c.isPrimary);
    if (primaryIndex >= 0) {
      updatedCars[primaryIndex] = { ...updatedCars[primaryIndex], brand: carBrand, model: carModel, picture: carPicture };
    } else {
      updatedCars.unshift({
        id: Date.now().toString(),
        brand: carBrand,
        model: carModel,
        picture: carPicture,
        isPrimary: true,
      });
    }
    const updatedUser = { ...currentUser, carBrand, carModel, carPicture, cars: updatedCars };
    await saveUser(updatedUser);
  }, []);

  const addCar = useCallback(async (brand: string, model: string, picture?: string) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const newCar: UserCar = {
      id: Date.now().toString(),
      brand,
      model,
      picture,
      isPrimary: false,
    };
    const updatedCars = currentUser.cars ? [...currentUser.cars, newCar] : [newCar];
    const updatedUser = { ...currentUser, cars: updatedCars };
    await saveUser(updatedUser);
  }, []);

  const removeCar = useCallback(async (carId: string) => {
    const currentUser = userRef.current;
    if (!currentUser || !currentUser.cars) return;
    const updatedCars = currentUser.cars.filter(c => c.id !== carId);
    const updatedUser = { ...currentUser, cars: updatedCars };
    await saveUser(updatedUser);
  }, []);

  const setPrimaryCar = useCallback(async (carId: string) => {
    const currentUser = userRef.current;
    if (!currentUser || !currentUser.cars) return;
    const updatedCars = currentUser.cars.map(c => ({
      ...c,
      isPrimary: c.id === carId,
    }));
    const primaryCar = updatedCars.find(c => c.isPrimary);
    const updatedUser = {
      ...currentUser,
      cars: updatedCars,
      carBrand: primaryCar?.brand,
      carModel: primaryCar?.model,
      carPicture: primaryCar?.picture,
    };
    await saveUser(updatedUser);
  }, []);

  const updateProfilePicture = useCallback(async (profilePicture: string) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const updatedUser = { ...currentUser, profilePicture };
    await saveUser(updatedUser);
  }, []);

  const syncImagesToBackend = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser) return;

    console.log('[USER] Starting image sync to backend for user:', currentUser.id);

    try {
      let profilePicUrl = currentUser.profilePicture;
      if (profilePicUrl && (profilePicUrl.startsWith('file://') || profilePicUrl.startsWith('content://'))) {
        const uploaded = await uploadProfilePicture(profilePicUrl, currentUser.id);
        if (uploaded) {
          profilePicUrl = uploaded;
          console.log('[USER] Profile picture uploaded:', uploaded.substring(0, 60));
        }
      }

      let updatedCars: UserCar[] | undefined;
      if (currentUser.cars && currentUser.cars.length > 0) {
        updatedCars = [];
        for (const car of currentUser.cars) {
          let carPicUrl = car.picture;
          if (carPicUrl && (carPicUrl.startsWith('file://') || carPicUrl.startsWith('content://'))) {
            const uploaded = await uploadCarPicture(carPicUrl, currentUser.id, car.id);
            if (uploaded) {
              carPicUrl = uploaded;
              console.log('[USER] Car picture uploaded for', car.brand, car.model);
            }
          }
          updatedCars.push({ ...car, picture: carPicUrl });
        }
      }

      let carPicUrl = currentUser.carPicture;
      if (carPicUrl && (carPicUrl.startsWith('file://') || carPicUrl.startsWith('content://'))) {
        const uploaded = await uploadCarPicture(carPicUrl, currentUser.id, 'primary');
        if (uploaded) {
          carPicUrl = uploaded;
        }
      }

      const updatedUser = {
        ...currentUser,
        profilePicture: profilePicUrl,
        carPicture: carPicUrl,
        cars: updatedCars || currentUser.cars,
      };
      await saveUser(updatedUser);

      await trpcClient.user.updateProfileImages.mutate({
        userId: currentUser.id,
        profilePicture: profilePicUrl || null,
        carPicture: carPicUrl || null,
        cars: (updatedCars || currentUser.cars || []).map(c => ({
          id: c.id,
          brand: c.brand,
          model: c.model,
          picture: c.picture,
          isPrimary: c.isPrimary,
        })),
      });

      console.log('[USER] Images synced to backend successfully');
    } catch (error) {
      console.error('[USER] Failed to sync images to backend:', error);
    }
  }, []);

  const updateSocialAccounts = useCallback(async (instagramUsername?: string, tiktokUsername?: string) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const updatedUser = { ...currentUser, instagramUsername, tiktokUsername };
    await saveUser(updatedUser);
    console.log('[USER] Social accounts updated:', { instagramUsername, tiktokUsername });
  }, []);

  const updateCountry = useCallback(async (country: string) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const updatedUser = { ...currentUser, country };
    await saveUser(updatedUser);
  }, []);

  const updateCity = useCallback(async (city: string) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const updatedUser = { ...currentUser, city };
    await saveUser(updatedUser);
  }, []);

  const updateLocation = useCallback(async (country: string, city: string) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const updatedUser = { ...currentUser, country, city };
    await saveUser(updatedUser);
  }, []);

  const getCarDisplayName = useCallback(() => {
    if (user?.carBrand && user?.carModel) {
      return `${user.carBrand} ${user.carModel}`;
    }
    return null;
  }, [user]);

  const signInWithGoogle = useCallback(async (
    email: string,
    displayName: string,
    profilePicture?: string
  ) => {
    const stored = await AsyncStorage.getItem(USER_KEY);
    if (stored) {
      const userData = JSON.parse(stored);
      if (userData.email?.toLowerCase() === email.toLowerCase()) {
        if (profilePicture && !userData.profilePicture) {
          userData.profilePicture = profilePicture;
        }
        userRef.current = userData;
        setUser(userData);
        return { success: true, user: userData };
      }
    }
    
    const userId = Date.now().toString();
    const normalizedGoogleEmail = email.trim().toLowerCase();
    const newUser: UserProfile = {
      id: userId,
      email: normalizedGoogleEmail,
      displayName,
      profilePicture,
      createdAt: Date.now(),
      authProvider: 'google',
    };
    await saveUser(newUser);

    try {
      await trpcClient.user.register.mutate({
        id: userId,
        email: normalizedGoogleEmail,
        displayName,
      });
      console.log('Google user registered');
    } catch (error) {
      console.error('Failed to register Google user on backend:', error);
    }

    return { success: true, user: newUser };
  }, []);

  return useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    updateProfile,
    updateCar,
    addCar,
    removeCar,
    setPrimaryCar,
    updateProfilePicture,
    updateCountry,
    updateCity,
    updateLocation,
    getCarDisplayName,
    syncImagesToBackend,
    updateSocialAccounts,
  }), [user, isLoading, signUp, signIn, signOut, signInWithGoogle, updateProfile, updateCar, addCar, removeCar, setPrimaryCar, updateProfilePicture, updateCountry, updateCity, updateLocation, getCarDisplayName, syncImagesToBackend, updateSocialAccounts]);
});
