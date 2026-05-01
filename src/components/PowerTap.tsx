import { useState, useRef, useEffect } from 'react';
import { Zap, Hand, Timer } from 'lucide-react';
import { AdLoadingOverlay } from './AdLoadingOverlay';
import { Progress } from '@/components/ui/progress';

interface PowerTapProps {
  onReward: (coins: number) => void;
}

export const PowerTap = ({ onReward }: PowerTapProps) => {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [showAd, setShowAd] = useState(false);
  const [completed, setCompleted] = useState(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const HOLD_DURATION = 30; // 30 seconds
  const REWARD_COINS = 20;

  const startHold = () => {
    if (showAd || completed) return;
    
    setIsHolding(true);
    setHoldProgress(0);
    
    const startTime = Date.now();
    
    progressIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setHoldProgress(progress);
      
      if (progress >= 100) {
        clearInterval(progressIntervalRef.current!);
        setIsHolding(false);
        setCompleted(true);
        setShowAd(true);
      }
    }, 100);
  };

  const stopHold = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    if (!completed) {
      setIsHolding(false);
      setHoldProgress(0);
    }
  };

  const handleAdComplete = (success: boolean) => {
    setShowAd(false);
    
    if (success) {
      onReward(REWARD_COINS);
    }
    
    // Reset for next use after 5 seconds
    setTimeout(() => {
      setCompleted(false);
      setHoldProgress(0);
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const timeRemaining = Math.ceil(HOLD_DURATION - (holdProgress / 100) * HOLD_DURATION);

  return (
    <>
      <AdLoadingOverlay 
        isVisible={showAd} 
        onComplete={handleAdComplete}
        duration={5000}
      />
      
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-secondary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-primary">Power Tap</h3>
              <p className="text-muted-foreground text-sm">Hold for 30 seconds</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Reward</p>
            <p className="font-orbitron text-lg text-accent font-bold">+{REWARD_COINS}</p>
            <p className="text-xs text-muted-foreground">Coins</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Progress</span>
            <span>{holdProgress.toFixed(0)}%</span>
          </div>
          <Progress value={holdProgress} className="h-3" />
        </div>

        {/* Timer Display */}
        {isHolding && (
          <div className="flex items-center justify-center gap-2 mb-4">
            <Timer className="w-5 h-5 text-secondary animate-pulse" />
            <span className="font-orbitron text-2xl text-secondary">{timeRemaining}s</span>
          </div>
        )}

        {/* Hold Button */}
        <div
          onMouseDown={startHold}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onTouchStart={startHold}
          onTouchEnd={stopHold}
          className={`relative w-full h-32 rounded-xl border-2 flex items-center justify-center cursor-pointer select-none transition-all ${
            completed
              ? 'bg-accent/20 border-accent/50'
              : isHolding
              ? 'bg-gradient-to-br from-secondary/30 to-accent/20 border-secondary scale-[0.98]'
              : 'bg-gradient-to-br from-secondary/10 to-accent/10 border-secondary/30 hover:border-secondary/50'
          }`}
        >
          {/* Animated glow when holding */}
          {isHolding && (
            <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-secondary/20 to-transparent animate-pulse" />
          )}
          
          <div className="text-center z-10">
            {completed ? (
              <>
                <div className="text-4xl mb-2">🎉</div>
                <p className="font-bold text-accent">Completed!</p>
                <p className="text-xs text-muted-foreground">Watch ad for reward</p>
              </>
            ) : (
              <>
                <Hand className={`w-12 h-12 mx-auto mb-2 ${isHolding ? 'text-secondary' : 'text-muted-foreground'}`} />
                <p className={`font-bold ${isHolding ? 'text-secondary' : 'text-muted-foreground'}`}>
                  {isHolding ? 'Keep Holding!' : 'TAP & HOLD'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Don't release until complete
                </p>
              </>
            )}
          </div>
        </div>

        {/* Warning */}
        <p className="text-xs text-destructive/70 text-center mt-3">
          ⚠️ Releasing early will reset progress!
        </p>
      </div>
    </>
  );
};
