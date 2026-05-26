// ============================================================
// REAL UNITY ADS — Capacitor Plugin Bridge
// Android Game ID : 6104683   testMode : TRUE (hardcoded literal)
// ============================================================
// Lifecycle:
//   1. initializeUnityAds()     — called ONCE at app startup
//   2. loadRewardedVideoAd()    — called automatically after init
//   3. showRewardedAd()         — called when user taps Watch Ad
//      → syncs native state via isRewardedVideoLoaded()
//      → on-demand load with up to 3 attempts (5 s gap) if not ready
//      → NEVER shows the ad until adLoaded == true
//
// adMarkup is missing handling:
//   - NOT a permanent failure — Unity CDN occasionally delays delivery
//   - Does NOT increment permanent retry counter
//   - Schedules 5 s retry silently; keeps UI stable at 'ready'
//   - After 5 consecutive adMarkup errors: treated as real failure
//
// Mutex / loop prevention:
//   - _loadInProgress flag: only ONE load call at a time
//   - sdkReady + initPromise guard: init runs exactly ONCE
//   - setStatus() skips no-op transitions (prev === next)
// ============================================================

import { UnityAds as UnityAdsPlugin } from 'capacitor-unity-ads';

// ── Public constants (exported so components can log them) ────
export const UNITY_PROJECT_ID = 'db811c8a-0baf-4a79-bed2-441b81170297';
export const UNITY_GAME_ID    = '6104683';
export const UNITY_TEST_MODE  = true;

// Placement IDs must match Unity Dashboard configuration
export const PLACEMENTS = {
  REWARDED:     'Rewarded_Android',
  INTERSTITIAL: 'Interstitial_Android',
} as const;

// ── Timing config ─────────────────────────────────────────────
const LOAD_TIMEOUT_MS     = 30_000;  // 30 s per load attempt
const COOLDOWN_MS         = 30_000;  // 30 s between ad shows
const MAX_PERM_RETRIES    = 3;       // permanent failures before 'load_failed'
const MAX_ADMARKUP_RETRIES = 5;      // adMarkup-only failures before giving up
// Exponential backoff for permanent failures
const BACKOFF_MS: readonly number[] = [30_000, 60_000, 120_000] as const;
// On-demand retry settings (when user taps Watch Ad and ad not loaded)
const ONDEMAND_ATTEMPTS   = 3;
const ONDEMAND_GAP_MS     = 5_000;

// ── Singleton state ───────────────────────────────────────────
let sdkReady             = false;
let initPromise: Promise<void> | null = null;

let rewardedLoaded       = false;
let interstitialLoaded   = false;
let lastAdCompletedAt    = 0;

let _loadInProgress      = false;  // mutex — one load at a time
let _permRetryCount      = 0;      // non-adMarkup failure count
let _adMarkupRetryCount  = 0;      // adMarkup-specific failure count
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _lastErrorCode       = 'NONE';
let _sdkVersion          = 'unknown';

// ── Status type ───────────────────────────────────────────────
export type UnityAdsStatusType =
  | 'initializing'    // SDK init in progress
  | 'ready'           // SDK ready — ad load in progress or pending retry
  | 'rewarded_loaded' // Ad loaded — safe to call showRewardedVideo()
  | 'load_failed'     // Permanent failure — graceful fallback shown
  | 'not_available';  // SDK init failed

// ── Status pub/sub ────────────────────────────────────────────
let _uiStatus: UnityAdsStatusType = 'initializing';
const _listeners: Array<(s: UnityAdsStatusType) => void> = [];

function setStatus(next: UnityAdsStatusType): void {
  if (_uiStatus === next) return;  // no-op guard prevents needless re-renders
  console.log(`[UnityAds] 📊 Status: ${_uiStatus} → ${next}`);
  _uiStatus = next;
  _listeners.forEach(fn => fn(next));
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

// ── Error code parser ─────────────────────────────────────────
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

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

function clearRetryTimer() {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
}

// ── Native state sync ─────────────────────────────────────────
// Cross-checks our JS-side flag against the actual Android SDK state.
// Fixes edge cases where the native ad loaded but our promise path missed it.
async function syncNativeRewardedState(): Promise<void> {
  try {
    const { loaded } = await UnityAdsPlugin.isRewardedVideoLoaded();
    if (loaded && !rewardedLoaded) {
      rewardedLoaded = true;
      _lastErrorCode  = 'NONE';
      _permRetryCount = 0;
      _adMarkupRetryCount = 0;
      clearRetryTimer();
      setStatus('rewarded_loaded');
      console.log('[UnityAds] ✅ Native sync: ad IS loaded — state corrected');
    } else if (!loaded && rewardedLoaded) {
      rewardedLoaded = false;
      console.warn('[UnityAds] ⚠️  Native sync: ad NOT loaded — flag corrected');
    }
  } catch {
    // isRewardedVideoLoaded not available on this build — skip silently
  }
}

// ── INITIALIZE SDK ────────────────────────────────────────────
// Runs EXACTLY ONCE. Protected by sdkReady + initPromise.
// testMode and gameId are HARDCODED LITERALS — never variables.
export async function initializeUnityAds(): Promise<void> {
  if (sdkReady) {
    console.log('[UnityAds] ✅ Already initialized — Game ID:', UNITY_GAME_ID);
    return;
  }
  if (initPromise) {
    console.log('[UnityAds] Init already in progress — sharing promise');
    return initPromise;
  }

  setStatus('initializing');
  console.log('[UnityAds] ══════════════════════════════════════');
  console.log('[UnityAds] 🚀 INIT START');
  console.log('[UnityAds]    Game ID   :', '6104683',            '← hardcoded');
  console.log('[UnityAds]    testMode  :', true,                 '← hardcoded literal');
  console.log('[UnityAds]    Placement :', PLACEMENTS.REWARDED);
  console.log('[UnityAds]    Bundle    : com.ashish.bharatcash');
  console.log('[UnityAds] ══════════════════════════════════════');

  initPromise = (async () => {
    try {
      // HARDCODED: gameId and testMode are literals — never dynamic variables
      await UnityAdsPlugin.initialize({ gameId: '6104683', testMode: true });

      try {
        const v = await UnityAdsPlugin.getVersion();
        _sdkVersion = v.version;
        console.log('[UnityAds] SDK version:', _sdkVersion);
      } catch { /* getVersion is optional */ }

      sdkReady = true;
      setStatus('ready');
      console.log('[UnityAds] ✅ SDK INITIALIZED — starting rewarded preload...');

      // Preload rewarded ad immediately after init (fire-and-forget)
      loadRewardedVideoAd(false);
      loadInterstitialAd();

    } catch (err: unknown) {
      const msg  = err instanceof Error ? err.message : String(err);
      const code = parseErrorCode(msg);
      _lastErrorCode = code;
      initPromise = null;   // allow re-try of init
      setStatus('not_available');
      console.error('[UnityAds] ❌ INIT FAILED — Code:', code, '| Msg:', msg);
      console.error('[UnityAds]    User can still use the app — ads temporarily unavailable');
    }
  })();

  return initPromise;
}

// ── LOAD REWARDED VIDEO ───────────────────────────────────────
// silent=true  → post-show pre-load; status stays stable, no scheduling
// silent=false → initial or manual load; updates status & schedules retries
export async function loadRewardedVideoAd(silent = false): Promise<void> {
  if (!sdkReady) {
    console.warn('[UnityAds] ⚠️  Load skipped — SDK not ready');
    return;
  }
  if (_loadInProgress) {
    console.log('[UnityAds] ⏳ Load skipped — already in progress (mutex locked)');
    return;
  }

  _loadInProgress = true;
  console.log(`[UnityAds] 📥 PRELOAD START${silent ? ' (silent)' : ''} — placement: Rewarded_Android | testMode: true`);

  try {
    // HARDCODED placement string — explicit test placement
    await withTimeout(
      UnityAdsPlugin.loadRewardedVideo({ placementId: 'Rewarded_Android' }),
      LOAD_TIMEOUT_MS,
      'loadRewardedVideo'
    );

    // ── SUCCESS ──────────────────────────────────────────────
    rewardedLoaded       = true;
    _lastErrorCode       = 'NONE';
    _permRetryCount      = 0;
    _adMarkupRetryCount  = 0;
    clearRetryTimer();
    setStatus('rewarded_loaded');
    console.log('[UnityAds] ✅ PRELOAD SUCCESS — rewarded ad ready to show');

  } catch (err: unknown) {
    rewardedLoaded = false;
    const msg  = err instanceof Error ? err.message : String(err);
    const code = parseErrorCode(msg);
    _lastErrorCode = code;

    // ── adMarkup is missing — SEPARATE handler ────────────────
    // This is a TRANSIENT CDN delay, NOT a configuration error.
    // Does NOT count toward permanent _permRetryCount.
    // Schedules a 5 s silent background retry.
    // After MAX_ADMARKUP_RETRIES consecutive adMarkup failures: permanent failure.
    if (msg.toLowerCase().includes('admarkup is missing')) {
      _adMarkupRetryCount++;
      console.warn(`[UnityAds] ⚠️  adMarkup is missing (×${_adMarkupRetryCount}/${MAX_ADMARKUP_RETRIES})`);
      console.warn('[UnityAds]    testMode=true hardcoded. CDN delivery delay — will retry in 5s.');

      if (_adMarkupRetryCount <= MAX_ADMARKUP_RETRIES) {
        setStatus('ready');   // UI stays stable — no red error
        clearRetryTimer();
        _retryTimer = setTimeout(() => {
          _retryTimer = null;
          if (sdkReady && !rewardedLoaded && !_loadInProgress) {
            console.log('[UnityAds] 🔄 adMarkup auto-retry firing — Rewarded_Android, testMode=true');
            loadRewardedVideoAd(false);
          }
        }, 5_000);
      } else {
        // Too many adMarkup failures — show graceful fallback
        setStatus('load_failed');
        console.error('[UnityAds] ❌ adMarkup failed', _adMarkupRetryCount, 'times — showing graceful fallback');
      }
      // DO NOT return here — fall through to finally to release mutex
    } else {
      // ── Standard failure — exponential backoff ─────────────
      _permRetryCount++;
      console.error(`[UnityAds] ❌ PRELOAD FAILED — Code: ${code} | attempt ${_permRetryCount}/${MAX_PERM_RETRIES}`);

      if (_permRetryCount >= MAX_PERM_RETRIES) {
        clearRetryTimer();
        setStatus('load_failed');
        console.error('[UnityAds] Max retries reached — showing graceful fallback');
        console.error('[UnityAds] User can tap Retry to try again');
      } else if (!silent) {
        const delay = BACKOFF_MS[_permRetryCount - 1] ?? 120_000;
        setStatus('load_failed');
        console.log(`[UnityAds] ⏰ Auto-retry in ${delay / 1000}s (backoff step ${_permRetryCount})`);
        clearRetryTimer();
        _retryTimer = setTimeout(() => {
          _retryTimer = null;
          if (sdkReady && !rewardedLoaded && !_loadInProgress) {
            console.log('[UnityAds] 🔄 Backoff retry firing...');
            loadRewardedVideoAd(false);
          }
        }, delay);
      } else {
        console.warn('[UnityAds] Silent pre-load failed — will retry after next show');
      }
    }

  } finally {
    _loadInProgress = false;   // always release mutex
  }
}

// ── MANUAL RETRY (called from UI "Retry" button) ──────────────
export async function retryLoadAds(): Promise<void> {
  console.log('[UnityAds] 🔁 MANUAL RETRY — resetting counters');
  clearRetryTimer();
  _permRetryCount     = 0;
  _adMarkupRetryCount = 0;

  if (!sdkReady) {
    console.log('[UnityAds] SDK not ready — re-initializing...');
    initPromise = null;
    await initializeUnityAds();
    return;
  }
  await loadRewardedVideoAd(false);
}

// ── LOAD INTERSTITIAL (fire-and-forget, non-critical) ─────────
export async function loadInterstitialAd(): Promise<void> {
  if (!sdkReady) return;
  try {
    await withTimeout(
      UnityAdsPlugin.loadInterstitial({ placementId: 'Interstitial_Android' }),
      LOAD_TIMEOUT_MS,
      'loadInterstitial'
    );
    interstitialLoaded = true;
    console.log('[UnityAds] ✅ Interstitial loaded');
  } catch (err: unknown) {
    interstitialLoaded = false;
    console.warn('[UnityAds] ℹ️  Interstitial load failed (non-critical):',
      parseErrorCode(err instanceof Error ? err.message : String(err)));
  }
}

// ── SHOW REWARDED AD ─────────────────────────────────────────
// Full lifecycle: cooldown → server check → SDK guard →
//   native sync → on-demand load (if needed) → show → reward
export async function showRewardedAd(
  userId: string,
  checkServerLimits: () => Promise<{ allowed: boolean; reason?: string }>
): Promise<AdResult> {

  // 1. Cooldown check ─────────────────────────────────────────
  const elapsed = Date.now() - lastAdCompletedAt;
  if (elapsed < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    console.warn(`[UnityAds] ⏳ Cooldown: ${wait}s remaining`);
    return { success: false, reason: 'cooldown' };
  }

  // 2. Server eligibility check ────────────────────────────────
  console.log('[UnityAds] 🔍 Checking server limits for user:', userId);
  const { allowed, reason } = await checkServerLimits();
  if (!allowed) {
    console.warn('[UnityAds] 🚫 Server blocked:', reason);
    return { success: false, reason: reason === 'cooldown' ? 'cooldown' : 'daily_limit' };
  }

  // 3. SDK guard ────────────────────────────────────────────────
  if (!sdkReady) {
    console.log('[UnityAds] SDK not ready — initializing on-demand...');
    await initializeUnityAds();
    if (!sdkReady) {
      console.error('[UnityAds] ❌ SDK init failed — cannot show ad');
      return { success: false, reason: 'not_available' };
    }
  }

  // 4. Native state sync ────────────────────────────────────────
  // Cross-check against actual Android SDK — fixes stale JS flag
  console.log('[UnityAds] 🔄 Syncing native ad state...');
  await syncNativeRewardedState();

  // 5. On-demand load if not pre-loaded ─────────────────────────
  // "SDK Ready" ≠ "Ad Loaded" — load must complete before show
  if (!rewardedLoaded) {
    console.log('[UnityAds] Ad not pre-loaded — starting on-demand load...');

    for (let attempt = 1; attempt <= ONDEMAND_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        console.log(`[UnityAds] On-demand retry ${attempt}/${ONDEMAND_ATTEMPTS} — waiting ${ONDEMAND_GAP_MS / 1000}s...`);
        await sleep(ONDEMAND_GAP_MS);
      }

      // Cancel any pending background timer to avoid double-load
      clearRetryTimer();
      await loadRewardedVideoAd(false);

      // After load attempt, sync native state
      await syncNativeRewardedState();

      if (rewardedLoaded) {
        console.log(`[UnityAds] ✅ On-demand load succeeded on attempt ${attempt}`);
        break;
      }
    }

    if (!rewardedLoaded) {
      console.error(`[UnityAds] ❌ On-demand load failed after ${ONDEMAND_ATTEMPTS} attempts`);
      return { success: false, reason: 'not_available' };
    }
  }

  // 6. Show the ad ───────────────────────────────────────────────
  console.log('[UnityAds] ▶️  SHOW REWARDED — placement: Rewarded_Android | testMode: true (hardcoded)');
  try {
    rewardedLoaded = false;  // mark consumed BEFORE show to prevent double-show race
    const result = await UnityAdsPlugin.showRewardedVideo();
    console.log('[UnityAds] 📊 Show result:', JSON.stringify(result));

    // 7. Silent pre-load for next ad (mutex prevents overlap) ──
    console.log('[UnityAds] 📥 Scheduling next ad pre-load...');
    loadRewardedVideoAd(true);

    if (result.success) {
      lastAdCompletedAt = Date.now();
      console.log('[UnityAds] 🎉 REWARD CALLBACK RECEIVED — reward: 0.2 coins');
      return { success: true, reward: 0.2 };
    }

    console.warn('[UnityAds] ⏭️  Ad skipped / not completed — no reward');
    return { success: false, reason: 'not_completed' };

  } catch (err: unknown) {
    rewardedLoaded = false;
    const code = parseErrorCode(err instanceof Error ? err.message : String(err));
    console.error('[UnityAds] ❌ SHOW FAILED — Code:', code);
    loadRewardedVideoAd(true);  // silent recovery
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
  console.log('═══════ [UnityAds DIAGNOSTICS] ═══════');
  console.log('  Game ID             :', '6104683 (hardcoded)');
  console.log('  testMode            :', 'true (hardcoded literal)');
  console.log('  Rewarded Placement  :', 'Rewarded_Android (hardcoded)');
  console.log('  SDK Ready           :', sdkReady, '| Version:', _sdkVersion);
  console.log('  Status              :', _uiStatus);
  console.log('  Last Error          :', _lastErrorCode);
  console.log('  Rewarded Loaded     :', rewardedLoaded);
  console.log('  Load In Progress    :', _loadInProgress, '(mutex)');
  console.log('  Perm Retry Count    :', _permRetryCount, '/', MAX_PERM_RETRIES);
  console.log('  adMarkup Retry Count:', _adMarkupRetryCount, '/', MAX_ADMARKUP_RETRIES);
  console.log('  Retry Timer Active  :', _retryTimer !== null);
  console.log('  Cooldown Remaining  :', Math.max(0, Math.ceil((COOLDOWN_MS - (Date.now() - lastAdCompletedAt)) / 1000)), 's');
  console.log('══════════════════════════════════════');
}
