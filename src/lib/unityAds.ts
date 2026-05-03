// ============================================================
// REAL UNITY ADS — Capacitor Plugin Bridge (v4)
// Project ID : db811c8a-0baf-4a79-bed2-441b81170297
// Android Game ID : 6104683
// testMode  : false  (LIVE ADS)
// ============================================================
// v4 additions:
//  - 30-second timeout wrapper on every loadRewardedVideo() call
//  - Auto-retry up to 3 times with 5-second back-off between attempts
//  - retryLoadAds() exported for manual retry from UI "Retry" button
//  - 'retrying' status type so UI shows progress during retries
// ============================================================

import { UnityAds as UnityAdsPlugin } from 'capacitor-unity-ads';

export const UNITY_PROJECT_ID  = 'db811c8a-0baf-4a79-bed2-441b81170297';
export const UNITY_GAME_ID     = '6104683';
export const UNITY_TEST_MODE   = false;

export const PLACEMENTS = {
  REWARDED:     'Rewarded_Android',
  INTERSTITIAL: 'Interstitial_Android',
} as const;

// ─── Timeouts / retry config ──────────────────────────────────
const LOAD_TIMEOUT_MS   = 30_000;   // 30 s — wait this long before giving up one attempt
const RETRY_DELAY_MS    = 5_000;    // 5 s  — pause between each retry attempt
const MAX_LOAD_RETRIES  = 3;        // try up to 3 times total before marking load_failed
const COOLDOWN_MS       = 30_000;

// ─── Internal state ───────────────────────────────────────────
let sdkReady            = false;
let initPromise: Promise<void> | null = null;
let rewardedLoaded      = false;
let interstitialLoaded  = false;
let lastAdCompletedAt   = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;

// ─── AD RESULT ────────────────────────────────────────────────
export type AdResult =
  | { success: true;  reward: number }
  | { success: false; reason: 'not_available' | 'not_completed' | 'cooldown' | 'daily_limit' };

// ─── UI STATUS (reactive) ─────────────────────────────────────
export type UnityAdsStatusType =
  | 'initializing'
  | 'ready'
  | 'rewarded_loaded'
  | 'retrying'
  | 'load_failed'
  | 'not_available';

let _uiStatus: UnityAdsStatusType = 'initializing';
const _statusListeners: Array<(s: UnityAdsStatusType) => void> = [];

function setStatus(s: UnityAdsStatusType): void {
  _uiStatus = s;
  _statusListeners.forEach(fn => fn(s));
}

export function getUnityAdsStatus(): UnityAdsStatusType { return _uiStatus; }

export function onUnityAdsStatusChange(fn: (s: UnityAdsStatusType) => void): () => void {
  _statusListeners.push(fn);
  return () => {
    const idx = _statusListeners.indexOf(fn);
    if (idx !== -1) _statusListeners.splice(idx, 1);
  };
}

// ─── Helper: race a promise against a timeout ─────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[UnityAds] Timeout after ${ms / 1000}s — ${label}`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// ─── Helper: sleep ────────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── INITIALIZE SDK ───────────────────────────────────────────
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

      await UnityAdsPlugin.initialize({ gameId: UNITY_GAME_ID, testMode: UNITY_TEST_MODE });

      sdkReady = true;
      setStatus('ready');
      console.log('[UnityAds] ✅ SDK initialized! Now loading ad placements...');

      // Load both placements — rewarded uses retry logic
      await Promise.allSettled([
        loadRewardedVideoAd(),
        loadInterstitialAd(),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('not_available');
      initPromise = null;
      console.error('[UnityAds] ❌ INIT FAILED:', msg);
      console.error('[UnityAds]    → Check Game ID:', UNITY_GAME_ID);
      console.error('[UnityAds]    → Bundle ID must be: com.ashish.bharatcash');
      console.error('[UnityAds]    → Ensure INTERNET + ACCESS_NETWORK_STATE permissions');
    }
  })();

  return initPromise;
}

// ─── LOAD REWARDED VIDEO (with timeout + auto-retry) ──────────
export async function loadRewardedVideoAd(): Promise<void> {
  if (!sdkReady) {
    console.warn('[UnityAds] ⚠️  loadRewardedVideoAd: SDK not ready — skipping');
    return;
  }

  for (let attempt = 1; attempt <= MAX_LOAD_RETRIES; attempt++) {
    try {
      console.log(`[UnityAds] 📥 Loading rewarded ad (attempt ${attempt}/${MAX_LOAD_RETRIES})`);
      console.log('[UnityAds]    Game ID   :', UNITY_GAME_ID);
      console.log('[UnityAds]    Placement :', PLACEMENTS.REWARDED);
      console.log('[UnityAds]    Timeout   :', LOAD_TIMEOUT_MS / 1000, 's');

      if (attempt > 1) setStatus('retrying');

      await withTimeout(
        UnityAdsPlugin.loadRewardedVideo({ placementId: PLACEMENTS.REWARDED }),
        LOAD_TIMEOUT_MS,
        `loadRewardedVideo attempt ${attempt}`
      );

      // ✅ Success
      rewardedLoaded = true;
      setStatus('rewarded_loaded');
      console.log('[UnityAds] ✅ Rewarded ad LOADED successfully!');
      console.log('[UnityAds]    Placement:', PLACEMENTS.REWARDED);
      console.log('[UnityAds]    Attempt  :', attempt, '/', MAX_LOAD_RETRIES);
      return; // exit retry loop

    } catch (err: unknown) {
      rewardedLoaded = false;
      const msg = err instanceof Error ? err.message : String(err);

      console.error(`[UnityAds] ❌ onUnityAdsFailedToLoad [Rewarded] — attempt ${attempt}/${MAX_LOAD_RETRIES}`);
      console.error('[UnityAds]    Game ID   :', UNITY_GAME_ID);
      console.error('[UnityAds]    Placement :', PLACEMENTS.REWARDED);
      console.error('[UnityAds]    Error Code:', msg);

      if (attempt < MAX_LOAD_RETRIES) {
        console.log(`[UnityAds] 🔄 Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        setStatus('retrying');
        await sleep(RETRY_DELAY_MS);
      } else {
        // All attempts exhausted
        setStatus('load_failed');
        console.error('[UnityAds] ❌ All', MAX_LOAD_RETRIES, 'load attempts failed.');
        console.error('[UnityAds]    → Verify "Rewarded_Android" ad unit is ACTIVE in Unity Dashboard');
        console.error('[UnityAds]    → Unity Dashboard: Monetization → Ad Units → Game ID:', UNITY_GAME_ID);
        console.error('[UnityAds]    → No-fill is normal for new apps; wait for impressions to warm up');

        // Schedule one final background retry after 60 seconds
        scheduleBackgroundRetry();
      }
    }
  }
}

// ─── BACKGROUND RETRY after all attempts fail ─────────────────
function scheduleBackgroundRetry(): void {
  if (_retryTimer) clearTimeout(_retryTimer);
  const BACKGROUND_RETRY_MS = 60_000; // 60 seconds
  console.log('[UnityAds] ⏰ Background retry scheduled in 60s...');
  _retryTimer = setTimeout(async () => {
    _retryTimer = null;
    if (!sdkReady) return;
    console.log('[UnityAds] 🔄 Background retry firing...');
    await loadRewardedVideoAd();
  }, BACKGROUND_RETRY_MS);
}

// ─── MANUAL RETRY — called by UI "Retry" button ───────────────
export async function retryLoadAds(): Promise<void> {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  console.log('[UnityAds] 🔁 Manual retry triggered by user');
  if (!sdkReady) {
    console.log('[UnityAds]    SDK not ready — re-initializing first...');
    await initializeUnityAds();
    return; // initializeUnityAds already calls loadRewardedVideoAd
  }
  await Promise.allSettled([
    loadRewardedVideoAd(),
    loadInterstitialAd(),
  ]);
}

// ─── LOAD INTERSTITIAL ────────────────────────────────────────
export async function loadInterstitialAd(): Promise<void> {
  if (!sdkReady) return;
  try {
    console.log('[UnityAds] 📥 Loading interstitial — placement:', PLACEMENTS.INTERSTITIAL);
    await withTimeout(
      UnityAdsPlugin.loadInterstitial({ placementId: PLACEMENTS.INTERSTITIAL }),
      LOAD_TIMEOUT_MS,
      'loadInterstitial'
    );
    interstitialLoaded = true;
    console.log('[UnityAds] ✅ Interstitial LOADED — placement:', PLACEMENTS.INTERSTITIAL);
  } catch (err: unknown) {
    interstitialLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UnityAds] ❌ onUnityAdsFailedToLoad [Interstitial]:', msg);
    console.error('[UnityAds]    Placement:', PLACEMENTS.INTERSTITIAL, '| Game ID:', UNITY_GAME_ID);
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
    console.warn('[UnityAds] 🚫 Server limit —', serverCheck.reason);
    return { success: false, reason: 'daily_limit' };
  }

  if (!sdkReady) {
    console.error('[UnityAds] ❌ SDK not ready — retrying init...');
    await initializeUnityAds();
    if (!sdkReady) return { success: false, reason: 'not_available' };
  }

  if (!rewardedLoaded) {
    console.log('[UnityAds] 🔄 Ad not loaded — attempting on-demand load with retries...');
    await loadRewardedVideoAd();
    if (!rewardedLoaded) return { success: false, reason: 'not_available' };
  }

  try {
    console.log('[UnityAds] ▶️  Showing rewarded ad — placement:', PLACEMENTS.REWARDED);
    rewardedLoaded = false;

    const result = await UnityAdsPlugin.showRewardedVideo();
    console.log('[UnityAds] 📊 showRewardedVideo result:', JSON.stringify(result));

    loadRewardedVideoAd(); // pre-load next

    if (result.success) {
      lastAdCompletedAt = Date.now();
      console.log('[UnityAds] 🎉 REWARD EARNED — +0.2 coins | data:', JSON.stringify(result.reward));
      return { success: true, reward: 0.2 };
    } else {
      console.warn('[UnityAds] ⏭️  Ad closed without reward (skipped / closed early)');
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
    await loadInterstitialAd();
    if (!interstitialLoaded) return { success: false, reason: 'not_available' };
  }

  try {
    console.log('[UnityAds] ▶️  Showing interstitial — placement:', PLACEMENTS.INTERSTITIAL);
    interstitialLoaded = false;
    const result = await UnityAdsPlugin.showInterstitial();
    console.log('[UnityAds] 📊 showInterstitial result:', JSON.stringify(result));
    loadInterstitialAd();
    if (result.success) return { success: true, reward: 0.2 };
    return { success: false, reason: 'not_completed' };
  } catch (err: unknown) {
    interstitialLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UnityAds] ❌ onUnityAdsShowFailure [Interstitial]:', msg);
    loadInterstitialAd();
    return { success: false, reason: 'not_available' };
  }
}

// ─── DIAGNOSTICS ──────────────────────────────────────────────
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
  console.log('  Load Timeout       :', LOAD_TIMEOUT_MS / 1000, 's');
  console.log('  Retry Delay        :', RETRY_DELAY_MS / 1000, 's');
  console.log('  Max Retries        :', MAX_LOAD_RETRIES);
  console.log('  Rewarded Placement :', PLACEMENTS.REWARDED);
  console.log('  Interstitial Place :', PLACEMENTS.INTERSTITIAL);
  console.log('==============================');
}
