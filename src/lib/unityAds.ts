// ============================================================
// REAL UNITY ADS — Capacitor Plugin Bridge (v5 — FLICKER FIX)
// Project ID : db811c8a-0baf-4a79-bed2-441b81170297
// Android Game ID : 6104683
// testMode  : TRUE  ← confirms SDK connectivity
// ============================================================
// v5 bug fixes:
//  - REMOVED setTestMode() call post-init — it caused "Connection OK"
//    to flash then reset to "Connecting..." because the native side
//    treats setTestMode() as a config reset after initialization.
//  - initializeUnityAds() is SINGLE-INSTANCE protected via sdkReady
//    guard + initPromise dedup — will NEVER run twice.
//  - parseErrorCode() extracts NO_FILL/NETWORK_ERROR/INTERNAL_ERROR/
//    INVALID_ARGUMENT/TIMEOUT from the Java error message string.
//    CI workflow patches Unityads.java so errors include [ERROR_CODE].
// ============================================================

import { UnityAds as UnityAdsPlugin } from 'capacitor-unity-ads';

export const UNITY_PROJECT_ID  = 'db811c8a-0baf-4a79-bed2-441b81170297';
export const UNITY_GAME_ID     = '6104683';
// testMode = true → Unity serves test ads regardless of fill
export const UNITY_TEST_MODE   = true;

export const PLACEMENTS = {
  REWARDED:     'Rewarded_Android',
  INTERSTITIAL: 'Interstitial_Android',
} as const;

// ─── Retry / timeout config ──────────────────────────────────
const LOAD_TIMEOUT_MS  = 30_000;
const RETRY_DELAY_MS   = 5_000;
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

// ─── UI STATUS ────────────────────────────────────────────────
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
export function getLastErrorCode():  string              { return _lastErrorCode; }
export function getSdkVersion():     string              { return _sdkVersion; }

export function onUnityAdsStatusChange(fn: (s: UnityAdsStatusType) => void): () => void {
  _statusListeners.push(fn);
  return () => {
    const idx = _statusListeners.indexOf(fn);
    if (idx !== -1) _statusListeners.splice(idx, 1);
  };
}

// ─── Parse Unity error enum from message string ──────────────
// CI patches Unityads.java to embed "[NO_FILL]" etc.
const UNITY_CODES = ['NO_FILL', 'NETWORK_ERROR', 'INTERNAL_ERROR', 'INVALID_ARGUMENT', 'TIMEOUT'] as const;

function parseErrorCode(msg: string): string {
  const bracket = msg.match(/\[([A-Z_]+)\]/);
  if (bracket) return bracket[1];
  for (const code of UNITY_CODES) {
    if (msg.toUpperCase().includes(code)) return code;
  }
  return msg.length > 60 ? msg.slice(0, 60) + '…' : msg;
}

// ─── Helpers ─────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const t = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`TIMEOUT — ${label} exceeded ${ms / 1000}s`)), ms)
  );
  return Promise.race([promise, t]);
}
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── INITIALIZE SDK ──────────────────────────────────────────
// Runs ONCE. Protected by sdkReady + initPromise guards.
// DO NOT call setTestMode() after this — it resets native SDK state.
export async function initializeUnityAds(): Promise<void> {
  if (sdkReady) {
    console.log('[UnityAds] ✅ Already initialized. Game ID:', UNITY_GAME_ID);
    return;
  }
  if (initPromise) return initPromise;   // dedup concurrent calls

  setStatus('initializing');

  initPromise = (async () => {
    try {
      console.log('[UnityAds] ═══════════════════════════════════');
      console.log('[UnityAds] 🚀 INITIALIZING — Game ID:', UNITY_GAME_ID);
      console.log('[UnityAds]    Project ID :', UNITY_PROJECT_ID);
      console.log('[UnityAds]    Test Mode  :', UNITY_TEST_MODE, '← test ads ON');
      console.log('[UnityAds]    Bundle     : com.ashish.bharatcash');
      console.log('[UnityAds] ═══════════════════════════════════');

      // testMode is passed HERE — no setTestMode() call after this
      await UnityAdsPlugin.initialize({ gameId: UNITY_GAME_ID, testMode: UNITY_TEST_MODE });

      // Log SDK version (best-effort — some builds don't support it)
      try {
        const v = await UnityAdsPlugin.getVersion();
        _sdkVersion = v.version;
        console.log('[UnityAds] SDK version:', _sdkVersion);
      } catch {
        console.log('[UnityAds] getVersion() not supported on this build');
      }

      sdkReady = true;
      setStatus('ready');
      console.log('[UnityAds] ✅ SDK initialized — now loading ad placements...');

      // Pre-load both placements
      await Promise.allSettled([loadRewardedVideoAd(), loadInterstitialAd()]);

    } catch (err: unknown) {
      const msg  = err instanceof Error ? err.message : String(err);
      const code = parseErrorCode(msg);
      _lastErrorCode = code;
      setStatus('not_available');
      initPromise = null; // allow future retry

      console.error('[UnityAds] ❌ INIT FAILED — Code:', code, '| Msg:', msg);
      console.error('[UnityAds]    Check Game ID:', UNITY_GAME_ID);
      console.error('[UnityAds]    Bundle: com.ashish.bharatcash');
      console.error('[UnityAds]    Permissions: INTERNET + ACCESS_NETWORK_STATE');
    }
  })();

  return initPromise;
}

// ─── LOAD REWARDED VIDEO (timeout + 3-attempt auto-retry) ────
export async function loadRewardedVideoAd(): Promise<void> {
  if (!sdkReady) {
    console.warn('[UnityAds] ⚠️  loadRewardedVideoAd: SDK not ready');
    return;
  }

  for (let attempt = 1; attempt <= MAX_LOAD_RETRIES; attempt++) {
    try {
      console.log(`[UnityAds] 📥 LOAD REWARDED — attempt ${attempt}/${MAX_LOAD_RETRIES}`);
      console.log('[UnityAds]    Game ID   :', UNITY_GAME_ID, '| Placement:', PLACEMENTS.REWARDED);
      console.log('[UnityAds]    Test Mode :', UNITY_TEST_MODE, '| Timeout:', LOAD_TIMEOUT_MS / 1000, 's');

      if (attempt > 1) setStatus('retrying');

      await withTimeout(
        UnityAdsPlugin.loadRewardedVideo({ placementId: PLACEMENTS.REWARDED }),
        LOAD_TIMEOUT_MS,
        `loadRewardedVideo attempt ${attempt}`
      );

      rewardedLoaded = true;
      _lastErrorCode = 'NONE';
      setStatus('rewarded_loaded');
      console.log('[UnityAds] ✅ REWARDED AD LOADED — attempt', attempt, '/', MAX_LOAD_RETRIES);
      return;

    } catch (err: unknown) {
      rewardedLoaded = false;
      const msg  = err instanceof Error ? err.message : String(err);
      const code = parseErrorCode(msg);
      _lastErrorCode = code;

      console.error(`[UnityAds] ❌ onUnityAdsFailedToLoad [Rewarded] attempt ${attempt}/${MAX_LOAD_RETRIES}`);
      console.error('[UnityAds]    Error Code:', code, '| Game ID:', UNITY_GAME_ID);
      console.error('[UnityAds]    Full Error:', msg);

      if (code === 'NO_FILL') {
        console.error('[UnityAds]    → NO_FILL: no ads to serve. testMode=true means this should NOT happen.');
        console.error('[UnityAds]    → Verify Game ID in Unity Dashboard + Rewarded_Android placement is ACTIVE.');
      } else if (code === 'INVALID_ARGUMENT') {
        console.error('[UnityAds]    → INVALID_ARGUMENT: Game ID or placement ID is wrong!');
      } else if (code === 'NETWORK_ERROR') {
        console.error('[UnityAds]    → NETWORK_ERROR: Device cannot reach Unity Ads servers.');
      } else if (code === 'TIMEOUT') {
        console.error('[UnityAds]    → TIMEOUT: Unity server too slow. Will retry.');
      } else if (code === 'INTERNAL_ERROR') {
        console.error('[UnityAds]    → INTERNAL_ERROR: Unity SDK internal failure. Will retry.');
      }

      if (attempt < MAX_LOAD_RETRIES) {
        console.log(`[UnityAds] 🔄 Retry in ${RETRY_DELAY_MS / 1000}s...`);
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

function scheduleBackgroundRetry(): void {
  if (_retryTimer) clearTimeout(_retryTimer);
  console.log('[UnityAds] ⏰ Background retry scheduled in 60s...');
  _retryTimer = setTimeout(async () => {
    _retryTimer = null;
    if (!sdkReady) return;
    console.log('[UnityAds] 🔄 Background retry firing...');
    await loadRewardedVideoAd();
  }, 60_000);
}

export async function retryLoadAds(): Promise<void> {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  console.log('[UnityAds] 🔁 Manual retry | Game ID:', UNITY_GAME_ID, '| testMode:', UNITY_TEST_MODE);
  if (!sdkReady) {
    await initializeUnityAds();
    return;
  }
  await Promise.allSettled([loadRewardedVideoAd(), loadInterstitialAd()]);
}

// ─── LOAD INTERSTITIAL ───────────────────────────────────────
export async function loadInterstitialAd(): Promise<void> {
  if (!sdkReady) return;
  try {
    console.log('[UnityAds] 📥 Loading interstitial — placement:', PLACEMENTS.INTERSTITIAL, '| testMode:', UNITY_TEST_MODE);
    await withTimeout(
      UnityAdsPlugin.loadInterstitial({ placementId: PLACEMENTS.INTERSTITIAL }),
      LOAD_TIMEOUT_MS, 'loadInterstitial'
    );
    interstitialLoaded = true;
    console.log('[UnityAds] ✅ Interstitial LOADED');
  } catch (err: unknown) {
    interstitialLoaded = false;
    const code = parseErrorCode(err instanceof Error ? err.message : String(err));
    console.error('[UnityAds] ❌ Interstitial load failed — Code:', code);
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
    return { success: false, reason: serverCheck.reason === 'cooldown' ? 'cooldown' : 'daily_limit' };
  }

  if (!sdkReady) {
    await initializeUnityAds();
    if (!sdkReady) return { success: false, reason: 'not_available' };
  }

  if (!rewardedLoaded) {
    console.log('[UnityAds] 🔄 Not loaded — on-demand load...');
    await loadRewardedVideoAd();
    if (!rewardedLoaded) return { success: false, reason: 'not_available' };
  }

  try {
    console.log('[UnityAds] ▶️  Showing rewarded ad | testMode:', UNITY_TEST_MODE);
    rewardedLoaded = false;
    const result = await UnityAdsPlugin.showRewardedVideo();
    console.log('[UnityAds] 📊 Result:', JSON.stringify(result));
    loadRewardedVideoAd(); // pre-load next

    if (result.success) {
      lastAdCompletedAt = Date.now();
      console.log('[UnityAds] 🎉 REWARD EARNED — +0.2 coins');
      return { success: true, reward: 0.2 };
    }
    console.warn('[UnityAds] ⏭️  Skipped/closed — no reward');
    return { success: false, reason: 'not_completed' };
  } catch (err: unknown) {
    rewardedLoaded = false;
    const code = parseErrorCode(err instanceof Error ? err.message : String(err));
    console.error('[UnityAds] ❌ showRewardedVideo failed — Code:', code);
    loadRewardedVideoAd();
    return { success: false, reason: 'not_available' };
  }
}

// ─── SHOW INTERSTITIAL ───────────────────────────────────────
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
    const code = parseErrorCode(err instanceof Error ? err.message : String(err));
    console.error('[UnityAds] ❌ showInterstitial failed — Code:', code);
    loadInterstitialAd();
    return { success: false, reason: 'not_available' };
  }
}

// ─── DIAGNOSTICS ─────────────────────────────────────────────
export function unityAdsDiagnostics(): void {
  console.log('=== [UnityAds DIAGNOSTICS] ===');
  console.log('  SDK Ready          :', sdkReady);
  console.log('  SDK Version        :', _sdkVersion);
  console.log('  UI Status          :', _uiStatus);
  console.log('  Last Error Code    :', _lastErrorCode);
  console.log('  Game ID            :', UNITY_GAME_ID);
  console.log('  Project ID         :', UNITY_PROJECT_ID);
  console.log('  Test Mode          :', UNITY_TEST_MODE, '← test ads ON');
  console.log('  Rewarded Loaded    :', rewardedLoaded);
  console.log('  Interstitial Loaded:', interstitialLoaded);
  console.log('  Rewarded Placement :', PLACEMENTS.REWARDED);
  console.log('  Interstitial Place :', PLACEMENTS.INTERSTITIAL);
  console.log('  Load Timeout       :', LOAD_TIMEOUT_MS / 1000, 's');
  console.log('  Retries            :', MAX_LOAD_RETRIES, 'x', RETRY_DELAY_MS / 1000, 's apart');
  console.log('  Cooldown           :', COOLDOWN_MS / 1000, 's');
  console.log('==============================');
}
