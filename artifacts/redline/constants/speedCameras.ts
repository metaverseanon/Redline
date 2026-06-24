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

// Half-angle of the forward cone used to decide whether a camera is "ahead" in
// the direction of travel. ±75° (a 150° cone) is wide enough to keep catching
// cameras around bends while still rejecting cameras behind you, on the
// opposite carriageway, or on parallel streets.
export const SPEED_CAMERA_BEARING_TOLERANCE_DEG = 75;
// When a reliable GPS heading isn't available (stationary / course not settled)
// we fall back to a minimum speed before warning, so the app never alerts while
// parked next to a camera but still warns when actually driving.
export const SPEED_CAMERA_MIN_WARN_SPEED_KMH = 15;

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

// Initial bearing (degrees, 0–360, clockwise from north) from point 1 → point 2.
export const bearingBetween = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
};

// Smallest absolute difference between two compass bearings, in [0, 180].
export const angularDifference = (a: number, b: number): number => {
  return Math.abs(((a - b + 540) % 360) - 180);
};

// True when the camera lies within the forward cone of the current heading,
// i.e. the driver is travelling toward it rather than away from / past it.
export const isCameraAhead = (
  latitude: number,
  longitude: number,
  headingDeg: number,
  cameraLat: number,
  cameraLon: number,
  toleranceDeg: number = SPEED_CAMERA_BEARING_TOLERANCE_DEG
): boolean => {
  const bearingToCamera = bearingBetween(latitude, longitude, cameraLat, cameraLon);
  return angularDifference(headingDeg, bearingToCamera) <= toleranceDeg;
};
