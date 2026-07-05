// ============================================================
// GOOGLE ADMOB — Capacitor Plugin Bridge (Rewarded Ads)
// Mode: TEST (Google official test Rewarded Ad Unit ID)
// ============================================================
// Lifecycle mirrors unityAds.ts:
//   1. initializeAdMob()   — called ONCE at app startup
//   2. loadRewardedAd()    — called automatically after init
//   3. showAdMobRewarded() — called when user taps Watch Ad
//      → NEVER shows the ad until the Loaded event has fired
//
// Mutex / loop prevention:
//   - _loadInProgress flag: only ONE load call at a time
//   - sdkReady + initPromise guard: init runs exactly ONCE
//   - listeners registered exactly ONCE (module-level guard)
// ============================================================

import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
import type { AdMobRewardItem, AdMobError } from '@capacitor-community/admob';

// ── Public constants ────────────────────────────────────────
// Google's OFFICIAL test Rewarded Ad Unit ID — always fills, never real revenue.
export const ADMOB_TEST_REWARDED_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';
export const ADMOB_TEST_MODE = true;

// ── Timing config ─────────────────────────────────────────────
const LOAD_TIMEOUT_MS  = 30_000;
const ONDEMAND_ATTEMPTS = 3;
const ONDEMAND_GAP_MS   = 5_000;

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

// ── Singleton state ───────────────────────────────────────────
let sdkReady           = false;
let initPromise: Promise<void> | null = null;
let rewardedLoaded     = false;
let _loadInProgress    = false;
let _listenersBound    = false;

export type AdMobStatusType =
  | 'initializing'
  | 'ready'
  | 'rewarded_loaded'
  | 'load_failed'
  | 'not_available';

let _uiStatus: AdMobStatusType = 'initializing';
const _listeners: Array<(s: AdMobStatusType) => void> = [];

function setStatus(next: AdMobStatusType): void {
  if (_uiStatus === next) return;
  console.log(`[AdMob] 📊 Status: ${_uiStatus} → ${next}`);
  _uiStatus = next;
  _listeners.forEach(fn => fn(next));
}

export function getAdMobStatus(): AdMobStatusType { return _uiStatus; }
export function onAdMobStatusChange(fn: (s: AdMobStatusType) => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const t = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error(`TIMEOUT — ${label} exceeded ${ms / 1000}s`)), ms)
  );
  return Promise.race([p, t]);
}

// ── Bind native event listeners exactly once ──────────────────
function bindListenersOnce(): void {
  if (_listenersBound) return;
  _listenersBound = true;

  AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
    rewardedLoaded = true;
    setStatus('rewarded_loaded');
    console.log('[AdMob] ✅ REWARDED PRELOAD SUCCESS — ad ready to show');
  });

  AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (error: AdMobError) => {
    rewardedLoaded = false;
    setStatus('load_failed');
    console.error('[AdMob] ❌ REWARDED PRELOAD FAILED —', JSON.stringify(error));
  });

  AdMob.addListener(RewardAdPluginEvents.FailedToShow, (error: AdMobError) => {
    rewardedLoaded = false;
    console.error('[AdMob] ❌ SHOW FAILED —', JSON.stringify(error));
  });

  AdMob.addListener(RewardAdPluginEvents.Showed, () => {
    console.log('[AdMob] ▶️  Rewarded ad is now visible to the user');
  });

  AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
    console.log('[AdMob] ⏹️  Rewarded ad dismissed — preloading next ad');
    loadRewardedAd(true);
  });
}

// ── INITIALIZE SDK ────────────────────────────────────────────
// Runs EXACTLY ONCE. Protected by sdkReady + initPromise.
export async function initializeAdMob(): Promise<void> {
  if (sdkReady) {
    console.log('[AdMob] ✅ Already initialized');
    return;
  }
  if (initPromise) {
    console.log('[AdMob] Init already in progress — sharing promise');
    return initPromise;
  }

  setStatus('initializing');
  console.log('[AdMob] ══════════════════════════════════════');
  console.log('[AdMob] 🚀 INIT START');
  console.log('[AdMob]    Rewarded Ad Unit :', ADMOB_TEST_REWARDED_UNIT_ID, '← Google official TEST unit');
  console.log('[AdMob]    testMode         :', ADMOB_TEST_MODE);
  console.log('[AdMob] ══════════════════════════════════════');

  initPromise = (async () => {
    try {
      bindListenersOnce();
      await AdMob.initialize({ initializeForTesting: true });

      sdkReady = true;
      setStatus('ready');
      console.log('[AdMob] ✅ SDK INITIALIZED — starting rewarded preload...');

      // Preload rewarded ad immediately after init (fire-and-forget)
      loadRewardedAd(false);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      initPromise = null; // allow re-try of init
      setStatus('not_available');
      console.error('[AdMob] ❌ INIT FAILED —', msg);
      console.error('[AdMob]    User can still use the app — ads temporarily unavailable');
    }
  })();

  return initPromise;
}

// ── LOAD REWARDED VIDEO ───────────────────────────────────────
// silent=true  → post-show pre-load; no aggressive UI state changes
// silent=false → initial or manual load
export async function loadRewardedAd(silent = false): Promise<void> {
  if (!sdkReady) {
    console.warn('[AdMob] ⚠️  Load skipped — SDK not ready');
    return;
  }
  if (_loadInProgress) {
    console.log('[AdMob] ⏳ Load skipped — already in progress (mutex locked)');
    return;
  }

  _loadInProgress = true;
  console.log(`[AdMob] 📥 PRELOAD START${silent ? ' (silent)' : ''} — unit: ${ADMOB_TEST_REWARDED_UNIT_ID} | testMode: true`);

  try {
    await withTimeout(
      AdMob.prepareRewardVideoAd({
        adId: ADMOB_TEST_REWARDED_UNIT_ID,
        isTesting: ADMOB_TEST_MODE,
      }),
      LOAD_TIMEOUT_MS,
      'prepareRewardVideoAd'
    );
    // Actual "loaded" confirmation comes from the Loaded event listener,
    // NOT from this promise resolving — the promise only confirms the
    // request was accepted by the native layer.
    console.log('[AdMob] 📨 Preload request accepted — awaiting Loaded event...');
  } catch (err: unknown) {
    rewardedLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AdMob] ❌ PRELOAD REQUEST FAILED —', msg);
    if (!silent) setStatus('load_failed');
  } finally {
    _loadInProgress = false;
  }
}

// ── SHOW REWARDED AD ─────────────────────────────────────────
// Only calls show() after Loaded event confirms adLoaded == true.
export async function showAdMobRewarded(): Promise<
  { success: true; reward: number } | { success: false; reason: string }
> {
  if (!sdkReady) {
    console.log('[AdMob] SDK not ready — initializing on-demand...');
    await initializeAdMob();
    if (!sdkReady) {
      console.error('[AdMob] ❌ SDK init failed — cannot show ad');
      return { success: false, reason: 'not_available' };
    }
  }

  if (!rewardedLoaded) {
    console.log('[AdMob] Ad not pre-loaded — starting on-demand load...');
    for (let attempt = 1; attempt <= ONDEMAND_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        console.log(`[AdMob] On-demand retry ${attempt}/${ONDEMAND_ATTEMPTS} — waiting ${ONDEMAND_GAP_MS / 1000}s...`);
        await sleep(ONDEMAND_GAP_MS);
      }
      await loadRewardedAd(false);
      // Give the Loaded event a moment to fire after the request is accepted
      await sleep(1500);
      if (rewardedLoaded) {
        console.log(`[AdMob] ✅ On-demand load succeeded on attempt ${attempt}`);
        break;
      }
    }
    if (!rewardedLoaded) {
      console.error(`[AdMob] ❌ On-demand load failed after ${ONDEMAND_ATTEMPTS} attempts`);
      return { success: false, reason: 'not_available' };
    }
  }

  console.log('[AdMob] ▶️  SHOW REWARDED — unit:', ADMOB_TEST_REWARDED_UNIT_ID, '| testMode: true');
  try {
    rewardedLoaded = false; // mark consumed BEFORE show to prevent double-show race
    const reward: AdMobRewardItem = await AdMob.showRewardVideoAd();
    console.log('[AdMob] 🎉 REWARD CALLBACK RECEIVED —', JSON.stringify(reward));

    // Silent pre-load for next ad
    console.log('[AdMob] 📥 Scheduling next ad pre-load...');
    loadRewardedAd(true);

    return { success: true, reward: reward.amount || 0.2 };
  } catch (err: unknown) {
    rewardedLoaded = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AdMob] ❌ SHOW FAILED —', msg);
    loadRewardedAd(true); // silent recovery
    return { success: false, reason: 'not_available' };
  }
}

// ── DIAGNOSTICS ───────────────────────────────────────────────
export function adMobDiagnostics(): void {
  console.log('═══════ [AdMob DIAGNOSTICS] ═══════');
  console.log('  Rewarded Unit ID    :', ADMOB_TEST_REWARDED_UNIT_ID, '(Google TEST unit)');
  console.log('  testMode            :', ADMOB_TEST_MODE);
  console.log('  SDK Ready           :', sdkReady);
  console.log('  Status              :', _uiStatus);
  console.log('  Rewarded Loaded     :', rewardedLoaded);
  console.log('  Load In Progress    :', _loadInProgress, '(mutex)');
  console.log('═══════════════════════════════════');
}
