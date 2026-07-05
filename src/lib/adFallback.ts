// ============================================================
// DUAL-NETWORK REWARDED AD FALLBACK ORCHESTRATOR
// ============================================================
// Strategy:
//   1. Try Unity Ads FIRST (primary network, testMode=true)
//   2. If Unity fails for a TECHNICAL reason (not_available /
//      not_completed), automatically fall back to Google AdMob
//      Rewarded Test Ad (ca-app-pub-3940256099942544/5224354917)
//   3. If Unity is blocked by a BUSINESS rule (cooldown /
//      daily_limit), do NOT fall back — falling back would let
//      users bypass anti-abuse limits by hitting a 2nd network.
//   4. Whichever network completes successfully awards the coins
//      through the exact same reward path.
//
// This file does not modify unityAds.ts or admob.ts — it only
// orchestrates the two existing, independent modules.
// ============================================================

import { showRewardedAd } from './unityAds';
import { showAdMobRewarded } from './admob';

export type AdNetwork = 'unity' | 'admob';

export type FallbackAdResult =
  | { success: true; reward: number; network: AdNetwork }
  | { success: false; reason: 'not_available' | 'not_completed' | 'cooldown' | 'daily_limit' };

export async function showRewardedAdWithFallback(
  userId: string,
  checkServerLimits: () => Promise<{ allowed: boolean; reason?: string }>
): Promise<FallbackAdResult> {

  console.log('[AdFallback] ══════════════════════════════════════');
  console.log('[AdFallback] 🎯 STEP 1 — Trying Unity Ads (primary, testMode=true)...');

  const unityResult = await showRewardedAd(userId, checkServerLimits);

  if (unityResult.success) {
    console.log('[AdFallback] ✅ Unity Ads SUCCESS — reward granted:', unityResult.reward);
    return { success: true, reward: unityResult.reward, network: 'unity' };
  }

  // Business-rule blocks must NOT trigger a fallback — bypassing them
  // via a second ad network would defeat the cooldown / daily limit.
  if (unityResult.reason === 'cooldown' || unityResult.reason === 'daily_limit') {
    console.log(`[AdFallback] ⛔ Server-side block (${unityResult.reason}) — NOT falling back to AdMob`);
    return { success: false, reason: unityResult.reason };
  }

  console.warn(`[AdFallback] ⚠️  Unity Ads FAILED (reason: ${unityResult.reason}) — falling back to AdMob...`);
  console.log('[AdFallback] 🎯 STEP 2 — Trying Google AdMob (fallback, test unit)...');

  const adMobResult = await showAdMobRewarded();

  if (adMobResult.success) {
    console.log('[AdFallback] ✅ AdMob FALLBACK SUCCESS — reward granted:', adMobResult.reward);
    return { success: true, reward: adMobResult.reward, network: 'admob' };
  }

  console.error('[AdFallback] ❌ BOTH networks failed — Unity:', unityResult.reason, '| AdMob:', adMobResult.reason);
  console.log('[AdFallback] ══════════════════════════════════════');
  return { success: false, reason: 'not_available' };
}
