export interface SpeedCamera {
  id: string;
  latitude: number;
  longitude: number;
  speedLimit?: number;
  direction?: string;
  description?: string;
}

export const SPEED_CAMERA_DETECTION_RADIUS_KM = 0.08;
export const SPEED_CAMERA_WARNING_RADIUS_KM = 0.5;
export const SPEED_CAMERA_FETCH_RADIUS_KM = 5;
export const SPEED_CAMERA_REFETCH_THRESHOLD_KM = 3;

export const SPEED_CAMERA_RESTRICTED_COUNTRIES = [
  'Germany',
  'Switzerland',
];

export const isSpeedCameraRestricted = (country: string | undefined | null): boolean => {
  if (!country) return false;
  return SPEED_CAMERA_RESTRICTED_COUNTRIES.some(
    (restricted) => restricted.toLowerCase() === country.toLowerCase()
  );
};

let cachedCameras: SpeedCamera[] = [];

export const setCachedCameras = (cameras: SpeedCamera[]): void => {
  const dedup = new Map<string, SpeedCamera>();
  for (const c of cachedCameras) dedup.set(c.id, c);
  for (const c of cameras) dedup.set(c.id, c);
  cachedCameras = Array.from(dedup.values());
};

export const getCachedCameras = (): SpeedCamera[] => cachedCameras;

export const clearCachedCameras = (): void => {
  cachedCameras = [];
};

export const getNearbyCameras = (
  latitude: number,
  longitude: number,
  radiusKm: number = SPEED_CAMERA_DETECTION_RADIUS_KM
): SpeedCamera[] => {
  return cachedCameras.filter(camera => {
    const dist = haversineDistance(latitude, longitude, camera.latitude, camera.longitude);
    return dist <= radiusKm;
  });
};

export const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
