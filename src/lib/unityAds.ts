// ============================================
// REAL UNITY ADS — Capacitor Plugin Bridge
// Project ID: db811c8a-0baf-4a79-bed2-441b81170297
// Game ID: 6104683 | Platform: Android
// testMode: false (LIVE ADS)
// ============================================
// Reward is granted ONLY inside onUnityAdsShowComplete
// with state === 'COMPLETED'. Skipped/closed/failed = 0.
// ============================================

import { registerPlugin } from '@capacitor/core';

export const UNITY_PROJECT_ID = 'db811c8a-0baf-4a79-bed2-441b81170297';
export const UNITY_GAME_ID = '6104683';
export const UNITY_TEST_MODE = false;

export const PLACEMENTS = {
  REWARDED: 'Rewarded_Android',
  INTERSTITIAL: 'Interstitial_Android',
} as const;

// --- Capacitor plugin interface ---
interface UnityAdsPlugin {
  initialize(options: { gameId: string; testMode: boolean }): Promise<void>;
  load(options: { placementId: string }): Promise<void>;
  show(options: { placementId: string }): Promise<{ state: 'COMPLETED' | 'SKIPPED' | 'ERROR' }>;
  isReady(options: { placementId: string }): Promise<{ ready: boolean }>;
  addListener(eventName: string, listenerFunc: (...args: unknown[]) => void): Promise<{ remove: () => void }>;
}

// Register the native Capacitor plugin — works on Android; safe no-op on web
const UnityAds = registerPlugin<UnityAdsPlugin>('UnityAds', {
  web: {
    // Web stub: ads are only available on Android. All stubs reject with a clear error.
    initialize: async () => {
      console.info('[UnityAds] Web stub: SDK not available in browser.');
    },
    load: async () => {
      throw new Error('Unity Ads only available on Android');
    },
    show: async () => {
      throw new Error('Unity Ads only available on Android');
    },
    isReady: async () => ({ ready: false }),
    addListener: async () => ({ remove: () => {} }),
  },
});

// --- Internal state ---
let sdkReady = false;
let initPromise: Promise<void> | null = null;
const adReadyState: Record<string, boolean> = {};
let lastAdCompletedAt = 0;
const COOLDOWN_MS = 30_000; // 30-second cooldown between ads

// --- Initialize SDK once at app launch ---
export async function initializeUnityAds(): Promise<void> {
  if (sdkReady) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await UnityAds.initialize({ gameId: UNITY_GAME_ID, testMode: UNITY_TEST_MODE });
      sdkReady = true;
      // Pre-load both placements right after init
      await preloadAd(PLACEMENTS.REWARDED);
      await preloadAd(PLACEMENTS.INTERSTITIAL);
    } catch (err) {
      // On web/unsupported environments, initialization is a no-op
      console.info('[UnityAds] Not available in this environment:', err);
    }
  })();

  return initPromise;
}

// --- Preload a placement so it is ready when user clicks ---
export async function preloadAd(placementId: string): Promise<void> {
  if (!sdkReady) return;
  try {
    await UnityAds.load({ placementId });
    adReadyState[placementId] = true;
  } catch {
    adReadyState[placementId] = false;
  }
}

export function isAdReady(placementId: string): boolean {
  return !!adReadyState[placementId];
}

// --- AD RESULT ---
export type AdResult =
  | { success: true; reward: number }
  | { success: false; reason: 'not_available' | 'not_completed' | 'cooldown' | 'daily_limit' };

// --- Show a rewarded ad and return reward ONLY on COMPLETED ---
export async function showRewardedAd(
  userId: string,
  checkServerLimits: () => Promise<{ allowed: boolean; reason?: string }>
): Promise<AdResult> {
  // 1. Client-side 30s cooldown guard
  const now = Date.now();
  if (now - lastAdCompletedAt < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - lastAdCompletedAt)) / 1000);
    return { success: false, reason: 'cooldown' };
  }

  // 2. Server-side limit check (50 ads/day)
  const serverCheck = await checkServerLimits();
  if (!serverCheck.allowed) {
    return { success: false, reason: 'daily_limit' };
  }

  // 3. Ensure SDK is ready and placement loaded
  if (!sdkReady || !adReadyState[PLACEMENTS.REWARDED]) {
    // Try to load on demand
    try {
      await preloadAd(PLACEMENTS.REWARDED);
    } catch {
      return { success: false, reason: 'not_available' };
    }
    if (!adReadyState[PLACEMENTS.REWARDED]) {
      return { success: false, reason: 'not_available' };
    }
  }

  // 4. Show ad — reward ONLY if state === COMPLETED
  try {
    adReadyState[PLACEMENTS.REWARDED] = false; // mark as consumed
    const result = await UnityAds.show({ placementId: PLACEMENTS.REWARDED });

    if (result.state === 'COMPLETED') {
      lastAdCompletedAt = Date.now();
      // Reload for next time
      preloadAd(PLACEMENTS.REWARDED);
      return { success: true, reward: 0.2 };
    } else {
      // SKIPPED or ERROR — no reward
      preloadAd(PLACEMENTS.REWARDED);
      return { success: false, reason: 'not_completed' };
    }
  } catch {
    adReadyState[PLACEMENTS.REWARDED] = false;
    preloadAd(PLACEMENTS.REWARDED);
    return { success: false, reason: 'not_available' };
  }
}

// --- Show an interstitial ad (no reward, just triggers) ---
export async function showInterstitialAd(): Promise<AdResult> {
  if (!sdkReady || !adReadyState[PLACEMENTS.INTERSTITIAL]) {
    try {
      await preloadAd(PLACEMENTS.INTERSTITIAL);
    } catch {
      return { success: false, reason: 'not_available' };
    }
    if (!adReadyState[PLACEMENTS.INTERSTITIAL]) {
      return { success: false, reason: 'not_available' };
    }
  }

  try {
    adReadyState[PLACEMENTS.INTERSTITIAL] = false;
    const result = await UnityAds.show({ placementId: PLACEMENTS.INTERSTITIAL });
    preloadAd(PLACEMENTS.INTERSTITIAL);

    // Interstitial reward: 0.2 coins ONLY if user watched it to completion
    if (result.state === 'COMPLETED') {
      return { success: true, reward: 0.2 };
    }
    return { success: false, reason: 'not_completed' };
  } catch {
    preloadAd(PLACEMENTS.INTERSTITIAL);
    return { success: false, reason: 'not_available' };
  }
}
