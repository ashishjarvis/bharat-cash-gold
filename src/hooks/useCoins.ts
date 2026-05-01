import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'bharat_cash_coins';
const COINS_TO_RUPEE = 10; // 10 coins = ₹1

interface CoinState {
  totalCoins: number;
  adsWatched: number;
  tapCount: number;
  lastDailyReset: string;
  dailyTasksCompleted: string[];
}

const getInitialState = (): CoinState => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    // Reset daily tasks if it's a new day
    const today = new Date().toDateString();
    if (parsed.lastDailyReset !== today) {
      return {
        ...parsed,
        adsWatched: 0,
        tapCount: 0,
        lastDailyReset: today,
        dailyTasksCompleted: [],
      };
    }
    return parsed;
  }
  return {
    totalCoins: 0,
    adsWatched: 0,
    tapCount: 0,
    lastDailyReset: new Date().toDateString(),
    dailyTasksCompleted: [],
  };
};

export const useCoins = () => {
  const [state, setState] = useState<CoinState>(getInitialState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const addCoins = useCallback((amount: number) => {
    setState(prev => ({
      ...prev,
      totalCoins: Math.round((prev.totalCoins + amount) * 10) / 10,
    }));
  }, []);

  const watchAd = useCallback(() => {
    setState(prev => ({
      ...prev,
      adsWatched: prev.adsWatched + 1,
    }));
  }, []);

  const resetAdsWatched = useCallback(() => {
    setState(prev => ({
      ...prev,
      adsWatched: 0,
    }));
  }, []);

  const tap = useCallback(() => {
    setState(prev => ({
      ...prev,
      tapCount: prev.tapCount + 1,
    }));
    addCoins(0.2);
  }, [addCoins]);

  const completeTask = useCallback((taskId: string) => {
    setState(prev => ({
      ...prev,
      dailyTasksCompleted: [...prev.dailyTasksCompleted, taskId],
    }));
  }, []);

  const withdraw = useCallback((coins: number) => {
    if (coins >= 10 && coins <= state.totalCoins) {
      setState(prev => ({
        ...prev,
        totalCoins: Math.round((prev.totalCoins - coins) * 10) / 10,
      }));
      return true;
    }
    return false;
  }, [state.totalCoins]);

  const coinsToRupees = (coins: number) => {
    return (coins / COINS_TO_RUPEE).toFixed(2);
  };

  return {
    totalCoins: state.totalCoins,
    adsWatched: state.adsWatched,
    tapCount: state.tapCount,
    dailyTasksCompleted: state.dailyTasksCompleted,
    addCoins,
    watchAd,
    resetAdsWatched,
    tap,
    completeTask,
    withdraw,
    coinsToRupees,
    rupeesValue: coinsToRupees(state.totalCoins),
  };
};
