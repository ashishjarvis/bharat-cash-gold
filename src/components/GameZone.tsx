import { useState, useEffect, useRef, useCallback } from 'react';
import { Gamepad2, Coins, Clock, AlertCircle, Wifi, Star } from 'lucide-react';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { toast } from 'sonner';

const REWARD_INTERVAL_MS  = 2 * 60 * 1000;  // 2 minutes
const COINS_PER_INTERVAL  = 2;
const DAILY_COIN_LIMIT    = 50;

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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, sessionId, minuteBlock }),
    });
    return await res.json();
  } catch {
    return { success: false, error: 'Network error' };
  }
};

interface GameZoneProps {
  onCoinsEarned: (amount: number) => void;
}

const GameZone = ({ onCoinsEarned }: GameZoneProps) => {
  const { user } = useSimpleAuth();

  const [gameUrl, setGameUrl]           = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
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
      .then(data => {
        setGameUrl(data.gamezone_url || null);
        setConfigLoaded(true);
      })
      .catch(() => setConfigLoaded(true));
  }, []);

  const stopSession = useCallback(() => {
    if (rewardTimerRef.current) clearInterval(rewardTimerRef.current);
    if (countdownRef.current)   clearInterval(countdownRef.current);
    rewardTimerRef.current = null;
    countdownRef.current   = null;
    setSessionActive(false);
    setNextRewardIn(REWARD_INTERVAL_MS / 1000);
    minuteBlockRef.current = 0;
  }, []);

  const startSession = useCallback(() => {
    if (!user?.id || coinsToday >= DAILY_COIN_LIMIT) return;

    sessionIdRef.current    = `gz-${user.id}-${Date.now()}`;
    sessionStartRef.current = Date.now();
    minuteBlockRef.current  = 0;
    setSessionActive(true);
    setNextRewardIn(REWARD_INTERVAL_MS / 1000);

    countdownRef.current = setInterval(() => {
      setNextRewardIn(prev => {
        if (prev <= 1) return REWARD_INTERVAL_MS / 1000;
        return prev - 1;
      });
    }, 1000);

    rewardTimerRef.current = setInterval(async () => {
      minuteBlockRef.current += 1;
      const result = await claimGameReward(
        user.id,
        sessionIdRef.current,
        minuteBlockRef.current,
      );

      if (result.success && result.coinsAwarded) {
        const earned = result.coinsAwarded;
        onCoinsEarned(earned);
        setCoinsToday(result.totalToday ?? 0);
        toast.success(`🎮 +${earned} coins — GameZone reward!`);

        if (result.limitReached) {
          toast.info('GameZone daily limit reached (50 coins). Come back tomorrow!');
          stopSession();
        }
      } else if (result.limitReached) {
        toast.info('GameZone daily limit reached. Come back tomorrow!');
        stopSession();
      }
    }, REWARD_INTERVAL_MS);
  }, [user?.id, coinsToday, onCoinsEarned, stopSession]);

  useEffect(() => () => stopSession(), [stopSession]);

  const limitReached = coinsToday >= DAILY_COIN_LIMIT;

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
          {!sessionActive && !limitReached && (
            <div className="p-4 bg-primary/5 border-b border-primary/20">
              <button
                onClick={startSession}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-black font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Gamepad2 className="w-4 h-4" />
                Start Playing — Earn Coins!
              </button>
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
              <button
                onClick={stopSession}
                className="text-xs text-muted-foreground underline"
              >
                Stop
              </button>
            </div>
          )}
          <iframe
            src={gameUrl}
            title="GameZone"
            className="w-full"
            style={{ height: '65vh', border: 'none' }}
            allow="fullscreen; autoplay"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
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
          <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground pt-2">
            <Wifi className="w-3 h-3" />
            <span>Set <code className="text-primary">GAMEZONE_URL</code> in Secrets to activate</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameZone;
