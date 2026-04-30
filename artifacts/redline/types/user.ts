export interface UserCar {
  id: string;
  brand: string;
  model: string;
  picture?: string;
  isPrimary?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  password?: string;
  displayName: string;
  profilePicture?: string;
  country?: string;
  city?: string;
  carBrand?: string;
  carModel?: string;
  carPicture?: string;
  cars?: UserCar[];
  bio?: string;
  instagramUsername?: string;
  tiktokUsername?: string;
  createdAt: number;
  pushToken?: string;
  notificationsEnabled?: boolean;
  authProvider?: 'email' | 'google';
  timezone?: string;
}

export interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
