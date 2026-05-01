import { useState, useCallback, useEffect } from 'react';
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
  const stored = localStorage.getItem('bharat_cash_local');
  const today = new Date().toDateString();
  
  if (stored) {
    const parsed = JSON.parse(stored);
    if (parsed.lastDailyReset !== today) {
      return {
        adsWatched: 0,
        tapCount: 0,
        lastDailyReset: today,
        dailyTasksCompleted: [],
      };
    }
    return parsed;
  }
  
  return {
    adsWatched: 0,
    tapCount: 0,
    lastDailyReset: today,
    dailyTasksCompleted: [],
  };
};

export const useCoinsDB = () => {
  const { user } = useSimpleAuth();
  const [totalCoins, setTotalCoins] = useState(0);
  const [lifetimeEarnings, setLifetimeEarnings] = useState(0);
  const [localState, setLocalState] = useState<LocalState>(getLocalState);
  const [loading, setLoading] = useState(true);

  // Fetch profile from DB
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('total_coins, lifetime_earnings')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setTotalCoins(Number(data.total_coins) || 0);
        setLifetimeEarnings(Number(data.lifetime_earnings) || 0);
      }
      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  // Save local state
  useEffect(() => {
    localStorage.setItem('bharat_cash_local', JSON.stringify(localState));
  }, [localState]);

  const addCoins = useCallback(async (amount: number) => {
    if (!user) return;

    const newTotal = Math.round((totalCoins + amount) * 10) / 10;
    const newLifetime = Math.round((lifetimeEarnings + amount) * 10) / 10;
    
    setTotalCoins(newTotal);
    setLifetimeEarnings(newLifetime);

    await supabase
      .from('profiles')
      .update({ 
        total_coins: newTotal,
        lifetime_earnings: newLifetime 
      })
      .eq('id', user.id);
  }, [user, totalCoins, lifetimeEarnings]);

  const watchAd = useCallback(() => {
    setLocalState(prev => ({
      ...prev,
      adsWatched: prev.adsWatched + 1,
    }));
  }, []);

  const resetAdsWatched = useCallback(() => {
    setLocalState(prev => ({
      ...prev,
      adsWatched: 0,
    }));
  }, []);

  const tap = useCallback(() => {
    setLocalState(prev => ({
      ...prev,
      tapCount: prev.tapCount + 1,
    }));
    // Coins are NOT added here anymore - they are credited after ad completion in TapToEarn
  }, []);

  const completeTask = useCallback((taskId: string) => {
    setLocalState(prev => ({
      ...prev,
      dailyTasksCompleted: [...prev.dailyTasksCompleted, taskId],
    }));
  }, []);

  const withdraw = useCallback(async (coins: number, upiId: string) => {
    if (!user || coins < 10 || coins > totalCoins) return false;

    const newTotal = Math.round((totalCoins - coins) * 10) / 10;
    setTotalCoins(newTotal);

    // Update DB
    await supabase
      .from('profiles')
      .update({ total_coins: newTotal })
      .eq('id', user.id);

    // Create withdrawal record
    await supabase
      .from('withdrawals')
      .insert({
        user_id: user.id,
        upi_id: upiId,
        coins_amount: coins,
        rupees_amount: coins / COINS_TO_RUPEE,
        status: 'processing',
      });

    return true;
  }, [user, totalCoins]);

  const coinsToRupees = (coins: number) => {
    return (coins / COINS_TO_RUPEE).toFixed(2);
  };

  return {
    totalCoins,
    lifetimeEarnings,
    adsWatched: localState.adsWatched,
    tapCount: localState.tapCount,
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
