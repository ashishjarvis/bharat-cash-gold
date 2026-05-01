import { useState } from 'react';
import { Play, Trophy, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { CountdownButton } from './CountdownButton';
import { AdLoadingOverlay } from './AdLoadingOverlay';
import { showRewardedAd } from '@/lib/unityAds';
import { toast } from 'sonner';

interface MegaTaskProps {
  adsWatched: number;
  onAdWatched: () => void;
  onRewardClaimed: (coins: number) => void;
  onReset: () => void;
  userId: string;
  onCheckAdLimits: () => Promise<{ allowed: boolean; reason?: string }>;
}

export const MegaTask = ({
  adsWatched,
  onAdWatched,
  onRewardClaimed,
  onReset,
  userId,
  onCheckAdLimits,
}: MegaTaskProps) => {
  const [isLoadingAd, setIsLoadingAd] = useState(false);
  const [showReward, setShowReward] = useState(false);

  const isComplete = adsWatched >= 10;
  const progress = (adsWatched / 10) * 100;

  const handleWatchAd = async () => {
    if (isComplete || isLoadingAd) return;
    setIsLoadingAd(true);

    try {
      const result = await showRewardedAd(userId, onCheckAdLimits);

      if (result.success) {
        // Reward ONLY granted via Unity Ads onUnityAdsShowComplete(state == COMPLETED)
        onAdWatched();
        onRewardClaimed(result.reward);

        if (adsWatched + 1 >= 10) {
          setShowReward(true);
          setTimeout(() => {
            setShowReward(false);
            onReset();
          }, 2000);
        } else {
          toast.success(`+${result.reward} coins earned!`);
        }
      } else {
        // Skipped, failed, closed early, or limit reached
        switch (result.reason) {
          case 'not_completed':
            toast.error('Ad not completed, no reward granted.');
            break;
          case 'cooldown':
            toast.warning('Please wait 30 seconds between ads.');
            break;
          case 'daily_limit':
            toast.warning('Daily ad limit reached (50 ads/day). Come back tomorrow!');
            break;
          case 'not_available':
          default:
            toast.error('Ad not available at the moment, please try again later.');
        }
      }
    } finally {
      setIsLoadingAd(false);
    }
  };

  return (
    <>
      <AdLoadingOverlay isVisible={isLoadingAd} />

      <div className="glass-card p-6 relative overflow-hidden animate-pulse-gold">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 pointer-events-none" />

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-gold-dark flex items-center justify-center gold-glow">
            <Trophy className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-bold text-lg gold-gradient-text">MEGA TASK</h3>
            <p className="text-muted-foreground text-sm">Watch 10 Ads — Earn 10 Coins</p>
          </div>
          <div className="ml-auto">
            <span className="text-2xl font-orbitron font-bold text-accent">+10</span>
            <span className="text-muted-foreground text-sm ml-1">Coins</span>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-orbitron text-primary">{adsWatched}/10</span>
          </div>
          <Progress value={progress} className="h-3 bg-muted" />
        </div>

        <CountdownButton
          onClick={handleWatchAd}
          disabled={isComplete || isLoadingAd}
          className="w-full h-14 text-lg font-bold btn-gold-glow"
        >
          {isLoadingAd ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Loading Ad...
            </>
          ) : isComplete ? (
            <>
              <CheckCircle className="w-5 h-5 mr-2" />
              Completed!
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2" />
              Watch Ad ({adsWatched}/10)
            </>
          )}
        </CountdownButton>

        {showReward && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm z-10">
            <div className="text-center animate-coin-drop">
              <Trophy className="w-16 h-16 text-primary mx-auto mb-4" />
              <p className="text-3xl font-orbitron font-bold gold-gradient-text">+10 COINS!</p>
              <p className="text-muted-foreground">Task Complete!</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
