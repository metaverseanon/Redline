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

export const SPEED_CAMERAS: SpeedCamera[] = [
  { id: 'hr-zg-slavonska-1', latitude: 45.7988, longitude: 15.9820, speedLimit: 60, description: 'Zagreb - Slavonska avenija' },
  { id: 'hr-zg-slavonska-2', latitude: 45.7975, longitude: 16.0015, speedLimit: 60, description: 'Zagreb - Slavonska avenija east' },
  { id: 'hr-zg-zagrebacka', latitude: 45.7930, longitude: 15.9190, speedLimit: 50, description: 'Zagreb - Zagrebačka avenija' },
  { id: 'hr-zg-branimirova', latitude: 45.8050, longitude: 15.9900, speedLimit: 50, description: 'Zagreb - Branimirova' },
  { id: 'hr-zg-vukovarska', latitude: 45.8020, longitude: 15.9750, speedLimit: 50, description: 'Zagreb - Vukovarska' },
  { id: 'hr-zg-avenija-dubrovnik', latitude: 45.7860, longitude: 15.9460, speedLimit: 60, description: 'Zagreb - Avenija Dubrovnik' },
  { id: 'hr-zg-horvacansko', latitude: 45.7850, longitude: 15.9680, speedLimit: 50, description: 'Zagreb - Horvaćansko' },
  { id: 'hr-zg-radnicka', latitude: 45.7920, longitude: 15.9860, speedLimit: 50, description: 'Zagreb - Radnička cesta' },
  { id: 'hr-zg-ilica', latitude: 45.8130, longitude: 15.9600, speedLimit: 50, description: 'Zagreb - Ilica' },
  { id: 'hr-zg-savska', latitude: 45.8040, longitude: 15.9640, speedLimit: 50, description: 'Zagreb - Savska cesta' },
  { id: 'hr-a1-lucko', latitude: 45.7600, longitude: 15.8900, speedLimit: 130, description: 'A1 - Lučko interchange' },
  { id: 'hr-a1-karlovac', latitude: 45.5050, longitude: 15.5700, speedLimit: 130, description: 'A1 - near Karlovac' },
  { id: 'hr-a3-jankomir', latitude: 45.8050, longitude: 15.8700, speedLimit: 100, description: 'A3 - Jankomir' },
  { id: 'hr-a3-ivanja-reka', latitude: 45.7900, longitude: 16.1100, speedLimit: 100, description: 'A3 - Ivanja Reka' },
  { id: 'hr-split-vukovarska', latitude: 43.5130, longitude: 16.4620, speedLimit: 50, description: 'Split - Vukovarska' },
  { id: 'hr-ri-krešimirova', latitude: 45.3370, longitude: 14.4420, speedLimit: 50, description: 'Rijeka - Krešimirova' },
  { id: 'hr-os-vukovarska', latitude: 45.5540, longitude: 18.6930, speedLimit: 50, description: 'Osijek - Vukovarska' },

  { id: 'de-a9-munich-1', latitude: 48.1800, longitude: 11.6100, speedLimit: 120, description: 'A9 near Munich' },
  { id: 'de-a3-cologne', latitude: 50.9400, longitude: 6.9600, speedLimit: 100, description: 'A3 near Cologne' },
  { id: 'de-a5-frankfurt', latitude: 50.1100, longitude: 8.6800, speedLimit: 100, description: 'A5 near Frankfurt' },
  { id: 'de-berlin-a100', latitude: 52.4900, longitude: 13.3500, speedLimit: 80, description: 'Berlin - A100' },

  { id: 'at-a1-vienna', latitude: 48.1900, longitude: 16.3400, speedLimit: 130, description: 'A1 near Vienna' },
  { id: 'at-a2-graz', latitude: 47.0700, longitude: 15.4400, speedLimit: 130, description: 'A2 near Graz' },
  { id: 'at-a10-salzburg', latitude: 47.8100, longitude: 13.0500, speedLimit: 100, description: 'A10 near Salzburg' },

  { id: 'si-a1-ljubljana', latitude: 46.0500, longitude: 14.5100, speedLimit: 130, description: 'A1 near Ljubljana' },
  { id: 'si-a2-maribor', latitude: 46.5500, longitude: 15.6500, speedLimit: 130, description: 'A2 near Maribor' },

  { id: 'it-a1-milan', latitude: 45.4700, longitude: 9.1900, speedLimit: 130, description: 'A1 near Milan' },
  { id: 'it-a4-venice', latitude: 45.4400, longitude: 12.3200, speedLimit: 130, description: 'A4 near Venice' },
  { id: 'it-a14-bologna', latitude: 44.4900, longitude: 11.3400, speedLimit: 130, description: 'A14 near Bologna' },

  { id: 'hu-m1-budapest', latitude: 47.5000, longitude: 19.0400, speedLimit: 130, description: 'M1 near Budapest' },
  { id: 'hu-m7-balaton', latitude: 46.9100, longitude: 17.8900, speedLimit: 130, description: 'M7 near Lake Balaton' },

  { id: 'rs-e75-belgrade', latitude: 44.7900, longitude: 20.4600, speedLimit: 120, description: 'E75 near Belgrade' },
  { id: 'rs-a1-novi-sad', latitude: 45.2600, longitude: 19.8400, speedLimit: 120, description: 'A1 near Novi Sad' },

  { id: 'ba-m17-sarajevo', latitude: 43.8600, longitude: 18.4100, speedLimit: 60, description: 'M17 Sarajevo' },
  { id: 'ba-a1-zenica', latitude: 44.2000, longitude: 17.9100, speedLimit: 120, description: 'A1 near Zenica' },

  { id: 'uk-m25-london', latitude: 51.5100, longitude: -0.1200, speedLimit: 112, description: 'M25 London orbital' },
  { id: 'uk-m1-luton', latitude: 51.8800, longitude: -0.4200, speedLimit: 112, description: 'M1 near Luton' },
  { id: 'uk-a1-newcastle', latitude: 54.9700, longitude: -1.6100, speedLimit: 112, description: 'A1 near Newcastle' },

  { id: 'fr-a6-paris', latitude: 48.8200, longitude: 2.3500, speedLimit: 130, description: 'A6 Paris south' },
  { id: 'fr-a7-lyon', latitude: 45.7600, longitude: 4.8400, speedLimit: 130, description: 'A7 near Lyon' },

  { id: 'es-ap7-barcelona', latitude: 41.3900, longitude: 2.1700, speedLimit: 120, description: 'AP-7 near Barcelona' },
  { id: 'es-a4-madrid', latitude: 40.4000, longitude: -3.7000, speedLimit: 120, description: 'A-4 near Madrid' },

  { id: 'nl-a4-amsterdam', latitude: 52.3500, longitude: 4.8900, speedLimit: 100, description: 'A4 near Amsterdam' },
  { id: 'nl-a2-utrecht', latitude: 52.0900, longitude: 5.1200, speedLimit: 100, description: 'A2 near Utrecht' },

  { id: 'be-e40-brussels', latitude: 50.8500, longitude: 4.3500, speedLimit: 120, description: 'E40 near Brussels' },

  { id: 'ch-a1-zurich', latitude: 47.3800, longitude: 8.5400, speedLimit: 120, description: 'A1 near Zurich' },
  { id: 'ch-a2-bern', latitude: 46.9500, longitude: 7.4500, speedLimit: 120, description: 'A2 near Bern' },

  { id: 'cz-d1-prague', latitude: 50.0700, longitude: 14.4400, speedLimit: 130, description: 'D1 near Prague' },
  { id: 'pl-a2-warsaw', latitude: 52.2300, longitude: 21.0100, speedLimit: 140, description: 'A2 near Warsaw' },

  { id: 'us-i95-ny', latitude: 40.7500, longitude: -73.9800, speedLimit: 88, description: 'I-95 New York area' },
  { id: 'us-i10-la', latitude: 34.0500, longitude: -118.2500, speedLimit: 104, description: 'I-10 Los Angeles' },
  { id: 'us-i90-chicago', latitude: 41.8800, longitude: -87.6300, speedLimit: 88, description: 'I-90 Chicago area' },

  { id: 'ae-e11-dubai', latitude: 25.2000, longitude: 55.2700, speedLimit: 120, description: 'E11 Sheikh Zayed Road, Dubai' },
  { id: 'ae-e311-abudhabi', latitude: 24.4500, longitude: 54.6500, speedLimit: 140, description: 'E311 Abu Dhabi' },
];

export const getNearbyCameras = (
  latitude: number,
  longitude: number,
  radiusKm: number = SPEED_CAMERA_DETECTION_RADIUS_KM
): SpeedCamera[] => {
  return SPEED_CAMERAS.filter(camera => {
    const dist = haversineDistance(latitude, longitude, camera.latitude, camera.longitude);
    return dist <= radiusKm;
  });
};

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
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
