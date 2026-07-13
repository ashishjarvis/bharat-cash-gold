import { useState, useEffect, useRef, useCallback } from 'react';
import { Gamepad2, Coins, Clock, AlertCircle, Wifi, Star, Play, X, Volume2 } from 'lucide-react';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { toast } from 'sonner';

const REWARD_INTERVAL_MS  = 2 * 60 * 1000;  // 2 minutes
const COINS_PER_INTERVAL  = 2;
const DAILY_COIN_LIMIT    = 50;
const AD_COUNTDOWN_SECS   = 5;              // seconds before "Skip" becomes available

interface GameZoneRewardResponse {
  success: boolean;
  coinsAwarded?: number;
  totalToday?: number;
  limitReached?: boolean;
  error?: string;
}

const claimGameReward = async (
  userId: string,
  sessionId: string,
  minuteBlock: number,
): Promise<GameZoneRewardResponse> => {
  try {
    const res = await fetch('/api/gamezone/reward', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId, sessionId, minuteBlock }),
    });
    return await res.json();
  } catch {
    return { success: false, error: 'Network error' };
  }
};

// ─── Ad Phase type ────────────────────────────────────────────────────────────
type AdPhase = 'idle' | 'ad' | 'playing';

interface GameZoneProps {
  onCoinsEarned: (amount: number) => void;
}

// ─── Pre-roll Ad Overlay ──────────────────────────────────────────────────────
const PreRollAd = ({ onAdComplete }: { onAdComplete: () => void }) => {
  const [countdown, setCountdown]   = useState(AD_COUNTDOWN_SECS);
  const [canSkip, setCanSkip]       = useState(false);
  const [adProgress, setAdProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Start countdown & progress bar
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        const next = prev - 1;
        setAdProgress(((AD_COUNTDOWN_SECS - next) / AD_COUNTDOWN_SECS) * 100);
        if (next <= 0) {
          clearInterval(intervalRef.current!);
          setCanSkip(true);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Ad label */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-[10px] text-white/40 uppercase tracking-widest border border-white/20 px-2 py-0.5 rounded">
          Advertisement
        </span>
        {canSkip ? (
          <button
            onClick={onAdComplete}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-white/20 hover:bg-white/30 active:scale-95 transition-all px-4 py-1.5 rounded-full"
          >
            <X className="w-3.5 h-3.5" />
            Skip Ad
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-white/50 border border-white/20 px-3 py-1.5 rounded-full">
            <Clock className="w-3.5 h-3.5" />
            Skip in {countdown}s
          </div>
        )}
      </div>

      {/* Ad creative area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        {/* Simulated video ad placeholder */}
        <div className="w-full max-w-sm aspect-video rounded-2xl bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex flex-col items-center justify-center gap-4 border border-white/10 relative overflow-hidden">
          {/* Animated background shimmer */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_2s_linear_infinite] -translate-x-full" style={{backgroundSize:'200% 100%'}} />

          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center">
              <Volume2 className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <p className="text-white/80 font-bold text-lg text-center leading-tight">
              Bharat Cash Gold
            </p>
            <p className="text-white/50 text-xs text-center max-w-[200px]">
              Play games, earn coins, withdraw real cash!
            </p>
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div
              className="h-1 bg-primary transition-all duration-1000 ease-linear"
              style={{ width: `${adProgress}%` }}
            />
          </div>
        </div>

        <p className="text-white/30 text-xs text-center">
          Your game will start after this short ad
        </p>
      </div>

      {/* Bottom bar */}
      <div className="px-4 pb-6 pt-2">
        <button
          onClick={canSkip ? onAdComplete : undefined}
          disabled={!canSkip}
          className={`w-full py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
            canSkip
              ? 'bg-gradient-to-r from-primary to-accent text-black active:scale-95'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          <Play className="w-5 h-5" />
          {canSkip ? 'Play Game Now!' : `Starting in ${countdown}s…`}
        </button>
      </div>
    </div>
  );
};

// ─── Main GameZone Component ──────────────────────────────────────────────────
const GameZone = ({ onCoinsEarned }: GameZoneProps) => {
  const { user } = useSimpleAuth();

  const [gameUrl, setGameUrl]           = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [adPhase, setAdPhase]           = useState<AdPhase>('idle');
  const [coinsToday, setCoinsToday]     = useState(0);
  const [nextRewardIn, setNextRewardIn] = useState(REWARD_INTERVAL_MS / 1000);

  const sessionIdRef    = useRef<string>('');
  const sessionStartRef = useRef<number>(0);
  const rewardTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const minuteBlockRef  = useRef<number>(0);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => { setGameUrl(data.gamezone_url || null); setConfigLoaded(true); })
      .catch(() => setConfigLoaded(true));
  }, []);

  const stopSession = useCallback(() => {
    if (rewardTimerRef.current) clearInterval(rewardTimerRef.current);
    if (countdownRef.current)   clearInterval(countdownRef.current);
    rewardTimerRef.current = null;
    countdownRef.current   = null;
    setAdPhase('idle');
    setNextRewardIn(REWARD_INTERVAL_MS / 1000);
    minuteBlockRef.current = 0;
  }, []);

  const startSession = useCallback(() => {
    if (!user?.id || coinsToday >= DAILY_COIN_LIMIT) return;

    sessionIdRef.current    = `gz-${user.id}-${Date.now()}`;
    sessionStartRef.current = Date.now();
    minuteBlockRef.current  = 0;
    setAdPhase('playing');
    setNextRewardIn(REWARD_INTERVAL_MS / 1000);

    countdownRef.current = setInterval(() => {
      setNextRewardIn(prev => (prev <= 1 ? REWARD_INTERVAL_MS / 1000 : prev - 1));
    }, 1000);

    rewardTimerRef.current = setInterval(async () => {
      minuteBlockRef.current += 1;
      const result = await claimGameReward(user.id, sessionIdRef.current, minuteBlockRef.current);

      if (result.success && result.coinsAwarded) {
        onCoinsEarned(result.coinsAwarded);
        setCoinsToday(result.totalToday ?? 0);
        toast.success(`🎮 +${result.coinsAwarded} coins — GameZone reward!`);
        if (result.limitReached) { toast.info('Daily limit reached (50 coins). Come back tomorrow!'); stopSession(); }
      } else if (result.limitReached) {
        toast.info('GameZone daily limit reached. Come back tomorrow!');
        stopSession();
      }
    }, REWARD_INTERVAL_MS);
  }, [user?.id, coinsToday, onCoinsEarned, stopSession]);

  // User clicks "Play Game" → show pre-roll ad first
  const handlePlayClick = useCallback(() => {
    if (!user?.id || coinsToday >= DAILY_COIN_LIMIT) return;
    setAdPhase('ad');
  }, [user?.id, coinsToday]);

  // Ad finished → launch actual game
  const handleAdComplete = useCallback(() => {
    startSession();
  }, [startSession]);

  useEffect(() => () => stopSession(), [stopSession]);

  const sessionActive = adPhase === 'playing';
  const limitReached  = coinsToday >= DAILY_COIN_LIMIT;

  if (!configLoaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center animate-pulse">
          <Gamepad2 className="w-12 h-12 text-primary mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Loading GameZone…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Pre-roll ad overlay */}
      {adPhase === 'ad' && <PreRollAd onAdComplete={handleAdComplete} />}

      <div className="space-y-4">
        {/* Header card */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-6 h-6 text-primary" />
              <h2 className="font-bold text-lg gold-gradient-text font-orbitron">GameZone</h2>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Coins className="w-3 h-3 text-primary" />
              <span className="font-bold text-primary">{coinsToday}</span>
              <span>/ {DAILY_COIN_LIMIT} coins today</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-muted/40 rounded-full h-2 mb-3">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
              style={{ width: `${Math.min((coinsToday / DAILY_COIN_LIMIT) * 100, 100)}%` }}
            />
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-primary" />
              <span>+{COINS_PER_INTERVAL} coins every 2 min</span>
            </div>
            {sessionActive && (
              <div className="flex items-center gap-1 text-green-400">
                <Clock className="w-3 h-3" />
                <span>Next reward in {nextRewardIn}s</span>
              </div>
            )}
          </div>
        </div>

        {/* Game area */}
        {gameUrl ? (
          <div className="glass-card overflow-hidden rounded-2xl">
            {/* Status banner */}
            {!sessionActive && !limitReached && (
              <div className="p-4 bg-primary/5 border-b border-primary/20">
                <button
                  onClick={handlePlayClick}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-black font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Play className="w-4 h-4" />
                  Play Game — Earn Coins!
                </button>
                <p className="text-center text-[10px] text-muted-foreground mt-2">
                  A short ad will play before the game starts
                </p>
              </div>
            )}
            {limitReached && (
              <div className="p-4 bg-yellow-500/10 border-b border-yellow-500/30 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <p className="text-xs text-yellow-300">Daily coin limit reached. Come back tomorrow!</p>
              </div>
            )}
            {sessionActive && (
              <div className="p-4 bg-green-500/10 border-b border-green-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-400 font-medium">Session active — earning coins!</span>
                </div>
                <button onClick={stopSession} className="text-xs text-muted-foreground underline">
                  Stop
                </button>
              </div>
            )}

            {/* Game iframe — only shown when session is active */}
            {sessionActive && (
              <iframe
                src={gameUrl}
                title="GameZone"
                className="w-full"
                style={{ height: '65vh', border: 'none' }}
                allow="fullscreen; autoplay"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            )}

            {/* Pre-game preview when idle */}
            {!sessionActive && !limitReached && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
                <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                  <Play className="w-10 h-10 text-primary ml-1" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Ready to play?</p>
                  <p className="text-xs text-muted-foreground mt-1">Tap the button above to start earning coins</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Placeholder when no URL is configured */
          <div className="glass-card p-8 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Gamepad2 className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground mb-2">Games Coming Soon!</h3>
              <p className="text-sm text-muted-foreground">
                Play exciting games and earn up to <span className="text-primary font-bold">50 coins/day</span> automatically
                — 2 coins every 2 minutes of gameplay.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              {['Puzzle', 'Arcade', 'Quiz'].map(g => (
                <div key={g} className="rounded-xl bg-muted/30 border border-primary/10 p-3 text-center">
                  <Gamepad2 className="w-6 h-6 text-primary/50 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">{g}</p>
                  <p className="text-[10px] text-primary/60 mt-1">Coming Soon</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-muted/20 border border-primary/10 p-4 text-left space-y-2">
              <p className="text-xs font-semibold text-primary">Pre-roll Ads Active</p>
              <p className="text-[11px] text-muted-foreground">
                A short 5-second ad plays before each game session. After the ad, the game starts and you earn coins every 2 minutes automatically.
              </p>
            </div>
            <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground pt-2">
              <Wifi className="w-3 h-3" />
              <span>Set <code className="text-primary">GAMEZONE_URL</code> in Secrets to activate</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default GameZone;
