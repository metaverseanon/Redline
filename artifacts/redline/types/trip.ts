export interface Location {
  latitude: number;
  longitude: number;
  speed: number | null;
  timestamp: number;
  heading?: number | null;
}

export interface TripLocation {
  country?: string;
  city?: string;
}

export interface Soundtrack {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  previewUrl: string;
}

export interface TripStats {
  id: string;
  startTime: number;
  endTime?: number;
  distance: number;
  duration: number;
  avgSpeed: number;
  topSpeed: number;
  corners: number;
  carModel?: string;
  locations: Location[];
  acceleration?: number;
  maxGForce?: number;
  location?: TripLocation;
  time0to100?: number;
  time0to200?: number;
  time100to200?: number;
  time0to300?: number;
  speedCamerasDetected?: number;
  soundtrack?: Soundtrack;
}

export interface LeaderboardEntry {
  id: string;
  userName: string;
  carModel?: string;
  topSpeed: number;
  totalDistance: number;
  totalTrips: number;
  avgSpeed: number;
  rank: number;
}

export type LeaderboardCategory = 'topSpeed' | 'distance' | 'acceleration' | 'gForce' | 'totalDistance' | 'zeroToHundred' | 'zeroToTwoHundred' | 'hundredToTwoHundred' | 'challengesCompleted';

export interface LeaderboardFilters {
  country?: string;
  city?: string;
  carBrand?: string;
  carModel?: string;
}
