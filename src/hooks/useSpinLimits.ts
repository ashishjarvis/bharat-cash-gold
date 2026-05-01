import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { toast } from 'sonner';

const MAX_AD_SPINS_PER_DAY = 20;

interface SpinLimits {
  spinsToday: number;
  freeSpinUsed: boolean;
  canFreeSpin: boolean;
  canAdSpin: boolean;
  adSpinsRemaining: number;
  totalSpinsRemaining: number;
  loading: boolean;
  useFreeSpin: () => Promise<boolean>;
  useAdSpin: () => Promise<boolean>;
  refreshLimits: () => Promise<void>;
}

const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

export const useSpinLimits = (): SpinLimits => {
  const { user } = useSimpleAuth();
  const [spinsToday, setSpinsToday] = useState(0);
  const [freeSpinUsed, setFreeSpinUsed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if we need to reset (midnight reset)
  const checkAndResetDaily = useCallback(async () => {
    if (!user) return;

    const today = getTodayDate();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('spins_today, free_spin_used, last_spin_reset_date')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching spin limits:', error);
      return;
    }

    if (data) {
      // Check if we need to reset (new day)
      if (data.last_spin_reset_date !== today) {
        // Reset for new day
        await supabase
          .from('profiles')
          .update({
            spins_today: 0,
            free_spin_used: false,
            last_spin_reset_date: today,
          })
          .eq('id', user.id);

        setSpinsToday(0);
        setFreeSpinUsed(false);
      } else {
        setSpinsToday(data.spins_today || 0);
        setFreeSpinUsed(data.free_spin_used || false);
      }
    }
    
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkAndResetDaily();
  }, [checkAndResetDaily]);

  const refreshLimits = useCallback(async () => {
    await checkAndResetDaily();
  }, [checkAndResetDaily]);

  const useFreeSpin = useCallback(async (): Promise<boolean> => {
    if (!user || freeSpinUsed) {
      toast.error('Free spin already used today!');
      return false;
    }

    const today = getTodayDate();

    const { error } = await supabase
      .from('profiles')
      .update({
        free_spin_used: true,
        spins_today: spinsToday + 1,
        last_spin_reset_date: today,
      })
      .eq('id', user.id);

    if (error) {
      console.error('Error using free spin:', error);
      toast.error('Failed to use free spin');
      return false;
    }

    setFreeSpinUsed(true);
    setSpinsToday(prev => prev + 1);
    return true;
  }, [user, freeSpinUsed, spinsToday]);

  const useAdSpin = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    const adSpinsUsed = freeSpinUsed ? spinsToday - 1 : spinsToday;
    
    if (adSpinsUsed >= MAX_AD_SPINS_PER_DAY) {
      toast.error(`Daily limit reached! Max ${MAX_AD_SPINS_PER_DAY} ad spins per day.`);
      return false;
    }

    const today = getTodayDate();

    const { error } = await supabase
      .from('profiles')
      .update({
        spins_today: spinsToday + 1,
        last_spin_reset_date: today,
      })
      .eq('id', user.id);

    if (error) {
      console.error('Error using ad spin:', error);
      toast.error('Failed to record spin');
      return false;
    }

    setSpinsToday(prev => prev + 1);
    return true;
  }, [user, freeSpinUsed, spinsToday]);

  const adSpinsUsed = freeSpinUsed ? Math.max(0, spinsToday - 1) : spinsToday;
  const adSpinsRemaining = MAX_AD_SPINS_PER_DAY - adSpinsUsed;
  const canFreeSpin = !freeSpinUsed;
  const canAdSpin = adSpinsRemaining > 0;
  const totalSpinsRemaining = (canFreeSpin ? 1 : 0) + adSpinsRemaining;

  return {
    spinsToday,
    freeSpinUsed,
    canFreeSpin,
    canAdSpin,
    adSpinsRemaining,
    totalSpinsRemaining,
    loading,
    useFreeSpin,
    useAdSpin,
    refreshLimits,
  };
};
