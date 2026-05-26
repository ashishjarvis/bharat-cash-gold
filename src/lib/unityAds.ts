// ============================================================
// REAL UNITY ADS — Capacitor Plugin Bridge (v7 — ADMARKUP FIX)
// Android Game ID : 6104683   testMode : TRUE (hardcoded literal)
// ============================================================
// v7 changes (adMarkup fix):
//   - initialize() uses hardcoded literal true — NOT a variable
//     that could silently resolve to false in any build
//   - loadRewardedVideo() uses hardcoded "Rewarded_Android" string
//   - "adMarkup is missing" caught separately: clears error state,
//     does NOT increment permanent retry counter, auto-retries in 5s
// v6 changes (LOOP FIX):
//   - Mutex (_loadInProgress) prevents concurrent load calls
//   - Silent pre-load (post-show) NEVER shows 'retrying' status
//   - Exponential backoff: 30 s → 60 s → 120 s (NOT 5 s)
//   - After MAX_AUTO_RETRIES: permanent 'load_failed', graceful UI
//   - Background retry timer always cleared on successful load
//   - initializeUnityAds() locked with sdkReady + initPromise
// ============================================================

import { UnityAds as UnityAdsPlugin } from 'capacitor-unity-ads';

// ── Public constants ──────────────────────────────────────────
export const UNITY_PROJECT_ID = 'db811c8a-0baf-4a79-bed2-441b81170297';
export const UNITY_GAME_ID    = '6104683';
export const UNITY_TEST_MODE  = true;

export const PLACEMENTS = {
  REWARDED:     'Rewarded_Android',
  INTERSTITIAL: 'Interstitial_Android',
} as const;

// ── Config ────────────────────────────────────────────────────
const LOAD_TIMEOUT_MS   = 30_000;
const COOLDOWN_MS       = 30_000;
const MAX_AUTO_RETRIES  = 3;
// Exponential backoff delays between auto-retries (ms)
const BACKOFF_MS: number[] = [30_000, 60_000, 120_000];

// ── Module-level state (singleton) ────────────────────────────
let sdkReady          = false;
let initPromise: Promise<void> | null = null;

let rewardedLoaded    = false;
let interstitialLoaded = false;
let lastAdCompletedAt = 0;

let _loadInProgress   = false;   // mutex — one load at a time
let _retryCount       = 0;       // cumulative load failures
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _lastErrorCode    = 'NONE';
let _sdkVersion       = 'unknown';

// ── Types ─────────────────────────────────────────────────────
export type AdResult =
  | { success: true;  reward: number }
  | { success: false; reason: 'not_available' | 'not_completed' | 'cooldown' | 'daily_limit' };

export type UnityAdsStatusType =
  | 'initializing'
  | 'ready'
  | 'rewarded_loaded'   // ad ready — STABLE state, never auto-reset
  | 'load_failed'       // graceful fallback
  | 'not_available';    // SDK init failed

// ── Status listeners ──────────────────────────────────────────
let _uiStatus: UnityAdsStatusType = 'initializing';
const _listeners: Array<(s: UnityAdsStatusType) => void> = [];

function setStatus(s: UnityAdsStatusType): void {
  if (_uiStatus === s) return;   // skip no-op changes
  _uiStatus = s;
  _listeners.forEach(fn => fn(s));
}

export function getUnityAdsStatus(): UnityAdsStatusType { return _uiStatus; }
export function getLastErrorCode():  string             { return _lastErrorCode; }
export function getSdkVersion():     string             { return _sdkVersion; }

export function onUnityAdsStatusChange(fn: (s: UnityAdsStatusType) => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  };
}

// ── Parse Unity error enum from callback message ──────────────
const UNITY_CODES = ['NO_FILL','NETWORK_ERROR','INTERNAL_ERROR','INVALID_ARGUMENT','TIMEOUT'] as const;

function parseErrorCode(msg: string): string {
  const m = msg.match(/\[([A-Z_]+)\]/);
  if (m) return m[1];
  for (const c of UNITY_CODES) {
    if (msg.toUpperCase().includes(c)) return c;
  }
  return msg.length > 60 ? msg.slice(0, 60) + '…' : msg;
}

// ── Helpers ───────────────────────────────────────────────────
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const t = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error(`TIMEOUT — ${label} exceeded ${ms / 1000}s`)), ms)
  );
  return Promise.race([p, t]);
}

function clearRetryTimer() {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
}

// ── INITIALIZE SDK ────────────────────────────────────────────
// Runs EXACTLY ONCE — guarded by sdkReady + initPromise.
// NEVER call setTestMode() after — it resets native SDK state.
export async function initializeUnityAds(): Promise<void> {
  if (sdkReady) return;              // already done
  if (initPromise) return initPromise;  // concurrent call — share same promise

  setStatus('initializing');
  console.log('[UnityAds] ══════════════════════════════');
  console.log('[UnityAds] 🚀 INIT — Game ID:', UNITY_GAME_ID, '| testMode:', UNITY_TEST_MODE);

  initPromise = (async () => {
    try {
      // testMode is a HARDCODED LITERAL true — never a variable that could flip
      await UnityAdsPlugin.initialize({ gameId: '6104683', testMode: true });

      try {
        const v = await UnityAdsPlugin.getVersion();
        _sdkVersion = v.version;
        console.log('[UnityAds] SDK version:', _sdkVersion);
      } catch { /* getVersion optional */ }

      sdkReady = true;
      setStatus('ready');
      console.log('[UnityAds] ✅ SDK ready — loading placements...');

      // Fire-and-forget pre-load; errors handled inside
      loadRewardedVideoAd(false);
      loadInterstitialAd();

    } catch (err: unknown) {
      const code = parseErrorCode(err instanceof Error ? err.message : String(err));
      _lastErrorCode = code;
      initPromise = null;  // allow one retry of init
      setStatus('not_available');
      console.error('[UnityAds] ❌ INIT FAILED — Code:', code);
      console.error('[UnityAds]    Ads temporarily unavailable. User can still use the app.');
    }
  })();

  return initPromise;
}

// ── LOAD REWARDED VIDEO ───────────────────────────────────────
// silent=true  → post-show pre-load; NEVER shows 'retrying' or changes stable status
// silent=false → initial load or manual retry; updates status normally
export async function loadRewardedVideoAd(silent = false): Promise<void> {
  if (!sdkReady) {
    console.warn('[UnityAds] Load skipped — SDK not ready');
    return;
  }
  if (_loadInProgress) {
    console.log('[UnityAds] Load skipped — already in progress (mutex)');
    return;
  }

  _loadInProgress = true;
  console.log(`[UnityAds] 📥 Loading rewarded${silent ? ' (silent pre-load)' : ''} — Game ID:`, UNITY_GAME_ID);

  try {
    // Placement ID is a HARDCODED STRING — explicit test placement
    await withTimeout(
      UnityAdsPlugin.loadRewardedVideo({ placementId: 'Rewarded_Android' }),
      LOAD_TIMEOUT_MS,
      'loadRewardedVideo'
    );

    rewardedLoaded = true;
    _lastErrorCode = 'NONE';
    _retryCount    = 0;          // reset failure count on success
    clearRetryTimer();           // cancel any pending auto-retry
    setStatus('rewarded_loaded');
    console.log('[UnityAds] ✅ Rewarded ad loaded');

  } catch (err: unknown) {
    rewardedLoaded = false;
    const msg  = err instanceof Error ? err.message : String(err);
    const code = parseErrorCode(msg);
    _lastErrorCode = code;

    // ── Special case: "adMarkup is missing" ───────────────────
    // This error means the SDK loaded but Unity's CDN hasn't delivered
    // ad creative yet (common on first init or after testMode toggle).
    // Fix: clear error state from UI, do NOT count as a permanent failure,
    //      always auto-retry in exactly 5 s using the hardcoded test placement.
    if (msg.toLowerCase().includes('admarkup is missing')) {
      console.warn('[UnityAds] ⚠️  adMarkup is missing — test creative not yet delivered.');
      console.warn('[UnityAds]    testMode=true is hardcoded. Clearing error state, retrying in 5s...');
      // Keep UI stable — don't show a red error for this transient condition
      setStatus('ready');
      clearRetryTimer();
      _retryTimer = setTimeout(() => {
        _retryTimer = null;
        if (sdkReady && !rewardedLoaded && !_loadInProgress) {
          console.log('[UnityAds] 🔄 adMarkup retry — loading Rewarded_Android with testMode=true...');
          loadRewardedVideoAd(false);
        }
      }, 5_000);
      return;   // skip permanent-retry-counter logic below
    }

    _retryCount++;
    console.error(`[UnityAds] ❌ Load FAILED — Code: ${code} | attempt ${_retryCount}/${MAX_AUTO_RETRIES}`);

    if (_retryCount >= MAX_AUTO_RETRIES) {
      // ── Permanent graceful failure ─────────────────────────
      clearRetryTimer();
      setStatus('load_failed');
      console.error('[UnityAds] Max retries reached. Showing graceful fallback.');
      console.error('[UnityAds] User can click Retry to try again manually.');
    } else if (!silent) {
      // ── Auto-retry with exponential backoff ────────────────
      const delay = BACKOFF_MS[_retryCount - 1] ?? 120_000;
      setStatus('load_failed');   // show failed state while we wait
      console.log(`[UnityAds] ⏰ Auto-retry in ${delay / 1000}s (backoff step ${_retryCount})`);
      clearRetryTimer();
      _retryTimer = setTimeout(() => {
        _retryTimer = null;
        if (sdkReady && !rewardedLoaded && !_loadInProgress) {
          console.log('[UnityAds] 🔄 Auto-retry firing...');
          loadRewardedVideoAd(false);
        }
      }, delay);
    } else {
      // Silent pre-load failure — don't touch status or schedule retry
      console.warn('[UnityAds] Silent pre-load failed. Ad will load on next manual request.');
    }
  } finally {
    _loadInProgress = false;
  }
}

// ── MANUAL RETRY (called from UI "Retry" button) ──────────────
export async function retryLoadAds(): Promise<void> {
  console.log('[UnityAds] 🔁 Manual retry triggered');
  clearRetryTimer();
  _retryCount = 0;   // reset counter for manual retry

  if (!sdkReady) {
    initPromise = null;   // allow re-init
    await initializeUnityAds();
    return;
  }
  await loadRewardedVideoAd(false);
}

// ── LOAD INTERSTITIAL ─────────────────────────────────────────
export async function loadInterstitialAd(): Promise<void> {
  if (!sdkReady) return;
  try {
    await withTimeout(
      UnityAdsPlugin.loadInterstitial({ placementId: PLACEMENTS.INTERSTITIAL }),
      LOAD_TIMEOUT_MS, 'loadInterstitial'
    );
    interstitialLoaded = true;
    console.log('[UnityAds] ✅ Interstitial loaded');
  } catch (err: unknown) {
    interstitialLoaded = false;
    console.warn('[UnityAds] ℹ️  Interstitial load failed (non-critical):', parseErrorCode(err instanceof Error ? err.message : String(err)));
  }
}

// ── SHOW REWARDED AD ─────────────────────────────────────────
export async function showRewardedAd(
  userId: string,
  checkServerLimits: () => Promise<{ allowed: boolean; reason?: string }>
): Promise<AdResult> {
  // ── Cooldown check ────────────────────────────────────────
  const elapsed = Date.now() - lastAdCompletedAt;
  if (elapsed < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    console.warn(`[UnityAds] ⏳ Cooldown: ${wait}s remaining`);
    return { success: false, reason: 'cooldown' };
  }

  // ── Server eligibility ────────────────────────────────────
  const { allowed, reason } = await checkServerLimits();
  if (!allowed) {
    console.warn('[UnityAds] 🚫 Server limit:', reason);
    return { success: false, reason: reason === 'cooldown' ? 'cooldown' : 'daily_limit' };
  }

  // ── SDK guard ─────────────────────────────────────────────
  if (!sdkReady) {
    await initializeUnityAds();
    if (!sdkReady) return { success: false, reason: 'not_available' };
  }

  // ── On-demand load if not pre-loaded ──────────────────────
  if (!rewardedLoaded) {
    console.log('[UnityAds] On-demand load (not pre-loaded)...');
    await loadRewardedVideoAd(false);
    if (!rewardedLoaded) return { success: false, reason: 'not_available' };
  }

  // ── Show the ad ───────────────────────────────────────────
  try {
    console.log('[UnityAds] ▶️  Showing rewarded ad | testMode:', UNITY_TEST_MODE);
    rewardedLoaded = false;   // mark consumed BEFORE show to prevent double-show
    const result = await UnityAdsPlugin.showRewardedVideo();
    console.log('[UnityAds] 📊 Result:', JSON.stringify(result));

    // Silent pre-load for next ad (mutex prevents double load)
    loadRewardedVideoAd(true);

    if (result.success) {
      lastAdCompletedAt = Date.now();
      console.log('[UnityAds] 🎉 Reward earned! +0.2 coins');
      return { success: true, reward: 0.2 };
    }

    console.warn('[UnityAds] ⏭️  Skipped / not completed — no reward');
    return { success: false, reason: 'not_completed' };

  } catch (err: unknown) {
    rewardedLoaded = false;
    const code = parseErrorCode(err instanceof Error ? err.message : String(err));
    console.error('[UnityAds] ❌ showRewardedVideo error — Code:', code);
    loadRewardedVideoAd(true);  // silent recovery pre-load
    return { success: false, reason: 'not_available' };
  }
}

// ── SHOW INTERSTITIAL ─────────────────────────────────────────
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
    return result.success
      ? { success: true, reward: 0.2 }
      : { success: false, reason: 'not_completed' };
  } catch (err: unknown) {
    interstitialLoaded = false;
    loadInterstitialAd();
    return { success: false, reason: 'not_available' };
  }
}

// ── DIAGNOSTICS ───────────────────────────────────────────────
export function unityAdsDiagnostics(): void {
  console.log('═══ [UnityAds DIAGNOSTICS v6] ═══');
  console.log('  Game ID         :', UNITY_GAME_ID, '| testMode:', UNITY_TEST_MODE);
  console.log('  SDK Ready       :', sdkReady, '| Version:', _sdkVersion);
  console.log('  Status          :', _uiStatus);
  console.log('  Last Error      :', _lastErrorCode);
  console.log('  Rewarded Loaded :', rewardedLoaded);
  console.log('  Load In Progress:', _loadInProgress);
  console.log('  Retry Count     :', _retryCount, '/', MAX_AUTO_RETRIES);
  console.log('  Retry Timer     :', _retryTimer !== null ? 'scheduled' : 'none');
  console.log('  Cooldown Left   :', Math.max(0, Math.ceil((COOLDOWN_MS - (Date.now() - lastAdCompletedAt)) / 1000)), 's');
  console.log('═════════════════════════════════');
}
