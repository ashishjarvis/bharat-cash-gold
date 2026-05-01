import { useState, useCallback } from 'react';
import { Hand, Sparkles, Zap, AlertTriangle, Loader2 } from 'lucide-react';
import { useAntiSpam } from '@/hooks/useAntiSpam';
import { AdLoadingOverlay } from './AdLoadingOverlay';
import { showInterstitialAd } from '@/lib/unityAds';
import { toast } from 'sonner';

interface TapToEarnProps {
  onTap: () => void;
  tapCount: number;
  onAddCoins: (amount: number) => void;
}

export const TapToEarn = ({ onTap, tapCount, onAddCoins }: TapToEarnProps) => {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [isLoadingAd, setIsLoadingAd] = useState(false);
  const { isBlocked, checkClick, warningCount } = useAntiSpam();

  const cycleCount = tapCount % 10;

  const handleTap = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!checkClick() || isLoadingAd) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newRipple = { id: Date.now(), x, y };
    setRipples(prev => [...prev, newRipple]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== newRipple.id)), 600);

    onTap();
    const newCycleCount = (tapCount + 1) % 10;

    // Every 10th tap triggers an interstitial ad
    if (newCycleCount === 0 && tapCount > 0) {
      setIsLoadingAd(true);
      try {
        const result = await showInterstitialAd();

        if (result.success) {
          // Reward only granted if ad state == COMPLETED
          onAddCoins(result.reward);
          // Play haptic if available (Capacitor Haptics)
          try {
            const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
            await Haptics.impact({ style: ImpactStyle.Medium });
          } catch {
            // Haptics not available on web — silently skip
          }
          toast.success('+0.2 coins earned!', { description: 'Ad completed.' });
        } else {
          switch (result.reason) {
            case 'not_completed':
              toast.error('Ad not completed, no reward granted.');
              break;
            case 'not_available':
            default:
              toast.error('Ad not available at the moment, please try again later.');
          }
        }
      } finally {
        setIsLoadingAd(false);
      }
    }
  }, [checkClick, onTap, tapCount, onAddCoins, isLoadingAd]);

  return (
    <>
      <AdLoadingOverlay isVisible={isLoadingAd} />

      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary/20 flex items-center justify-center">
              <Hand className="w-4 h-4 text-secondary" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-primary">Tap to Earn</h3>
              <p className="text-muted-foreground text-xs">10 taps = ad + 0.2 coins</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Taps</p>
            <p className="font-orbitron text-sm text-secondary">{cycleCount}/10</p>
          </div>
        </div>

        {warningCount > 0 && (
          <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-xs text-destructive">
              Warning {warningCount}/3 — Slow down!
            </span>
          </div>
        )}

        <div className="w-full h-1.5 bg-muted rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-secondary to-primary transition-all duration-200"
            style={{ width: `${(cycleCount / 10) * 100}%` }}
          />
        </div>

        <div
          onClick={handleTap}
          className={`relative w-full h-28 rounded-xl border-2 flex items-center justify-center cursor-pointer active:scale-95 transition-transform overflow-hidden select-none ${
            isBlocked || isLoadingAd
              ? 'bg-destructive/10 border-destructive/50 cursor-not-allowed'
              : 'bg-gradient-to-br from-secondary/20 to-neon-cyan/10 border-secondary/30'
          }`}
        >
          {!isBlocked && !isLoadingAd && (
            <div className="absolute inset-0 bg-gradient-to-t from-secondary/5 to-transparent animate-pulse" />
          )}

          {ripples.map(ripple => (
            <span
              key={ripple.id}
              className="absolute w-4 h-4 bg-secondary/50 rounded-full animate-ping"
              style={{ left: ripple.x - 8, top: ripple.y - 8 }}
            />
          ))}

          <div className="text-center z-10">
            {isLoadingAd ? (
              <>
                <Loader2 className="w-10 h-10 text-primary mx-auto mb-1 animate-spin" />
                <p className="font-bold text-sm text-primary">Loading Ad...</p>
              </>
            ) : isBlocked ? (
              <>
                <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-1" />
                <p className="font-bold text-sm text-destructive">BLOCKED</p>
                <p className="text-xs text-muted-foreground">Wait 5 seconds</p>
              </>
            ) : (
              <>
                <div className="relative">
                  <Zap className="w-10 h-10 text-secondary mx-auto mb-1" />
                  <Sparkles className="w-4 h-4 text-primary absolute -top-1 -right-1 animate-pulse" />
                </div>
                <p className="font-bold text-sm text-secondary">TAP HERE</p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
