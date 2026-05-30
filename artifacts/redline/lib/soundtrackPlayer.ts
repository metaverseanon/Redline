import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import type { AudioPlayer } from 'expo-audio';

type Listener = () => void;

let player: AudioPlayer | null = null;
let currentUrl: string | null = null;
let currentlyPlaying = false;
let initFailed = false;
let modeSet = false;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((l) => l());
}

function getAudio(): typeof import('expo-audio') | null {
  if (initFailed) return null;
  try {
    return require('expo-audio') as typeof import('expo-audio');
  } catch {
    initFailed = true;
    return null;
  }
}

function ensureMode(audio: typeof import('expo-audio')): void {
  if (modeSet) return;
  modeSet = true;
  try {
    void audio.setAudioModeAsync({ playsInSilentMode: true });
  } catch {
    // best effort
  }
}

function releasePlayer(): void {
  if (player) {
    try {
      player.remove();
    } catch {
      // ignore
    }
    player = null;
  }
}

export function stopPreview(): void {
  if (player) {
    try {
      player.pause();
    } catch {
      // ignore
    }
  }
  releasePlayer();
  currentUrl = null;
  currentlyPlaying = false;
  notify();
}

export function togglePreview(url: string): void {
  const audio = getAudio();
  if (!audio) return;

  // Same track currently playing -> pause it.
  if (currentUrl === url && currentlyPlaying) {
    try {
      player?.pause();
    } catch {
      // ignore
    }
    currentlyPlaying = false;
    notify();
    return;
  }

  // Same track paused -> resume.
  if (currentUrl === url && player && !currentlyPlaying) {
    try {
      player.play();
      currentlyPlaying = true;
      notify();
      return;
    } catch {
      // fall through to recreate
    }
  }

  // New track -> release the old player and create a fresh one.
  releasePlayer();
  try {
    ensureMode(audio);
    player = audio.createAudioPlayer({ uri: url });
    player.addListener('playbackStatusUpdate', (status) => {
      if (status?.didJustFinish) {
        releasePlayer();
        currentUrl = null;
        currentlyPlaying = false;
        notify();
      }
    });
    player.play();
    currentUrl = url;
    currentlyPlaying = true;
    notify();
  } catch (err) {
    console.error('[SOUNDTRACK] play error:', err);
    releasePlayer();
    currentUrl = null;
    currentlyPlaying = false;
    notify();
  }
}

export function usePreviewPlayback(url: string | undefined): { isPlaying: boolean; toggle: () => void } {
  const [, force] = useState(0);

  useEffect(() => {
    const l: Listener = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const isPlaying = !!url && currentUrl === url && currentlyPlaying;
  const toggle = (): void => {
    if (!url || Platform.OS === 'web') return;
    togglePreview(url);
  };

  return { isPlaying, toggle };
}
