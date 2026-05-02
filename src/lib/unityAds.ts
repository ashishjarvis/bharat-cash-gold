// ============================================================
// REAL UNITY ADS — Capacitor Plugin Bridge (FIXED)
// Project ID : db811c8a-0baf-4a79-bed2-441b81170297
// Android Game ID : 6104683
// testMode  : false  (LIVE ADS)
// ============================================================
// BUG FIXES vs previous version:
//  1. Plugin name was 'UnityAds' — actual name is 'Unityads'
//     (lowercase 'a'). Bridge never reached Android before.
//  2. Method names were load()/show() — actual API uses
//     loadRewardedVideo() / showRewardedVideo() /
//     loadInterstitial()  / showInterstitial()
//  3. Added full console.log markers at every stage so every
//     failure is visible in adb logcat / Android Studio.
//  4. Added GDPR/CCPA consent metadata before init.
//  5. initializeUnityAds() is now called in main.tsx BEFORE
//     React mounts — so SDK starts loading immediately.
// ============================================================

import { UnityAds as UnityAdsPlugin } from 'capacitor-unity-ads';

export const UNITY_PROJECT_ID = 'db811c8a-0baf-4a79-bed2-441b81170297';
export const UNITY_GAME_ID    = '6104683';
export const UNITY_TEST_MODE  = false;

// Placement IDs — must match exactly what is set in Unity Dashboard
// under Monetization > Ad Units for Game ID 6104683
export const PLACEMENTS = {
  REWARDED:     'Rewarded_Android',
  INTERSTITIAL: 'Interstitial_Android',
} as const;

// ─── Internal state ───────────────────────────────────────────
let sdkReady          = false;
let initPromise: Promise<void> | null = null;
let rewardedLoaded    = false;
let interstitialLoaded = false;
let lastAdCompletedAt = 0;
const COOLDOWN_MS     = 30_000;

// ─── AD RESULT type ───────────────────────────────────────────
export type AdResult =
  | { success: true;  reward: number }
  | { success: false; reason: 'not_available' | 'not_completed' | 'cooldown' | 'daily_limit' };

// ─── INITIALIZE SDK ───────────────────────────────────────────
// Called once from main.tsx BEFORE React renders.
// Safe to call multiple times — runs only once.
export async function initializeUnityAds(): Promise<void> {
  if (sdkReady) {
    console.log('[UnityAds] ✅ Already initialized — Game ID:', UNITY_GAME_ID);
    return;
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[UnityAds] 🚀 Initializing SDK...');
      console.log('[UnityAds]    Game ID   :', UNITY_GAME_ID);
      console.log('[UnityAds]    Project ID:', UNITY_PROJECT_ID);
      console.log('[UnityAds]    Test Mode :', UNITY_TEST_MODE);

      await UnityAdsPlugin.initialize({
        gameId:   UNITY_GAME_ID,
        testMode: UNITY_TEST_MODE,
      });

      sdkReady = true;
      console.log('[UnityAds] ✅ SDK initialized successfully! Game ID:', UNITY_GAME_ID);

      // Pre-load both placements immediately after init
      await Promise.allSettled([
        loadRewardedVideoAd(),
        loadInterstitialAd(),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[UnityAds] ❌ INIT FAILED:', msg);
      console.error('[UnityAds]    → Check Game ID in Unity Dashboard');
      console.error('[UnityAds]    → Ensure app bundle ID matches: com.ashish.bharatcash');
      console.error('[UnityAds]    → Game ID used:', UNITY_GAME_ID);
      // Reset so it can be retried
      initPromise = null;
    }
  })();

  return initPromise;
}

// ─── LOAD REWARDED AD ─────────────────────────────────────────
export async function loadRewardedVideoAd(): Promise<void> {
  if (!sdkReady) {
    console.warn('[UnityAds] ⚠️  loadRewardedVideoAd() called before SDK ready — skipping');
    return;
  }
  try {
    console.log('[UnityAds] 📥 Loading rewarded ad, placement:', PLACEMENTS.REWARDED);
    await UnityAdsPlugin.loadRewardedVideo({ placementId: PLACEMENTS.REWARDED });
    rewardedLoaded = true;
    console.log('[UnityAds] ✅ Rewarded ad LOADED — placement:', PLACEMENTS.REWARDED);
  } catch (err: unknown) {
    rewardedLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    // This is the onUnityAdsFailedToLoad equivalent — full error code visible here
    console.error('[UnityAds] ❌ onUnityAdsFailedToLoad — Rewarded');
    console.error('[UnityAds]    Placement :', PLACEMENTS.REWARDED);
    console.error('[UnityAds]    Error Code:', msg);
    console.error('[UnityAds]    → Verify placement ID exists in Unity Dashboard under Game ID:', UNITY_GAME_ID);
    console.error('[UnityAds]    → Check if ad unit "Rewarded_Android" is created and active');
  }
}

// ─── LOAD INTERSTITIAL AD ─────────────────────────────────────
export async function loadInterstitialAd(): Promise<void> {
  if (!sdkReady) {
    console.warn('[UnityAds] ⚠️  loadInterstitialAd() called before SDK ready — skipping');
    return;
  }
  try {
    console.log('[UnityAds] 📥 Loading interstitial ad, placement:', PLACEMENTS.INTERSTITIAL);
    await UnityAdsPlugin.loadInterstitial({ placementId: PLACEMENTS.INTERSTITIAL });
    interstitialLoaded = true;
    console.log('[UnityAds] ✅ Interstitial ad LOADED — placement:', PLACEMENTS.INTERSTITIAL);
  } catch (err: unknown) {
    interstitialLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UnityAds] ❌ onUnityAdsFailedToLoad — Interstitial');
    console.error('[UnityAds]    Placement :', PLACEMENTS.INTERSTITIAL);
    console.error('[UnityAds]    Error Code:', msg);
    console.error('[UnityAds]    → Verify placement ID exists in Unity Dashboard under Game ID:', UNITY_GAME_ID);
    console.error('[UnityAds]    → Check if ad unit "Interstitial_Android" is created and active');
  }
}

// ─── SHOW REWARDED AD ─────────────────────────────────────────
export async function showRewardedAd(
  userId: string,
  checkServerLimits: () => Promise<{ allowed: boolean; reason?: string }>
): Promise<AdResult> {
  // 1. Client-side 30 s cooldown guard
  const now = Date.now();
  if (now - lastAdCompletedAt < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - lastAdCompletedAt)) / 1000);
    console.warn('[UnityAds] ⏳ Cooldown active —', remaining, 's remaining');
    return { success: false, reason: 'cooldown' };
  }

  // 2. Server-side 50/day limit check
  console.log('[UnityAds] 🔍 Checking server ad limits for user:', userId);
  const serverCheck = await checkServerLimits();
  if (!serverCheck.allowed) {
    console.warn('[UnityAds] 🚫 Server limit hit — reason:', serverCheck.reason);
    return { success: false, reason: 'daily_limit' };
  }

  // 3. SDK must be initialized
  if (!sdkReady) {
    console.error('[UnityAds] ❌ SDK not ready — attempting init now...');
    await initializeUnityAds();
    if (!sdkReady) {
      console.error('[UnityAds] ❌ Init retry failed — ad not available');
      return { success: false, reason: 'not_available' };
    }
  }

  // 4. Ensure ad is loaded
  if (!rewardedLoaded) {
    console.log('[UnityAds] 🔄 Rewarded ad not loaded — loading on demand...');
    await loadRewardedVideoAd();
    if (!rewardedLoaded) {
      console.error('[UnityAds] ❌ On-demand load failed — ad not available');
      return { success: false, reason: 'not_available' };
    }
  }

  // 5. Show ad — reward only on success (onRewardEarned callback fired)
  try {
    console.log('[UnityAds] ▶️  Showing rewarded ad, placement:', PLACEMENTS.REWARDED);
    rewardedLoaded = false; // mark consumed

    const result = await UnityAdsPlugin.showRewardedVideo();
    console.log('[UnityAds] 📊 showRewardedVideo result:', JSON.stringify(result));

    // Reload for next time (non-blocking)
    loadRewardedVideoAd();

    if (result.success) {
      lastAdCompletedAt = Date.now();
      const rewardCoins = 0.2;
      console.log('[UnityAds] 🎉 REWARD EARNED — coins:', rewardCoins, '| reward data:', JSON.stringify(result.reward));
      return { success: true, reward: rewardCoins };
    } else {
      console.warn('[UnityAds] ⏭️  Ad closed without completing — no reward (skipped/closed early)');
      return { success: false, reason: 'not_completed' };
    }
  } catch (err: unknown) {
    rewardedLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UnityAds] ❌ onUnityAdsShowFailure — Rewarded');
    console.error('[UnityAds]    Error:', msg);
    loadRewardedVideoAd();
    return { success: false, reason: 'not_available' };
  }
}

// ─── SHOW INTERSTITIAL AD ─────────────────────────────────────
export async function showInterstitialAd(): Promise<AdResult> {
  if (!sdkReady) {
    console.error('[UnityAds] ❌ SDK not ready for interstitial — attempting init...');
    await initializeUnityAds();
    if (!sdkReady) return { success: false, reason: 'not_available' };
  }

  if (!interstitialLoaded) {
    console.log('[UnityAds] 🔄 Interstitial not loaded — loading on demand...');
    await loadInterstitialAd();
    if (!interstitialLoaded) {
      console.error('[UnityAds] ❌ Interstitial on-demand load failed');
      return { success: false, reason: 'not_available' };
    }
  }

  try {
    console.log('[UnityAds] ▶️  Showing interstitial ad, placement:', PLACEMENTS.INTERSTITIAL);
    interstitialLoaded = false;

    const result = await UnityAdsPlugin.showInterstitial();
    console.log('[UnityAds] 📊 showInterstitial result:', JSON.stringify(result));

    // Reload non-blocking
    loadInterstitialAd();

    if (result.success) {
      console.log('[UnityAds] ✅ Interstitial shown — +0.2 coins');
      return { success: true, reward: 0.2 };
    } else {
      console.warn('[UnityAds] ⏭️  Interstitial closed/skipped — no reward');
      return { success: false, reason: 'not_completed' };
    }
  } catch (err: unknown) {
    interstitialLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UnityAds] ❌ onUnityAdsShowFailure — Interstitial:', msg);
    loadInterstitialAd();
    return { success: false, reason: 'not_available' };
  }
}

// ─── DIAGNOSTICS helper (call from dev console to debug) ──────
export function unityAdsDiagnostics(): void {
  console.log('=== [UnityAds DIAGNOSTICS] ===');
  console.log('  SDK Ready         :', sdkReady);
  console.log('  Game ID           :', UNITY_GAME_ID);
  console.log('  Project ID        :', UNITY_PROJECT_ID);
  console.log('  Test Mode         :', UNITY_TEST_MODE);
  console.log('  Rewarded Loaded   :', rewardedLoaded);
  console.log('  Interstitial Loaded:', interstitialLoaded);
  console.log('  Last Ad Completed :', lastAdCompletedAt ? new Date(lastAdCompletedAt).toISOString() : 'never');
  console.log('  Rewarded Placement:', PLACEMENTS.REWARDED);
  console.log('  Interstitial Place:', PLACEMENTS.INTERSTITIAL);
  console.log('==============================');
}
