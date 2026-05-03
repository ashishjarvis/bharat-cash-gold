// ============================================================
// REAL UNITY ADS — Capacitor Plugin Bridge (v5)
// Project ID : db811c8a-0baf-4a79-bed2-441b81170297
// Android Game ID : 6104683
// testMode  : TRUE  ← temporarily enabled to confirm connectivity
// ============================================================
// v5 additions:
//  - testMode = true  → forces Unity test ads regardless of fill
//  - SDK version logged at startup via getVersion()
//  - Exact Unity error codes (NO_FILL / NETWORK_ERROR / INTERNAL_ERROR
//    / INVALID_ARGUMENT / TIMEOUT) now parsed from the error message
//    because the Java plugin only passes the string, not the enum.
//    The CI workflow patches Unityads.java so the enum name is now
//    embedded: "Failed to load rewarded video [NO_FILL]: ..."
//  - _lastErrorCode exported so the status badge can show the code
//  - In-app test banner shown when testMode=true & status=ready
// ============================================================

import { UnityAds as UnityAdsPlugin } from 'capacitor-unity-ads';

export const UNITY_PROJECT_ID  = 'db811c8a-0baf-4a79-bed2-441b81170297';
export const UNITY_GAME_ID     = '6104683';
// ⚠️  TEST MODE ON — confirms SDK connectivity; switch back to false once ads load
export const UNITY_TEST_MODE   = true;

export const PLACEMENTS = {
  REWARDED:     'Rewarded_Android',
  INTERSTITIAL: 'Interstitial_Android',
} as const;

// ─── Retry / timeout config ───────────────────────────────────
const LOAD_TIMEOUT_MS  = 30_000;   // 30 s per attempt
const RETRY_DELAY_MS   = 5_000;    // 5 s between attempts
const MAX_LOAD_RETRIES = 3;
const COOLDOWN_MS      = 30_000;

// ─── Internal state ───────────────────────────────────────────
let sdkReady           = false;
let initPromise: Promise<void> | null = null;
let rewardedLoaded     = false;
let interstitialLoaded = false;
let lastAdCompletedAt  = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _lastErrorCode     = 'NONE';
let _sdkVersion        = 'unknown';

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

export function getUnityAdsStatus(): UnityAdsStatusType  { return _uiStatus; }
export function getLastErrorCode():   string              { return _lastErrorCode; }
export function getSdkVersion():      string              { return _sdkVersion; }

export function onUnityAdsStatusChange(fn: (s: UnityAdsStatusType) => void): () => void {
  _statusListeners.push(fn);
  return () => {
    const idx = _statusListeners.indexOf(fn);
    if (idx !== -1) _statusListeners.splice(idx, 1);
  };
}

// ─── Parse Unity error code out of the message string ─────────
// The CI workflow patches Unityads.java so errors arrive as:
//   "Failed to load rewarded video [NO_FILL]: <details>"
// Fallback: scan for known Unity error enum names in any position.
const UNITY_ERROR_CODES = ['NO_FILL', 'NETWORK_ERROR', 'INTERNAL_ERROR', 'INVALID_ARGUMENT', 'TIMEOUT'] as const;

function parseErrorCode(msg: string): string {
  // Pattern 1: Java-patched format  "[NO_FILL]"
  const bracket = msg.match(/\[([A-Z_]+)\]/);
  if (bracket) return bracket[1];
  // Pattern 2: bare enum name anywhere in the string
  for (const code of UNITY_ERROR_CODES) {
    if (msg.toUpperCase().includes(code)) return code;
  }
  return msg.length > 60 ? msg.slice(0, 60) + '…' : msg;
}

// ─── Helper: timeout wrapper ──────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const t = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`TIMEOUT — ${label} exceeded ${ms / 1000}s`)), ms)
  );
  return Promise.race([promise, t]);
}

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
      console.log('[UnityAds] ═══════════════════════════════');
      console.log('[UnityAds] 🚀 INITIALIZING UNITY ADS SDK');
      console.log('[UnityAds]    Game ID    :', UNITY_GAME_ID);
      console.log('[UnityAds]    Project ID :', UNITY_PROJECT_ID);
      console.log('[UnityAds]    Test Mode  :', UNITY_TEST_MODE, '← TEST ADS ENABLED');
      console.log('[UnityAds]    Bundle ID  : com.ashish.bharatcash');
      console.log('[UnityAds] ═══════════════════════════════');

      // Step 1 — initialize
      await UnityAdsPlugin.initialize({ gameId: UNITY_GAME_ID, testMode: UNITY_TEST_MODE });

      // Step 2 — confirm test mode is set on the native side too
      await UnityAdsPlugin.setTestMode({ enabled: UNITY_TEST_MODE });

      // Step 3 — log SDK version
      try {
        const versionResult = await UnityAdsPlugin.getVersion();
        _sdkVersion = versionResult.version;
        console.log('[UnityAds] ✅ SDK version :', _sdkVersion);
      } catch {
        console.log('[UnityAds] ℹ️  getVersion() not supported on this build');
      }

      sdkReady = true;
      setStatus('ready');
      console.log('[UnityAds] ✅ SDK INITIALIZED SUCCESSFULLY');
      console.log('[UnityAds]    Test Mode active — Unity test ads will fill regardless of inventory');

      // Load placements
      await Promise.allSettled([
        loadRewardedVideoAd(),
        loadInterstitialAd(),
      ]);
    } catch (err: unknown) {
      const msg  = err instanceof Error ? err.message : String(err);
      const code = parseErrorCode(msg);
      _lastErrorCode = code;
      setStatus('not_available');
      initPromise = null;

      console.error('[UnityAds] ❌ ═══════════════════════════════');
      console.error('[UnityAds] ❌ INIT FAILED');
      console.error('[UnityAds]    Error Code  :', code);
      console.error('[UnityAds]    Full Message:', msg);
      console.error('[UnityAds]    Game ID     :', UNITY_GAME_ID);
      console.error('[UnityAds]    Bundle ID   : com.ashish.bharatcash');
      console.error('[UnityAds]    → Verify INTERNET + ACCESS_NETWORK_STATE in AndroidManifest');
      console.error('[UnityAds] ❌ ═══════════════════════════════');
    }
  })();

  return initPromise;
}

// ─── LOAD REWARDED VIDEO (timeout + auto-retry) ───────────────
export async function loadRewardedVideoAd(): Promise<void> {
  if (!sdkReady) {
    console.warn('[UnityAds] ⚠️  loadRewardedVideoAd: SDK not ready');
    return;
  }

  for (let attempt = 1; attempt <= MAX_LOAD_RETRIES; attempt++) {
    try {
      console.log('[UnityAds] ─────────────────────────────────');
      console.log(`[UnityAds] 📥 LOAD REWARDED — attempt ${attempt}/${MAX_LOAD_RETRIES}`);
      console.log('[UnityAds]    Game ID    :', UNITY_GAME_ID);
      console.log('[UnityAds]    Placement  :', PLACEMENTS.REWARDED);
      console.log('[UnityAds]    Test Mode  :', UNITY_TEST_MODE);
      console.log('[UnityAds]    Timeout    :', LOAD_TIMEOUT_MS / 1000, 's');
      console.log('[UnityAds] ─────────────────────────────────');

      if (attempt > 1) setStatus('retrying');

      await withTimeout(
        UnityAdsPlugin.loadRewardedVideo({ placementId: PLACEMENTS.REWARDED }),
        LOAD_TIMEOUT_MS,
        `loadRewardedVideo attempt ${attempt}`
      );

      // ✅ SUCCESS
      rewardedLoaded = true;
      _lastErrorCode = 'NONE';
      setStatus('rewarded_loaded');
      console.log('[UnityAds] ✅ ═══════════════════════════════');
      console.log('[UnityAds] ✅ REWARDED AD LOADED!');
      console.log('[UnityAds]    Placement:', PLACEMENTS.REWARDED);
      console.log('[UnityAds]    Attempt  :', attempt, '/', MAX_LOAD_RETRIES);
      console.log('[UnityAds]    Test Mode:', UNITY_TEST_MODE);
      console.log('[UnityAds] ✅ ═══════════════════════════════');
      return;

    } catch (err: unknown) {
      rewardedLoaded = false;
      const msg  = err instanceof Error ? err.message : String(err);
      const code = parseErrorCode(msg);
      _lastErrorCode = code;

      console.error('[UnityAds] ❌ ═══════════════════════════════');
      console.error(`[UnityAds] ❌ onUnityAdsFailedToLoad [Rewarded] — attempt ${attempt}/${MAX_LOAD_RETRIES}`);
      console.error('[UnityAds]    Error Code :', code);
      console.error('[UnityAds]    Full Error :', msg);
      console.error('[UnityAds]    Placement  :', PLACEMENTS.REWARDED);
      console.error('[UnityAds]    Game ID    :', UNITY_GAME_ID);
      console.error('[UnityAds]    Test Mode  :', UNITY_TEST_MODE);

      if (code === 'NO_FILL') {
        console.error('[UnityAds]    → NO_FILL: Unity has no ads to serve right now.');
        console.error('[UnityAds]      With testMode=true this should NOT happen.');
        console.error('[UnityAds]      Action: Verify Game ID in Unity Dashboard.');
        console.error('[UnityAds]      Action: Confirm Rewarded_Android placement exists & is ACTIVE.');
      } else if (code === 'INVALID_ARGUMENT') {
        console.error('[UnityAds]    → INVALID_ARGUMENT: placement ID or game ID is wrong!');
        console.error('[UnityAds]      Check "Rewarded_Android" exists in Unity Dashboard.');
        console.error('[UnityAds]      Game ID used:', UNITY_GAME_ID);
      } else if (code === 'NETWORK_ERROR') {
        console.error('[UnityAds]    → NETWORK_ERROR: device cannot reach Unity servers.');
        console.error('[UnityAds]      Check INTERNET + ACCESS_NETWORK_STATE permissions.');
      } else if (code === 'TIMEOUT') {
        console.error('[UnityAds]    → TIMEOUT: Unity servers too slow. Will retry.');
      } else if (code === 'INTERNAL_ERROR') {
        console.error('[UnityAds]    → INTERNAL_ERROR: Unity SDK internal failure. Will retry.');
      }
      console.error('[UnityAds] ❌ ═══════════════════════════════');

      if (attempt < MAX_LOAD_RETRIES) {
        console.log(`[UnityAds] 🔄 Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        setStatus('retrying');
        await sleep(RETRY_DELAY_MS);
      } else {
        setStatus('load_failed');
        console.error('[UnityAds] ❌ All', MAX_LOAD_RETRIES, 'attempts failed. Last code:', code);
        scheduleBackgroundRetry();
      }
    }
  }
}

// ─── Background retry after 60 s ─────────────────────────────
function scheduleBackgroundRetry(): void {
  if (_retryTimer) clearTimeout(_retryTimer);
  console.log('[UnityAds] ⏰ Background retry in 60 s...');
  _retryTimer = setTimeout(async () => {
    _retryTimer = null;
    if (!sdkReady) return;
    console.log('[UnityAds] 🔄 Background retry firing...');
    await loadRewardedVideoAd();
  }, 60_000);
}

// ─── Manual retry from UI button ─────────────────────────────
export async function retryLoadAds(): Promise<void> {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  console.log('[UnityAds] 🔁 Manual retry — Game ID:', UNITY_GAME_ID, '| Test Mode:', UNITY_TEST_MODE);
  if (!sdkReady) {
    console.log('[UnityAds]    Re-initializing first...');
    await initializeUnityAds();
    return;
  }
  await Promise.allSettled([loadRewardedVideoAd(), loadInterstitialAd()]);
}

// ─── LOAD INTERSTITIAL ────────────────────────────────────────
export async function loadInterstitialAd(): Promise<void> {
  if (!sdkReady) return;
  try {
    console.log('[UnityAds] 📥 Loading interstitial — placement:', PLACEMENTS.INTERSTITIAL, '| testMode:', UNITY_TEST_MODE);
    await withTimeout(
      UnityAdsPlugin.loadInterstitial({ placementId: PLACEMENTS.INTERSTITIAL }),
      LOAD_TIMEOUT_MS,
      'loadInterstitial'
    );
    interstitialLoaded = true;
    console.log('[UnityAds] ✅ Interstitial LOADED');
  } catch (err: unknown) {
    interstitialLoaded = false;
    const msg  = err instanceof Error ? err.message : String(err);
    const code = parseErrorCode(msg);
    console.error(`[UnityAds] ❌ onUnityAdsFailedToLoad [Interstitial] — Code: ${code} | ${msg}`);
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
    console.warn('[UnityAds] ⏳ Cooldown —', remaining, 's left');
    return { success: false, reason: 'cooldown' };
  }

  const serverCheck = await checkServerLimits();
  if (!serverCheck.allowed) {
    console.warn('[UnityAds] 🚫 Server limit:', serverCheck.reason);
    return { success: false, reason: 'daily_limit' };
  }

  if (!sdkReady) {
    await initializeUnityAds();
    if (!sdkReady) return { success: false, reason: 'not_available' };
  }

  if (!rewardedLoaded) {
    console.log('[UnityAds] 🔄 Not loaded — on-demand load with retries...');
    await loadRewardedVideoAd();
    if (!rewardedLoaded) return { success: false, reason: 'not_available' };
  }

  try {
    console.log('[UnityAds] ▶️  Showing rewarded ad | testMode:', UNITY_TEST_MODE);
    rewardedLoaded = false;
    const result = await UnityAdsPlugin.showRewardedVideo();
    console.log('[UnityAds] 📊 Result:', JSON.stringify(result));
    loadRewardedVideoAd();

    if (result.success) {
      lastAdCompletedAt = Date.now();
      console.log('[UnityAds] 🎉 REWARD EARNED — +0.2 coins');
      return { success: true, reward: 0.2 };
    }
    console.warn('[UnityAds] ⏭️  Skipped/closed — no reward');
    return { success: false, reason: 'not_completed' };
  } catch (err: unknown) {
    rewardedLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UnityAds] ❌ showRewardedVideo failed:', parseErrorCode(msg), '|', msg);
    loadRewardedVideoAd();
    return { success: false, reason: 'not_available' };
  }
}

// ─── SHOW INTERSTITIAL ────────────────────────────────────────
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
    interstitialLoaded = false;
    const result = await UnityAdsPlugin.showInterstitial();
    loadInterstitialAd();
    if (result.success) return { success: true, reward: 0.2 };
    return { success: false, reason: 'not_completed' };
  } catch (err: unknown) {
    interstitialLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UnityAds] ❌ showInterstitial failed:', parseErrorCode(msg));
    loadInterstitialAd();
    return { success: false, reason: 'not_available' };
  }
}

// ─── DIAGNOSTICS ──────────────────────────────────────────────
export function unityAdsDiagnostics(): void {
  console.log('=== [UnityAds DIAGNOSTICS] ===');
  console.log('  SDK Ready          :', sdkReady);
  console.log('  SDK Version        :', _sdkVersion);
  console.log('  UI Status          :', _uiStatus);
  console.log('  Last Error Code    :', _lastErrorCode);
  console.log('  Game ID            :', UNITY_GAME_ID);
  console.log('  Project ID         :', UNITY_PROJECT_ID);
  console.log('  Test Mode          :', UNITY_TEST_MODE, '← TEST ADS ACTIVE');
  console.log('  Rewarded Loaded    :', rewardedLoaded);
  console.log('  Interstitial Loaded:', interstitialLoaded);
  console.log('  Rewarded Placement :', PLACEMENTS.REWARDED);
  console.log('  Interstitial Place :', PLACEMENTS.INTERSTITIAL);
  console.log('  Load Timeout       :', LOAD_TIMEOUT_MS / 1000, 's');
  console.log('  Retries            :', MAX_LOAD_RETRIES, 'x', RETRY_DELAY_MS / 1000, 's apart');
  console.log('==============================');
}
