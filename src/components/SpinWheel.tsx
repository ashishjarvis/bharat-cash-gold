import { useState, useRef } from 'react';
import { RotateCw, Gift, Lock } from 'lucide-react';
import { AdLoadingOverlay } from './AdLoadingOverlay';
import { CountdownButton } from './CountdownButton';
import { useSpinLimits } from '@/hooks/useSpinLimits';
import { toast } from 'sonner';

interface SpinWheelProps {
  onReward: (coins: number) => void;
}

const WHEEL_SEGMENTS = [0.1, 0.2, 0.3, 0.1, 0.5, 0.2, 0.1, 0.4];
const SEGMENT_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--accent))',
  'hsl(var(--secondary))',
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
];

export const SpinWheel = ({ onReward }: SpinWheelProps) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [reward, setReward] = useState<number | null>(null);
  const [pendingSegment, setPendingSegment] = useState<number | null>(null);
  const [spinType, setSpinType] = useState<'free' | 'ad' | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  
  const {
    canFreeSpin,
    canAdSpin,
    adSpinsRemaining,
    freeSpinUsed,
    useFreeSpin,
    useAdSpin,
    loading,
  } = useSpinLimits();

  const executeWheel = (segmentIndex: number) => {
    setIsSpinning(true);
    setReward(null);

    // Calculate rotation - spin multiple times plus land on segment
    const spins = 5 + Math.random() * 3;
    const segmentAngle = 360 / WHEEL_SEGMENTS.length;
    // Calculate angle to land pointer on the segment (pointer is at top)
    const targetAngle = 360 - (segmentIndex * segmentAngle + segmentAngle / 2);
    const finalRotation = spins * 360 + targetAngle;
    
    setRotation(prev => prev + finalRotation);

    setTimeout(() => {
      const wonAmount = WHEEL_SEGMENTS[segmentIndex];
      setReward(wonAmount);
      onReward(wonAmount);
      setIsSpinning(false);
      setPendingSegment(null);
      setSpinType(null);
    }, 4000);
  };

  const handleFreeSpin = async () => {
    if (isSpinning || !canFreeSpin) return;
    
    const success = await useFreeSpin();
    if (!success) return;

    // Calculate the winning segment and spin directly (no ad)
    const segmentIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    executeWheel(segmentIndex);
    toast.success('Free spin used!');
  };

  const handleAdSpin = () => {
    if (isSpinning || showAd || !canAdSpin) {
      if (!canAdSpin) {
        toast.error('Daily ad spin limit reached!');
      }
      return;
    }
    
    // Calculate the winning segment first
    const segmentIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    setPendingSegment(segmentIndex);
    setSpinType('ad');
    
    // Show loading ad toast
    toast.loading('Loading Ad...', { id: 'ad-loading', duration: 2000 });
    
    setTimeout(() => {
      toast.dismiss('ad-loading');
      setShowAd(true);
    }, 500);
  };

  const handleAdComplete = async (success: boolean) => {
    setShowAd(false);
    
    if (!success || pendingSegment === null) {
      setPendingSegment(null);
      setSpinType(null);
      toast.error('Ad skipped - no reward');
      return;
    }

    // Record the ad spin
    const recorded = await useAdSpin();
    if (!recorded) {
      setPendingSegment(null);
      setSpinType(null);
      return;
    }

    executeWheel(pendingSegment);
  };

  if (loading) {
    return (
      <div className="glass-card p-4 flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <AdLoadingOverlay 
        isVisible={showAd} 
        onComplete={handleAdComplete}
        duration={5000}
      />
      
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-primary">Spin & Win</h3>
          <div className="text-[10px] text-muted-foreground">
            {adSpinsRemaining}/20 ads left
          </div>
        </div>
        
        <div className="relative w-32 h-32 mx-auto mb-3">
          {/* Wheel */}
          <div 
            ref={wheelRef}
            className="w-full h-full rounded-full border-4 border-primary overflow-hidden relative gold-glow"
            style={{ 
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none'
            }}
          >
            {/* SVG-based wheel segments for proper rendering */}
            <svg className="w-full h-full" viewBox="0 0 100 100">
              {WHEEL_SEGMENTS.map((segment, i) => {
                const angle = (360 / WHEEL_SEGMENTS.length);
                const startAngle = i * angle - 90;
                const endAngle = startAngle + angle;
                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;
                
                const x1 = 50 + 50 * Math.cos(startRad);
                const y1 = 50 + 50 * Math.sin(startRad);
                const x2 = 50 + 50 * Math.cos(endRad);
                const y2 = 50 + 50 * Math.sin(endRad);
                
                const largeArc = angle > 180 ? 1 : 0;
                
                const path = `M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`;
                
                // Text position
                const midAngle = ((startAngle + endAngle) / 2 * Math.PI) / 180;
                const textX = 50 + 30 * Math.cos(midAngle);
                const textY = 50 + 30 * Math.sin(midAngle);
                
                return (
                  <g key={i}>
                    <path
                      d={path}
                      fill={SEGMENT_COLORS[i]}
                      stroke="hsl(var(--background))"
                      strokeWidth="0.5"
                    />
                    <text
                      x={textX}
                      y={textY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="hsl(var(--primary-foreground))"
                      fontSize="8"
                      fontWeight="bold"
                      style={{ fontFamily: 'var(--font-orbitron)' }}
                    >
                      {segment}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-accent z-10" />

          {/* Center */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-card border-2 border-primary flex items-center justify-center">
            <RotateCw className={`w-4 h-4 text-primary ${isSpinning ? 'animate-spin' : ''}`} />
          </div>
        </div>

        {/* Reward display */}
        {reward !== null && (
          <div className="text-center mb-3 animate-coin-drop">
            <p className="text-lg font-orbitron font-bold text-accent">+{reward}</p>
          </div>
        )}

        {/* Spin buttons */}
        <div className="space-y-2">
          {/* Free Spin Button */}
          {canFreeSpin ? (
            <button
              onClick={handleFreeSpin}
              disabled={isSpinning}
              className="w-full py-2 rounded-lg bg-gradient-to-r from-accent to-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 gold-glow"
            >
              <Gift className="w-4 h-4" />
              Free Spin
            </button>
          ) : (
            <div className="w-full py-2 rounded-lg bg-muted/50 text-muted-foreground text-xs text-center flex items-center justify-center gap-2">
              <Lock className="w-3 h-3" />
              Free spin used today
            </div>
          )}

          {/* Ad Spin Button */}
          <CountdownButton 
            onClick={handleAdSpin}
            disabled={isSpinning || showAd || !canAdSpin}
            className="w-full btn-gold-glow text-xs py-2"
          >
            {isSpinning ? 'Spinning...' : `Watch Ad to Spin (${adSpinsRemaining} left)`}
          </CountdownButton>
        </div>
        
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          1 free + 20 ad spins daily • Resets at midnight
        </p>
      </div>
    </>
  );
};
