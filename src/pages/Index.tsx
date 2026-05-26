import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header }          from '@/components/Header';
import { BottomNav }       from '@/components/BottomNav';
import { CoinDisplay }     from '@/components/CoinDisplay';
import { MegaTask }        from '@/components/MegaTask';
import { TapToEarn }       from '@/components/TapToEarn';
import { SpinWheel }       from '@/components/SpinWheel';
import { DailyTasks }      from '@/components/DailyTasks';
import { Leaderboard }     from '@/components/Leaderboard';
import { Wallet }          from '@/components/Wallet';
import { SupportButtons }  from '@/components/SupportButtons';
import { ReferralSection } from '@/components/ReferralSection';
import { LivePaymentTicker } from '@/components/LivePaymentTicker';
import { TreasureChest }   from '@/components/TreasureChest';
import { SurveyButton }    from '@/components/SurveyButton';
import { CpxSurvey }       from '@/components/CpxSurvey';
import { UnityTestBanner } from '@/components/UnityAdsStatus';
import LoadingScreen from '@/components/LoadingScreen';
import { useCoinsDB }      from '@/hooks/useCoinsDB';
import { useSimpleAuth }   from '@/contexts/SimpleAuthContext';
import { initializeUnityAds, unityAdsDiagnostics } from '@/lib/unityAds';
import { toast } from 'sonner';

type Tab = 'home' | 'leaderboard' | 'wallet' | 'tasks';

// ── Server-side ad eligibility check ─────────────────────────
const checkAdLimits = async (userId: string): Promise<{ allowed: boolean; reason?: string }> => {
  try {
    const res = await fetch('/api/ads/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  } catch {
    return { allowed: true }; // fail-open; server also validates
  }
};

// ── Record completed ad on server (streak + referral 2.0) ────
const recordAdComplete = async (userId: string): Promise<void> => {
  try {
    const res = await fetch('/api/ads/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.referralRewarded) {
      toast.success('🎁 Your referrer earned 100 coins!');
    }
  } catch {
    console.error('[Index] Failed to record ad completion on server');
  }
};

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const { user, loading: authLoading } = useSimpleAuth();
  const navigate = useNavigate();

  // CPX Survey overlay state
  const [showCpxSurvey, setShowCpxSurvey] = useState(false);

  const {
    totalCoins, lockedCoins, adsWatched, tapCount, dailyTasksCompleted,
    addCoins, watchAd, resetAdsWatched, tap, completeTask, withdraw, rupeesValue,
    loading: coinsLoading,
  } = useCoinsDB();

  // ── Auth guard ────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  // ── Initialize Unity Ads ONCE on mount ───────────────────
  useEffect(() => {
    initializeUnityAds().then(() => unityAdsDiagnostics());
    // Empty deps — intentional: runs only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Ad limit check (server-side) ─────────────────────────
  const handleCheckAdLimits = useCallback(
    () => checkAdLimits(user?.id ?? ''),
    [user?.id]
  );

  // ── Unified ad completion callback ───────────────────────
  // Called by MegaTask when a rewarded ad is SUCCESSFULLY watched
  const handleAdWatched = useCallback(async (reward: number) => {
    watchAd();
    addCoins(reward);
    if (user?.id) await recordAdComplete(user.id);
    setShowCpxSurvey(true);   // show CPX survey after every ad
  }, [watchAd, addCoins, user?.id]);

  // ── CPX Survey reward handler ─────────────────────────────
  const handleCpxReward = useCallback((coins: number) => {
    addCoins(coins, 'survey_reward');
    toast.success(`🎉 Survey complete! +${coins} coins!`);
    setShowCpxSurvey(false);
  }, [addCoins]);

  if (authLoading || coinsLoading) return <LoadingScreen />;
  if (!user) return <LoadingScreen />;

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="space-y-4">
            <CoinDisplay coins={totalCoins} rupees={rupeesValue} />

            {/* Unity Ads status — visible only in testMode */}
            <UnityTestBanner />

            <LivePaymentTicker />

            {/* 7-Day Streak Treasure Chest */}
            <TreasureChest onBonusClaimed={addCoins} adsWatched={adsWatched} />

            {/* Survey shortcut button — below Treasure Chest */}
            <SurveyButton
              onOpen={() => setShowCpxSurvey(true)}
              disabled={showCpxSurvey}
              loading={showCpxSurvey}
            />

            <MegaTask
              adsWatched={adsWatched}
              onAdWatched={() => {}}
              onRewardClaimed={() => {}}
              onReset={resetAdsWatched}
              userId={user.id}
              onCheckAdLimits={handleCheckAdLimits}
              onAdCompleted={handleAdWatched}
            />

            <div className="grid grid-cols-2 gap-4">
              <TapToEarn onTap={tap} tapCount={tapCount} onAddCoins={addCoins} />
              <SpinWheel onReward={addCoins} />
            </div>

            <ReferralSection onReward={addCoins} />
          </div>
        );

      case 'tasks':
        return (
          <DailyTasks
            completedTasks={dailyTasksCompleted}
            onTaskComplete={completeTask}
            onReward={addCoins}
            tapCount={tapCount}
            adsWatched={adsWatched}
          />
        );

      case 'leaderboard':
        return <Leaderboard currentUserCoins={totalCoins} />;

      case 'wallet':
        return (
          <Wallet
            totalCoins={totalCoins}
            lockedCoins={lockedCoins}
            rupeesValue={rupeesValue}
            onWithdraw={withdraw}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header coins={totalCoins} />
      <main className="max-w-md mx-auto px-4 py-4">
        {renderContent()}
      </main>
      <SupportButtons />
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* CPX Survey overlay */}
      <CpxSurvey
        visible={showCpxSurvey}
        onClose={() => setShowCpxSurvey(false)}
        onRewardReceived={handleCpxReward}
      />
    </div>
  );
};

export default Index;
