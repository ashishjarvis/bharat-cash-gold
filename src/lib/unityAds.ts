// ============================================================
// REAL UNITY ADS — Capacitor Plugin Bridge (v3 — FULLY FIXED)
// Project ID : db811c8a-0baf-4a79-bed2-441b81170297
// Android Game ID : 6104683
// testMode  : false  (LIVE ADS)
// ============================================================
// v1 Bug: wrong plugin name 'UnityAds' vs actual 'Unityads'
// v2 Bug: wrong methods load()/show() vs loadRewardedVideo() etc.
// v3 Bug: setStatus() never wired in → UI always showed 'initializing'
//         DailyTasks used fake overlay with missing onComplete → stuck forever
// ============================================================

import { UnityAds as UnityAdsPlugin } from 'capacitor-unity-ads';

export const UNITY_PROJECT_ID = 'db811c8a-0baf-4a79-bed2-441b81170297';
export const UNITY_GAME_ID    = '6104683';
export const UNITY_TEST_MODE  = false;

// Placement IDs — MUST match exactly what is in Unity Dashboard
// Monetization → Ad Units for Game ID 6104683
export const PLACEMENTS = {
  REWARDED:     'Rewarded_Android',
  INTERSTITIAL: 'Interstitial_Android',
} as const;

// ─── Internal state ───────────────────────────────────────────
let sdkReady           = false;
let initPromise: Promise<void> | null = null;
let rewardedLoaded     = false;
let interstitialLoaded = false;
let lastAdCompletedAt  = 0;
const COOLDOWN_MS      = 30_000;

// ─── AD RESULT ────────────────────────────────────────────────
export type AdResult =
  | { success: true;  reward: number }
  | { success: false; reason: 'not_available' | 'not_completed' | 'cooldown' | 'daily_limit' };

// ─── UI STATUS (reactive) ─────────────────────────────────────
export type UnityAdsStatusType =
  | 'initializing'
  | 'ready'
  | 'rewarded_loaded'
  | 'load_failed'
  | 'not_available';

let _uiStatus: UnityAdsStatusType = 'initializing';
const _statusListeners: Array<(s: UnityAdsStatusType) => void> = [];

function setStatus(s: UnityAdsStatusType): void {
  _uiStatus = s;
  _statusListeners.forEach(fn => fn(s));
}

export function getUnityAdsStatus(): UnityAdsStatusType {
  return _uiStatus;
}

export function onUnityAdsStatusChange(fn: (s: UnityAdsStatusType) => void): () => void {
  _statusListeners.push(fn);
  return () => {
    const idx = _statusListeners.indexOf(fn);
    if (idx !== -1) _statusListeners.splice(idx, 1);
  };
}

// ─── INITIALIZE SDK ───────────────────────────────────────────
// Called from main.tsx BEFORE React renders so SDK starts ASAP.
export async function initializeUnityAds(): Promise<void> {
  if (sdkReady) {
    console.log('[UnityAds] ✅ Already initialized. Game ID:', UNITY_GAME_ID);
    return;
  }
  if (initPromise) return initPromise;

  setStatus('initializing');

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
      setStatus('ready');
      console.log('[UnityAds] ✅ SDK initialized! Game ID:', UNITY_GAME_ID);

      // Pre-load both placements right after init
      await Promise.allSettled([
        loadRewardedVideoAd(),
        loadInterstitialAd(),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('not_available');
      initPromise = null; // allow retry
      console.error('[UnityAds] ❌ INIT FAILED:', msg);
      console.error('[UnityAds]    → Verify Game ID in Unity Dashboard:', UNITY_GAME_ID);
      console.error('[UnityAds]    → Bundle ID must be: com.ashish.bharatcash');
      console.error('[UnityAds]    → Ensure INTERNET + ACCESS_NETWORK_STATE in AndroidManifest.xml');
    }
  })();

  return initPromise;
}

// ─── LOAD REWARDED VIDEO ──────────────────────────────────────
export async function loadRewardedVideoAd(): Promise<void> {
  if (!sdkReady) {
    console.warn('[UnityAds] ⚠️  loadRewardedVideoAd: SDK not ready');
    return;
  }
  try {
    console.log('[UnityAds] 📥 Loading rewarded ad — placement:', PLACEMENTS.REWARDED);
    await UnityAdsPlugin.loadRewardedVideo({ placementId: PLACEMENTS.REWARDED });
    rewardedLoaded = true;
    setStatus('rewarded_loaded');
    console.log('[UnityAds] ✅ Rewarded ad LOADED — placement:', PLACEMENTS.REWARDED);
  } catch (err: unknown) {
    rewardedLoaded = false;
    setStatus('load_failed');
    const msg = err instanceof Error ? err.message : String(err);
    // This is the onUnityAdsFailedToLoad equivalent
    console.error('[UnityAds] ❌ onUnityAdsFailedToLoad [Rewarded]');
    console.error('[UnityAds]    Placement  :', PLACEMENTS.REWARDED);
    console.error('[UnityAds]    Error Code :', msg);
    console.error('[UnityAds]    → Verify "Rewarded_Android" ad unit exists and is ACTIVE');
    console.error('[UnityAds]    → Game ID:', UNITY_GAME_ID);
  }
}

// ─── LOAD INTERSTITIAL ────────────────────────────────────────
export async function loadInterstitialAd(): Promise<void> {
  if (!sdkReady) {
    console.warn('[UnityAds] ⚠️  loadInterstitialAd: SDK not ready');
    return;
  }
  try {
    console.log('[UnityAds] 📥 Loading interstitial — placement:', PLACEMENTS.INTERSTITIAL);
    await UnityAdsPlugin.loadInterstitial({ placementId: PLACEMENTS.INTERSTITIAL });
    interstitialLoaded = true;
    console.log('[UnityAds] ✅ Interstitial LOADED — placement:', PLACEMENTS.INTERSTITIAL);
  } catch (err: unknown) {
    interstitialLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UnityAds] ❌ onUnityAdsFailedToLoad [Interstitial]');
    console.error('[UnityAds]    Placement  :', PLACEMENTS.INTERSTITIAL);
    console.error('[UnityAds]    Error Code :', msg);
    console.error('[UnityAds]    → Verify "Interstitial_Android" ad unit exists and is ACTIVE');
  }
}

// ─── SHOW REWARDED AD ─────────────────────────────────────────
export async function showRewardedAd(
  userId: string,
  checkServerLimits: () => Promise<{ allowed: boolean; reason?: string }>
): Promise<AdResult> {
  const now = Date.now();
  if (now - lastAdCompletedAt < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - lastAdCompletedAt)) / 1000);
    console.warn('[UnityAds] ⏳ Cooldown active —', remaining, 's remaining');
    return { success: false, reason: 'cooldown' };
  }

  console.log('[UnityAds] 🔍 Checking server limits for user:', userId);
  const serverCheck = await checkServerLimits();
  if (!serverCheck.allowed) {
    console.warn('[UnityAds] 🚫 Server limit — reason:', serverCheck.reason);
    return { success: false, reason: 'daily_limit' };
  }

  if (!sdkReady) {
    console.error('[UnityAds] ❌ SDK not ready — retrying init...');
    await initializeUnityAds();
    if (!sdkReady) return { success: false, reason: 'not_available' };
  }

  if (!rewardedLoaded) {
    console.log('[UnityAds] 🔄 Rewarded not loaded — on-demand load...');
    await loadRewardedVideoAd();
    if (!rewardedLoaded) return { success: false, reason: 'not_available' };
  }

  try {
    console.log('[UnityAds] ▶️  Showing rewarded ad — placement:', PLACEMENTS.REWARDED);
    rewardedLoaded = false;

    const result = await UnityAdsPlugin.showRewardedVideo();
    console.log('[UnityAds] 📊 showRewardedVideo result:', JSON.stringify(result));

    loadRewardedVideoAd(); // non-blocking reload

    if (result.success) {
      lastAdCompletedAt = Date.now();
      console.log('[UnityAds] 🎉 REWARD EARNED — +0.2 coins | reward:', JSON.stringify(result.reward));
      return { success: true, reward: 0.2 };
    } else {
      console.warn('[UnityAds] ⏭️  Ad closed without reward (skipped/closed early)');
      return { success: false, reason: 'not_completed' };
    }
  } catch (err: unknown) {
    rewardedLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UnityAds] ❌ onUnityAdsShowFailure [Rewarded]:', msg);
    loadRewardedVideoAd();
    return { success: false, reason: 'not_available' };
  }
}

// ─── SHOW INTERSTITIAL AD ─────────────────────────────────────
export async function showInterstitialAd(): Promise<AdResult> {
  if (!sdkReady) {
    await initializeUnityAds();
    if (!sdkReady) return { success: false, reason: 'not_available' };
  }

  if (!interstitialLoaded) {
    console.log('[UnityAds] 🔄 Interstitial not loaded — on-demand load...');
    await loadInterstitialAd();
    if (!interstitialLoaded) return { success: false, reason: 'not_available' };
  }

  try {
    console.log('[UnityAds] ▶️  Showing interstitial — placement:', PLACEMENTS.INTERSTITIAL);
    interstitialLoaded = false;

    const result = await UnityAdsPlugin.showInterstitial();
    console.log('[UnityAds] 📊 showInterstitial result:', JSON.stringify(result));

    loadInterstitialAd();

    if (result.success) {
      console.log('[UnityAds] ✅ Interstitial shown — +0.2 coins');
      return { success: true, reward: 0.2 };
    } else {
      console.warn('[UnityAds] ⏭️  Interstitial closed/skipped');
      return { success: false, reason: 'not_completed' };
    }
  } catch (err: unknown) {
    interstitialLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UnityAds] ❌ onUnityAdsShowFailure [Interstitial]:', msg);
    loadInterstitialAd();
    return { success: false, reason: 'not_available' };
  }
}

// ─── DIAGNOSTICS (call from any dev console) ──────────────────
export function unityAdsDiagnostics(): void {
  console.log('=== [UnityAds DIAGNOSTICS] ===');
  console.log('  SDK Ready          :', sdkReady);
  console.log('  UI Status          :', _uiStatus);
  console.log('  Game ID            :', UNITY_GAME_ID);
  console.log('  Project ID         :', UNITY_PROJECT_ID);
  console.log('  Test Mode          :', UNITY_TEST_MODE);
  console.log('  Rewarded Loaded    :', rewardedLoaded);
  console.log('  Interstitial Loaded:', interstitialLoaded);
  console.log('  Last Ad Completed  :', lastAdCompletedAt ? new Date(lastAdCompletedAt).toISOString() : 'never');
  console.log('  Rewarded Placement :', PLACEMENTS.REWARDED);
  console.log('  Interstitial Place :', PLACEMENTS.INTERSTITIAL);
  console.log('==============================');
}
