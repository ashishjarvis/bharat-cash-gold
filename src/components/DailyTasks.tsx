import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Circle, Gift, Play, Calendar, Trophy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AdLoadingOverlay } from './AdLoadingOverlay';
import { CountdownButton } from './CountdownButton';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { showRewardedAd } from '@/lib/unityAds';
import { toast } from 'sonner';

interface DailyTasksProps {
  completedTasks: string[];
  onTaskComplete: (taskId: string) => void;
  onReward: (coins: number) => void;
  tapCount: number;
  adsWatched: number;
}

// Check server-side ad limits
const checkAdLimits = async (userId: string): Promise<{ allowed: boolean; reason?: string }> => {
  try {
    const res = await fetch('/api/ads/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  } catch {
    return { allowed: true };
  }
};

export const DailyTasks = ({
  completedTasks,
  onTaskComplete,
  onReward,
  tapCount,
  adsWatched,
}: DailyTasksProps) => {
  const { user } = useSimpleAuth();
  const [isLoadingAd, setIsLoadingAd]       = useState(false);
  const [videosWatchedToday, setVideosWatchedToday] = useState(0);
  const [canCheckIn, setCanCheckIn]         = useState(true);

  // Fetch daily progress from DB
  useEffect(() => {
    const fetchDailyProgress = async () => {
      if (!user) return;
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('profiles')
        .select('last_checkin_date, videos_watched_today, last_video_reset_date')
        .eq('id', user.id)
        .single();

      if (data) {
        if (data.last_video_reset_date !== today) {
          await supabase
            .from('profiles')
            .update({ videos_watched_today: 0, last_video_reset_date: today })
            .eq('id', user.id);
          setVideosWatchedToday(0);
        } else {
          setVideosWatchedToday(data.videos_watched_today || 0);
        }
        setCanCheckIn(data.last_checkin_date !== today);
      }
    };
    fetchDailyProgress();
  }, [user]);

  // ── Daily Check-in: requires watching a rewarded ad ──────────
  const handleClaimCheckIn = useCallback(async () => {
    if (!user || !canCheckIn || isLoadingAd) return;
    setIsLoadingAd(true);
    try {
      const result = await showRewardedAd(user.id, () => checkAdLimits(user.id));

      if (result.success) {
        const today = new Date().toISOString().split('T')[0];
        await supabase
          .from('profiles')
          .update({ last_checkin_date: today })
          .eq('id', user.id);
        setCanCheckIn(false);
        onReward(2);
        onTaskComplete('checkin');
        toast.success('+2 coins! Daily check-in complete.');
      } else {
        switch (result.reason) {
          case 'not_completed':
            toast.error('Ad not completed — no reward.');
            break;
          case 'cooldown':
            toast.warning('Please wait 30 seconds between ads.');
            break;
          case 'daily_limit':
            toast.warning('Daily ad limit reached. Come back tomorrow!');
            break;
          default:
            toast.error('Ad not available right now. Try again later.');
        }
      }
    } finally {
      setIsLoadingAd(false);
    }
  }, [user, canCheckIn, isLoadingAd, onReward, onTaskComplete]);

  // ── Watch Ad to earn (Video Marathon) ────────────────────────
  const handleWatchVideo = useCallback(async () => {
    if (!user || videosWatchedToday >= 10 || isLoadingAd) return;
    setIsLoadingAd(true);
    try {
      const result = await showRewardedAd(user.id, () => checkAdLimits(user.id));

      if (result.success) {
        const newCount = videosWatchedToday + 1;
        await supabase
          .from('profiles')
          .update({ videos_watched_today: newCount })
          .eq('id', user.id);
        setVideosWatchedToday(newCount);
        onReward(0.2);
        toast.success('+0.2 coins!');

        if (newCount === 10) {
          onReward(10);
          onTaskComplete('marathon');
          toast.success('🏆 Marathon Complete! +10 bonus coins!');
        }
      } else {
        switch (result.reason) {
          case 'not_completed':
            toast.error('Ad not completed — no reward.');
            break;
          case 'cooldown':
            toast.warning('Please wait 30 seconds between ads.');
            break;
          case 'daily_limit':
            toast.warning('Daily ad limit reached (50/day). Come back tomorrow!');
            break;
          default:
            toast.error('Ad not available right now. Try again later.');
        }
      }
    } finally {
      setIsLoadingAd(false);
    }
  }, [user, videosWatchedToday, isLoadingAd, onReward, onTaskComplete]);

  const marathonProgress  = (videosWatchedToday / 10) * 100;
  const isMarathonComplete = videosWatchedToday >= 10;

  return (
    <>
      <AdLoadingOverlay isVisible={isLoadingAd} />

      <div className="space-y-4">
        {/* Daily Check-in */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-gold-dark flex items-center justify-center gold-glow">
              <Calendar className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-primary">Daily Check-in</h3>
              <p className="text-muted-foreground text-sm">Watch an ad to claim bonus!</p>
            </div>
            <div className="text-right">
              <span className="text-xl font-orbitron font-bold text-accent">+2</span>
              <span className="text-muted-foreground text-sm ml-1">Coins</span>
            </div>
          </div>

          <CountdownButton
            onClick={handleClaimCheckIn}
            disabled={!canCheckIn || isLoadingAd}
            className="w-full h-12 text-lg font-bold btn-gold-glow"
          >
            {isLoadingAd ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Loading Ad...</>
            ) : !canCheckIn ? (
              <><CheckCircle className="w-5 h-5 mr-2" />Claimed Today!</>
            ) : (
              <><Gift className="w-5 h-5 mr-2" />Claim Check-in</>
            )}
          </CountdownButton>
        </div>

        {/* Watch Ad to Earn */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary to-neon-cyan flex items-center justify-center">
              <Play className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-primary">Watch Ad</h3>
              <p className="text-muted-foreground text-sm">Earn coins per video</p>
            </div>
            <div className="text-right">
              <span className="text-xl font-orbitron font-bold text-accent">+0.2</span>
              <span className="text-muted-foreground text-sm ml-1">Coins</span>
            </div>
          </div>

          <CountdownButton
            onClick={handleWatchVideo}
            disabled={isMarathonComplete || isLoadingAd}
            className="w-full h-12 text-lg font-bold btn-gold-glow"
          >
            {isLoadingAd ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Loading Ad...</>
            ) : (
              <><Play className="w-5 h-5 mr-2" />Watch Ad ({videosWatchedToday}/10)</>
            )}
          </CountdownButton>
        </div>

        {/* Video Marathon */}
        <div className="glass-card p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5 pointer-events-none" />
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center gold-glow">
              <Trophy className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg gold-gradient-text">Video Marathon</h3>
              <p className="text-muted-foreground text-sm">Watch 10 ads for +10 bonus!</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-orbitron font-bold text-accent">+10</span>
              <span className="text-muted-foreground text-sm ml-1">Bonus</span>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-orbitron text-primary">{videosWatchedToday}/10</span>
            </div>
            <Progress value={marathonProgress} className="h-3 bg-muted" />
          </div>

          {isMarathonComplete && (
            <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-accent/20 border border-accent/30">
              <CheckCircle className="w-5 h-5 text-accent" />
              <span className="font-bold text-accent">Marathon Complete! +10 Bonus Claimed</span>
            </div>
          )}
        </div>

        {/* Other Tasks */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Gift className="w-6 h-6 text-primary" />
            <h3 className="font-bold text-lg text-primary">Other Tasks</h3>
          </div>

          <div className="space-y-3">
            {/* Tap 50 Times */}
            <div className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              tapCount >= 50 && completedTasks.includes('tap50')
                ? 'bg-accent/10 border border-accent/30'
                : 'bg-muted/30 border border-muted'
            }`}>
              <span className="text-2xl">👆</span>
              <div className="flex-1">
                <p className={`font-medium ${tapCount >= 50 && completedTasks.includes('tap50') ? 'text-accent' : 'text-foreground'}`}>
                  Tap 50 Times
                </p>
                <p className="text-sm text-muted-foreground">
                  {tapCount >= 50 ? '+3 Coins' : `${tapCount}/50 taps`}
                </p>
              </div>
              {tapCount >= 50 && completedTasks.includes('tap50') ? (
                <CheckCircle className="w-6 h-6 text-accent" />
              ) : tapCount >= 50 ? (
                <Button
                  size="sm"
                  onClick={() => { onTaskComplete('tap50'); onReward(3); }}
                  className="bg-primary hover:bg-gold-light text-primary-foreground"
                >Claim</Button>
              ) : (
                <Circle className="w-6 h-6 text-muted-foreground" />
              )}
            </div>

            {/* Watch 3 Ads */}
            <div className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              adsWatched >= 3 && completedTasks.includes('watch3')
                ? 'bg-accent/10 border border-accent/30'
                : 'bg-muted/30 border border-muted'
            }`}>
              <span className="text-2xl">📺</span>
              <div className="flex-1">
                <p className={`font-medium ${adsWatched >= 3 && completedTasks.includes('watch3') ? 'text-accent' : 'text-foreground'}`}>
                  Watch 3 Ads
                </p>
                <p className="text-sm text-muted-foreground">
                  {adsWatched >= 3 ? '+2 Coins' : `${adsWatched}/3 ads`}
                </p>
              </div>
              {adsWatched >= 3 && completedTasks.includes('watch3') ? (
                <CheckCircle className="w-6 h-6 text-accent" />
              ) : adsWatched >= 3 ? (
                <Button
                  size="sm"
                  onClick={() => { onTaskComplete('watch3'); onReward(2); }}
                  className="bg-primary hover:bg-gold-light text-primary-foreground"
                >Claim</Button>
              ) : (
                <Circle className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
