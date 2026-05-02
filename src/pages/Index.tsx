import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { CoinDisplay } from '@/components/CoinDisplay';
import { MegaTask } from '@/components/MegaTask';
import { TapToEarn } from '@/components/TapToEarn';
import { SpinWheel } from '@/components/SpinWheel';
import { DailyTasks } from '@/components/DailyTasks';
import { Leaderboard } from '@/components/Leaderboard';
import { Wallet } from '@/components/Wallet';
import { SupportButtons } from '@/components/SupportButtons';
import { ReferralSection } from '@/components/ReferralSection';
import { LivePaymentTicker } from '@/components/LivePaymentTicker';
import LoadingScreen from '@/components/LoadingScreen';
import { useCoinsDB } from '@/hooks/useCoinsDB';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { initializeUnityAds, unityAdsDiagnostics } from '@/lib/unityAds';

type Tab = 'home' | 'leaderboard' | 'wallet' | 'tasks';

// Calls the server to verify ad eligibility (50/day + 30s cooldown)
const checkAdLimits = async (userId: string): Promise<{ allowed: boolean; reason?: string }> => {
  try {
    const res = await fetch('/api/ads/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  } catch {
    // If server unreachable, allow (fail-open for UX; server also validates)
    return { allowed: true };
  }
};

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const { user, loading: authLoading } = useSimpleAuth();
  const navigate = useNavigate();

  const {
    totalCoins,
    adsWatched,
    tapCount,
    dailyTasksCompleted,
    addCoins,
    watchAd,
    resetAdsWatched,
    tap,
    completeTask,
    withdraw,
    rupeesValue,
    loading: coinsLoading,
  } = useCoinsDB();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    // SDK already started in main.tsx — this ensures it's ready
    // and logs diagnostics so Ashish bhai can see the full state in adb logcat
    initializeUnityAds().then(() => {
      unityAdsDiagnostics();
    });
  }, []);

  const handleCheckAdLimits = useCallback(
    () => checkAdLimits(user?.id ?? ''),
    [user?.id]
  );

  if (authLoading || coinsLoading) return <LoadingScreen />;
  if (!user) return <LoadingScreen />;

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="space-y-4">
            <CoinDisplay coins={totalCoins} rupees={rupeesValue} />
            <LivePaymentTicker />

            <MegaTask
              adsWatched={adsWatched}
              onAdWatched={watchAd}
              onRewardClaimed={addCoins}
              onReset={resetAdsWatched}
              userId={user.id}
              onCheckAdLimits={handleCheckAdLimits}
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
    </div>
  );
};

export default Index;
