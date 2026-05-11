import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'app_settings';

let cachedPlayer: { play: () => void; release: () => void } | null = null;
let initFailed = false;

async function isEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!stored) return true;
    const parsed = JSON.parse(stored);
    return parsed.cameraWarningSoundEnabled !== false;
  } catch {
    return true;
  }
}

function loadPlayer(): { play: () => void; release: () => void } | null {
  if (cachedPlayer) return cachedPlayer;
  if (initFailed) return null;
  if (Platform.OS === 'web') {
    initFailed = true;
    return null;
  }
  try {
    const audio = require('expo-audio') as typeof import('expo-audio');
    const asset = require('../assets/sounds/camera-warning.wav');
    const player = audio.createAudioPlayer(asset);
    cachedPlayer = {
      play: () => {
        try {
          player.seekTo(0);
          player.play();
        } catch (err) {
          console.error('[CAMERA_WARN_SOUND] play error:', err);
        }
      },
      release: () => {
        try {
          player.remove();
        } catch {}
      },
    };
    return cachedPlayer;
  } catch (err) {
    console.error('[CAMERA_WARN_SOUND] init failed:', err);
    initFailed = true;
    return null;
  }
}

export async function playCameraWarningSound(): Promise<void> {
  if (Platform.OS === 'web') return;
  const enabled = await isEnabled();
  if (!enabled) return;
  const player = loadPlayer();
  if (!player) return;
  player.play();
}
