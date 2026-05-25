// ─── TREASURE CHEST — 7-Day Streak Feature ─────────────────────────────────
// Rules:
//   • User must watch ≥5 rewarded ads per day
//   • Must do this for 7 consecutive days
//   • On day 7 completion → 500 coin bonus (atomic server transaction)
//   • Missing even 1 day resets streak to 0
//   • Bonus claim prevented if already claimed today (idempotency)

import { useState, useEffect, useCallback } from 'react';
import { Gift, Flame, CheckCircle, Lock, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { toast } from 'sonner';

interface StreakStatus {
  currentStreak: number;
  adsToday: number;
  lastAdDate: string | null;
  lastBonusClaimed: string | null;
  todayComplete: boolean;
  canClaimBonus: boolean;
}

interface TreasureChestProps {
  onBonusClaimed: (coins: number) => void;
  adsWatched: number;  // today's local count — used as hint to refresh
}

const ADS_REQUIRED = 5;
const STREAK_REQUIRED = 7;
const BONUS_COINS = 500;

export const TreasureChest = ({ onBonusClaimed, adsWatched }: TreasureChestProps) => {
  const { user } = useSimpleAuth();
  const [streak, setStreak]   = useState<StreakStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const fetchStreak = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/streak/status?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setStreak(data);
      }
    } catch {
      console.error('[TreasureChest] Failed to fetch streak');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Refresh whenever adsWatched changes (after each ad completion)
  useEffect(() => {
    fetchStreak();
  }, [fetchStreak, adsWatched]);

  const handleClaimBonus = async () => {
    if (!user || claiming || !streak?.canClaimBonus) return;
    setClaiming(true);

    try {
      const res = await fetch('/api/streak/claim-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();

      if (data.success) {
        onBonusClaimed(BONUS_COINS);
        toast.success(`🎉 7-Day Streak Bonus! +${BONUS_COINS} coins!`);
        fetchStreak();
      } else {
        toast.error(data.error || 'Failed to claim bonus');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-4 flex items-center justify-center h-24">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  const currentStreak = streak?.currentStreak ?? 0;
  const adsToday      = streak?.adsToday ?? 0;
  const todayDone     = adsToday >= ADS_REQUIRED;
  const canClaim      = streak?.canClaimBonus ?? false;

  // Build the 7 day circles
  const days = Array.from({ length: STREAK_REQUIRED }, (_, i) => {
    const dayNum = i + 1;
    const isDone = dayNum <= currentStreak;
    const isToday = dayNum === currentStreak + (todayDone ? 0 : 1);
    return { dayNum, isDone, isToday };
  });

  return (
    <div className="glass-card p-5 relative overflow-hidden">
      {/* Background shimmer */}
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-orange-500/5 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center shadow-lg">
          <Gift className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-lg gold-gradient-text">Treasure Chest</h3>
          <p className="text-xs text-muted-foreground">Watch 5 ads/day for 7 days → +{BONUS_COINS} coins!</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="font-orbitron font-bold text-orange-400 text-lg">{currentStreak}</span>
            <span className="text-muted-foreground text-xs">/7</span>
          </div>
          <p className="text-[10px] text-muted-foreground">day streak</p>
        </div>
      </div>

      {/* 7 Day Progress */}
      <div className="flex gap-1.5 mb-4">
        {days.map(({ dayNum, isDone, isToday }) => (
          <div key={dayNum} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-full aspect-square max-w-[36px] rounded-lg flex items-center justify-center border-2 transition-all
              ${isDone
                ? 'bg-gradient-to-br from-yellow-500 to-orange-500 border-orange-400 shadow-sm'
                : isToday
                ? 'bg-orange-500/20 border-orange-400/60 animate-pulse'
                : 'bg-muted/30 border-muted'}`}
            >
              {isDone
                ? <CheckCircle className="w-3.5 h-3.5 text-white" />
                : isToday
                ? <Flame className="w-3 h-3 text-orange-400" />
                : <Lock className="w-3 h-3 text-muted-foreground" />
              }
            </div>
            <span className={`text-[9px] font-medium ${isDone ? 'text-orange-400' : 'text-muted-foreground'}`}>
              D{dayNum}
            </span>
          </div>
        ))}
      </div>

      {/* Today's ad progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">Today's ads</span>
          <span className={`font-orbitron font-bold ${todayDone ? 'text-green-400' : 'text-primary'}`}>
            {adsToday}/{ADS_REQUIRED}
          </span>
        </div>
        <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, (adsToday / ADS_REQUIRED) * 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {todayDone
            ? '✅ Today complete! Keep the streak going.'
            : `Watch ${ADS_REQUIRED - adsToday} more ad${ADS_REQUIRED - adsToday !== 1 ? 's' : ''} to count today.`}
        </p>
      </div>

      {/* Claim button or status */}
      {canClaim ? (
        <Button
          onClick={handleClaimBonus}
          disabled={claiming}
          className="w-full h-12 font-bold bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:opacity-90 shadow-lg"
        >
          {claiming ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Claiming...</>
          ) : (
            <><Star className="w-4 h-4 mr-2" />Claim {BONUS_COINS} Coin Bonus!</>
          )}
        </Button>
      ) : (
        <div className={`p-3 rounded-xl text-center text-xs font-medium ${
          currentStreak >= STREAK_REQUIRED
            ? 'bg-green-500/10 border border-green-500/30 text-green-400'
            : 'bg-muted/30 border border-muted text-muted-foreground'
        }`}>
          {currentStreak >= STREAK_REQUIRED
            ? '🎉 Streak complete! Watch 5 ads today to claim.'
            : currentStreak === 0
            ? 'Start your 7-day streak — watch 5 ads today!'
            : `${STREAK_REQUIRED - currentStreak} more day${STREAK_REQUIRED - currentStreak !== 1 ? 's' : ''} to go. Don't break the streak!`}
        </div>
      )}
    </div>
  );
};
