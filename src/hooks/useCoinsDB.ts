import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';

const COINS_TO_RUPEE = 10;

interface LocalState {
  adsWatched: number;
  tapCount: number;
  lastDailyReset: string;
  dailyTasksCompleted: string[];
}

const getLocalState = (): LocalState => {
  try {
    const stored = localStorage.getItem('bharat_cash_local');
    const today  = new Date().toDateString();
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.lastDailyReset !== today) {
        return { adsWatched: 0, tapCount: 0, lastDailyReset: today, dailyTasksCompleted: [] };
      }
      return parsed;
    }
  } catch {}
  return { adsWatched: 0, tapCount: 0, lastDailyReset: new Date().toDateString(), dailyTasksCompleted: [] };
};

export const useCoinsDB = () => {
  const { user } = useSimpleAuth();
  const [totalCoins,      setTotalCoins]      = useState(0);
  const [lockedCoins,     setLockedCoins]      = useState(0);
  const [lifetimeEarnings, setLifetimeEarnings] = useState(0);
  const [localState,      setLocalState]      = useState<LocalState>(getLocalState);
  const [loading,         setLoading]         = useState(true);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch profile from DB + subscribe to realtime updates
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('total_coins, locked_coins, lifetime_earnings')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setTotalCoins(Number(data.total_coins)       || 0);
        setLockedCoins(Number((data as any).locked_coins)  || 0);
        setLifetimeEarnings(Number(data.lifetime_earnings) || 0);
      }
      setLoading(false);
    };

    fetchProfile();

    // Realtime subscription — auto-refresh balance on any profile update
    realtimeRef.current = supabase
      .channel(`profile-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}`,
      }, (payload) => {
        const d = payload.new as any;
        if (d.total_coins       != null) setTotalCoins(Number(d.total_coins) || 0);
        if (d.locked_coins      != null) setLockedCoins(Number(d.locked_coins) || 0);
        if (d.lifetime_earnings != null) setLifetimeEarnings(Number(d.lifetime_earnings) || 0);
      })
      .subscribe();

    return () => {
      if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    };
  }, [user]);

  // Persist local state to localStorage
  useEffect(() => {
    localStorage.setItem('bharat_cash_local', JSON.stringify(localState));
  }, [localState]);

  // Add coins via server transaction (idempotent)
  const addCoins = useCallback(async (amount: number, actionType = 'ad_reward') => {
    if (!user) return;
    // Optimistic update
    setTotalCoins(prev => Math.round((prev + amount) * 10) / 10);
    setLifetimeEarnings(prev => Math.round((prev + amount) * 10) / 10);

    try {
      await fetch('/api/coins/increment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, amount, actionType }),
      });
    } catch {
      // Realtime subscription will correct the balance
      console.error('[useCoinsDB] addCoins server call failed — realtime will reconcile');
    }
  }, [user]);

  const watchAd = useCallback(() => {
    setLocalState(prev => ({ ...prev, adsWatched: prev.adsWatched + 1 }));
  }, []);

  const resetAdsWatched = useCallback(() => {
    setLocalState(prev => ({ ...prev, adsWatched: 0 }));
  }, []);

  const tap = useCallback(() => {
    setLocalState(prev => ({ ...prev, tapCount: prev.tapCount + 1 }));
  }, []);

  const completeTask = useCallback((taskId: string) => {
    setLocalState(prev => ({
      ...prev,
      dailyTasksCompleted: [...prev.dailyTasksCompleted, taskId],
    }));
  }, []);

  // Withdraw via SERVER atomic transaction (no direct Supabase write)
  const withdraw = useCallback(async (coins: number, upiId: string, paymentMethod?: string): Promise<boolean> => {
    if (!user || coins < 10 || coins > totalCoins) return false;

    try {
      const res = await fetch('/api/withdrawals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, coinsAmount: coins, upiId, paymentMethod }),
      });
      const data = await res.json();

      if (data.success) {
        // Optimistic: deduct from local state (realtime will confirm)
        setTotalCoins(prev => Math.max(0, Math.round((prev - coins) * 10) / 10));
        setLockedCoins(prev => Math.round((prev + coins) * 10) / 10);
        return true;
      }

      console.error('[useCoinsDB] withdraw error:', data.error);
      return false;
    } catch (err) {
      console.error('[useCoinsDB] withdraw network error:', err);
      return false;
    }
  }, [user, totalCoins]);

  const coinsToRupees = (c: number) => (c / COINS_TO_RUPEE).toFixed(2);

  return {
    totalCoins,
    lockedCoins,
    lifetimeEarnings,
    adsWatched: localState.adsWatched,
    tapCount:   localState.tapCount,
    dailyTasksCompleted: localState.dailyTasksCompleted,
    addCoins,
    watchAd,
    resetAdsWatched,
    tap,
    completeTask,
    withdraw,
    coinsToRupees,
    rupeesValue: coinsToRupees(totalCoins),
    loading,
  };
};
