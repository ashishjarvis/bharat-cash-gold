import { useState, useEffect, useRef, useCallback } from 'react';
import { Gamepad2, Coins, Clock, AlertCircle, Star, Play, X, Volume2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { AdMob, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { toast } from 'sonner';

// ── Constants ─────────────────────────────────────────────────────────────────
const REWARD_INTERVAL_MS  = 2 * 60 * 1000; // 2 min
const COINS_PER_INTERVAL  = 2;
const DAILY_COIN_LIMIT    = 50;
const AD_COUNTDOWN_SECS   = 5;

// Official Google AdMob TEST Interstitial Unit ID (always fills, no real revenue)
const ADMOB_TEST_INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';

// ── Inline HTML5 Snake Game ───────────────────────────────────────────────────
// Self-contained — no external deps. Used when GAMEZONE_URL env var is not set.
const SNAKE_GAME_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#09090f;display:flex;flex-direction:column;align-items:center;
       justify-content:center;height:100vh;font-family:Arial,sans-serif;
       user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden}
  #hdr{color:#d4af37;font-size:15px;font-weight:bold;margin-bottom:10px;
       text-shadow:0 0 10px #d4af3780;letter-spacing:1px}
  canvas{border:2px solid #d4af3760;border-radius:10px;box-shadow:0 0 20px #d4af3730}
  #msg{color:#555;font-size:12px;margin-top:10px}
  #sub{color:#d4af37;font-size:11px;margin-top:4px;opacity:.7}
</style>
</head>
<body>
<div id="hdr">🐍 SNAKE &nbsp;·&nbsp; Score: <span id="sc">0</span></div>
<canvas id="c"></canvas>
<div id="msg">Swipe or arrow keys to move</div>
<div id="sub">+2 coins every 2 minutes of play</div>
<script>
const canvas=document.getElementById('c');
const ctx=canvas.getContext('2d');
const CELL=22;
const SZ=Math.min(Math.floor(Math.min(window.innerWidth*.92,window.innerHeight*.68)/CELL)*CELL,308);
canvas.width=SZ; canvas.height=SZ;
const COLS=SZ/CELL, ROWS=SZ/CELL;
let snake,dir,nextDir,food,score,dead;

function rnd(){return{x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)};}
function newFood(){
  let f;
  do{f=rnd();}while(snake.some(s=>s.x===f.x&&s.y===f.y));
  return f;
}
function init(){
  snake=[{x:Math.floor(COLS/2),y:Math.floor(ROWS/2)},
         {x:Math.floor(COLS/2)-1,y:Math.floor(ROWS/2)},
         {x:Math.floor(COLS/2)-2,y:Math.floor(ROWS/2)}];
  dir={x:1,y:0}; nextDir={x:1,y:0};
  food=newFood(); score=0; dead=false;
  document.getElementById('sc').textContent='0';
}
function draw(){
  ctx.fillStyle='#09090f'; ctx.fillRect(0,0,SZ,SZ);
  // grid
  ctx.strokeStyle='rgba(212,175,55,0.06)';ctx.lineWidth=1;
  for(let i=0;i<=COLS;i++){ctx.beginPath();ctx.moveTo(i*CELL,0);ctx.lineTo(i*CELL,SZ);ctx.stroke();}
  for(let i=0;i<=ROWS;i++){ctx.beginPath();ctx.moveTo(0,i*CELL);ctx.lineTo(SZ,i*CELL);ctx.stroke();}
  // food — pulsing orange coin
  const t=Date.now()/600;
  const r=CELL/2-2+Math.sin(t)*1.5;
  const gf=ctx.createRadialGradient(food.x*CELL+CELL/2,food.y*CELL+CELL/2,1,food.x*CELL+CELL/2,food.y*CELL+CELL/2,r+3);
  gf.addColorStop(0,'#ff9a3c'); gf.addColorStop(1,'#ff5500');
  ctx.fillStyle=gf;
  ctx.beginPath(); ctx.arc(food.x*CELL+CELL/2,food.y*CELL+CELL/2,r,0,Math.PI*2); ctx.fill();
  // snake
  snake.forEach((seg,i)=>{
    const ratio=i/snake.length;
    if(i===0){
      const gh=ctx.createLinearGradient(seg.x*CELL,seg.y*CELL,seg.x*CELL+CELL,seg.y*CELL+CELL);
      gh.addColorStop(0,'#ffe066'); gh.addColorStop(1,'#d4af37');
      ctx.fillStyle=gh;
    } else {
      const L=55-ratio*18; const A=80-ratio*20;
      ctx.fillStyle='hsl(45,'+A+'%,'+L+'%)';
    }
    const pad=i===0?0:1;
    const r2=i===0?4:3;
    ctx.beginPath();
    ctx.roundRect(seg.x*CELL+pad+1,seg.y*CELL+pad+1,CELL-pad*2-2,CELL-pad*2-2,r2);
    ctx.fill();
  });
  if(dead){
    ctx.fillStyle='rgba(0,0,0,.78)'; ctx.fillRect(0,0,SZ,SZ);
    ctx.textAlign='center';
    ctx.fillStyle='#d4af37'; ctx.font='bold 20px Arial';
    ctx.fillText('Game Over',SZ/2,SZ/2-18);
    ctx.fillStyle='#fff'; ctx.font='14px Arial';
    ctx.fillText('Score: '+score,SZ/2,SZ/2+8);
    ctx.fillStyle='rgba(212,175,55,.7)'; ctx.font='12px Arial';
    ctx.fillText('Tap anywhere to restart',SZ/2,SZ/2+30);
  }
}
function step(){
  if(dead)return;
  dir=nextDir;
  const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
  if(head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS||snake.some(s=>s.x===head.x&&s.y===head.y)){
    dead=true; draw(); return;
  }
  snake.unshift(head);
  if(head.x===food.x&&head.y===food.y){
    score+=10;
    document.getElementById('sc').textContent=score;
    food=newFood();
  } else { snake.pop(); }
  draw();
}
// Keyboard
document.addEventListener('keydown',e=>{
  if(dead){init();return;}
  const m={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};
  if(m[e.key]){const nd=m[e.key];if(dir.x!==-nd.x||dir.y!==-nd.y)nextDir=nd;e.preventDefault();}
});
// Touch swipe
let tx,ty;
document.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true});
document.addEventListener('touchend',e=>{
  if(dead){init();return;}
  const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;
  if(Math.abs(dx)>Math.abs(dy)){
    if(dx>18&&dir.x!==-1)nextDir={x:1,y:0};
    else if(dx<-18&&dir.x!==1)nextDir={x:-1,y:0};
  } else {
    if(dy>18&&dir.y!==-1)nextDir={x:0,y:1};
    else if(dy<-18&&dir.y!==1)nextDir={x:0,y:-1};
  }
},{passive:true});

init();
// Animate: game loop + draw loop
setInterval(step,130);
(function loop(){requestAnimationFrame(loop);if(!dead)draw();})();
</script>
</body>
</html>`;

// ── Types ─────────────────────────────────────────────────────────────────────
type AdPhase = 'idle' | 'ad_loading' | 'ad_web' | 'playing';

interface GameZoneRewardResponse {
  success: boolean;
  coinsAwarded?: number;
  totalToday?: number;
  limitReached?: boolean;
  error?: string;
}

interface GameZoneProps {
  onCoinsEarned: (amount: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

/** Create a blob URL for the inline Snake game (browser only). */
function createSnakeBlobUrl(): string {
  try {
    const blob = new Blob([SNAKE_GAME_HTML], { type: 'text/html' });
    return URL.createObjectURL(blob);
  } catch {
    // Fallback: data URI (less reliable for large payloads but always works)
    return `data:text/html;charset=utf-8,${encodeURIComponent(SNAKE_GAME_HTML)}`;
  }
}

// ── Web Pre-roll Ad Overlay (5-second countdown — non-native fallback) ────────
const WebAdOverlay = ({ onAdComplete }: { onAdComplete: () => void }) => {
  const [countdown, setCountdown] = useState(AD_COUNTDOWN_SECS);
  const [canSkip, setCanSkip]     = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        const next = prev - 1;
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

  const progress = ((AD_COUNTDOWN_SECS - countdown) / AD_COUNTDOWN_SECS) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
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

      {/* Ad creative (branded placeholder for web — native shows real AdMob) */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
        <div className="w-full max-w-sm aspect-video rounded-2xl bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex flex-col items-center justify-center gap-4 border border-white/10 relative overflow-hidden">
          {/* Shimmer sweep */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,.25) 50%, transparent 60%)',
              animation: 'shimmer 2s infinite',
              backgroundSize: '200% 100%',
            }}
          />
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

          <div className="relative z-10 flex flex-col items-center gap-3 px-4 text-center">
            <div className="w-14 h-14 rounded-full bg-yellow-400/10 border-2 border-yellow-400/40 flex items-center justify-center">
              <Volume2 className="w-7 h-7 text-yellow-400 animate-pulse" />
            </div>
            <p className="text-white font-bold text-base leading-tight">Bharat Cash Gold</p>
            <p className="text-white/50 text-xs max-w-[180px]">Play games • Earn coins • Withdraw real cash!</p>
            <div className="flex gap-2 mt-1">
              {['🎮 Play', '💰 Earn', '💸 Withdraw'].map(t => (
                <span key={t} className="text-[10px] text-yellow-400/80 border border-yellow-400/30 px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div
              className="h-1 bg-yellow-400 transition-all duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <p className="text-white/25 text-xs">
          {canSkip
            ? 'Ad complete — tap below to play!'
            : `Game starts in ${countdown}s`}
        </p>
      </div>

      {/* CTA */}
      <div className="px-4 pb-6 pt-2">
        <button
          onClick={canSkip ? onAdComplete : undefined}
          disabled={!canSkip}
          className={`w-full py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
            canSkip
              ? 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-black active:scale-95 shadow-lg shadow-yellow-400/30'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          <Play className="w-5 h-5" />
          {canSkip ? 'Play Game Now!' : `Loading…`}
        </button>
      </div>
    </div>
  );
};

// ── Main GameZone Component ───────────────────────────────────────────────────
const GameZone = ({ onCoinsEarned }: GameZoneProps) => {
  const { user } = useSimpleAuth();

  const [gameUrl, setGameUrl]           = useState<string | null>(null);
  const [inlineUrl, setInlineUrl]       = useState<string | null>(null); // blob URL for Snake
  const [configLoaded, setConfigLoaded] = useState(false);
  const [adPhase, setAdPhase]           = useState<AdPhase>('idle');
  const [coinsToday, setCoinsToday]     = useState(0);
  const [nextRewardIn, setNextRewardIn] = useState(REWARD_INTERVAL_MS / 1000);

  const sessionIdRef    = useRef<string>('');
  const rewardTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const minuteBlockRef  = useRef<number>(0);
  const adListenersRef  = useRef<Array<() => void>>([]);

  // Create blob URL for inline Snake game on mount
  useEffect(() => {
    const url = createSnakeBlobUrl();
    setInlineUrl(url);
    return () => {
      // Revoke blob URL to free memory
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => { setGameUrl(data.gamezone_url || null); setConfigLoaded(true); })
      .catch(() => setConfigLoaded(true));
  }, []);

  // Cleanup AdMob listeners
  const cleanupAdListeners = useCallback(() => {
    adListenersRef.current.forEach(remove => remove());
    adListenersRef.current = [];
  }, []);

  const stopSession = useCallback(() => {
    if (rewardTimerRef.current) clearInterval(rewardTimerRef.current);
    if (countdownRef.current)   clearInterval(countdownRef.current);
    rewardTimerRef.current = null;
    countdownRef.current   = null;
    setAdPhase('idle');
    setNextRewardIn(REWARD_INTERVAL_MS / 1000);
    minuteBlockRef.current = 0;
    cleanupAdListeners();
  }, [cleanupAdListeners]);

  const startGameSession = useCallback(() => {
    if (!user?.id || coinsToday >= DAILY_COIN_LIMIT) return;

    sessionIdRef.current    = `gz-${user.id}-${Date.now()}`;
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

  // ── Play button tapped ──────────────────────────────────────────────────────
  const handlePlayClick = useCallback(async () => {
    if (!user?.id || coinsToday >= DAILY_COIN_LIMIT) return;

    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      // ── ANDROID: Show official AdMob test interstitial ──────────────────
      setAdPhase('ad_loading');
      cleanupAdListeners();

      try {
        // Bind one-shot listeners before prepare so we don't miss events
        const rmLoaded = (await AdMob.addListener(
          InterstitialAdPluginEvents.Loaded,
          async () => {
            try {
              await AdMob.showInterstitial();
            } catch (e) {
              console.warn('[GameZone] showInterstitial error:', e);
              cleanupAdListeners();
              startGameSession();
            }
          },
        )).remove;

        const rmDismissed = (await AdMob.addListener(
          InterstitialAdPluginEvents.Dismissed,
          () => {
            cleanupAdListeners();
            startGameSession();
          },
        )).remove;

        const rmFailed = (await AdMob.addListener(
          InterstitialAdPluginEvents.FailedToLoad,
          (err: unknown) => {
            console.warn('[GameZone] Interstitial failed to load:', err);
            cleanupAdListeners();
            // Still start the game — ad failure should never block play
            startGameSession();
          },
        )).remove;

        adListenersRef.current = [rmLoaded, rmDismissed, rmFailed];

        await AdMob.prepareInterstitial({
          adId:      ADMOB_TEST_INTERSTITIAL_ID,
          isTesting: true,
        });

        // Timeout fallback — if ad doesn't load in 8s, start game anyway
        setTimeout(() => {
          if (adPhase === 'ad_loading') {
            console.warn('[GameZone] Ad load timeout — starting game directly');
            cleanupAdListeners();
            startGameSession();
          }
        }, 8000);
      } catch (err) {
        console.warn('[GameZone] AdMob interstitial error:', err);
        cleanupAdListeners();
        startGameSession(); // graceful fallback
      }
    } else {
      // ── WEB: Show branded 5-second countdown overlay ─────────────────────
      setAdPhase('ad_web');
    }
  }, [user?.id, coinsToday, adPhase, cleanupAdListeners, startGameSession]);

  useEffect(() => () => stopSession(), [stopSession]);

  const sessionActive = adPhase === 'playing';
  const limitReached  = coinsToday >= DAILY_COIN_LIMIT;

  // Effective game URL: configured URL wins; otherwise use inline Snake
  const effectiveGameUrl = gameUrl ?? inlineUrl;

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
      {/* Web pre-roll overlay (only on non-native) */}
      {adPhase === 'ad_web' && (
        <WebAdOverlay onAdComplete={startGameSession} />
      )}

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
        <div className="glass-card overflow-hidden rounded-2xl">
          {/* Status banners */}
          {!sessionActive && adPhase !== 'ad_loading' && !limitReached && (
            <div className="p-4 bg-primary/5 border-b border-primary/20">
              <button
                onClick={handlePlayClick}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-black font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Play className="w-4 h-4" />
                Play Game — Earn Coins!
              </button>
              <p className="text-center text-[10px] text-muted-foreground mt-2">
                {Capacitor.isNativePlatform()
                  ? 'A short Google ad plays before the game'
                  : 'A 5-second ad plays before the game starts'}
              </p>
            </div>
          )}

          {adPhase === 'ad_loading' && (
            <div className="p-4 bg-blue-500/10 border-b border-blue-500/30 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-xs text-blue-300">Loading ad… game starts shortly</p>
            </div>
          )}

          {limitReached && (
            <div className="p-4 bg-yellow-500/10 border-b border-yellow-500/30 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <p className="text-xs text-yellow-300">Daily coin limit reached. Come back tomorrow!</p>
            </div>
          )}

          {sessionActive && (
            <div className="p-3 bg-green-500/10 border-b border-green-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-400 font-medium">Session active — earning coins!</span>
              </div>
              <button onClick={stopSession} className="text-xs text-muted-foreground underline">
                Stop
              </button>
            </div>
          )}

          {/* Game iframe — always visible; Play button needed to earn coins */}
          {effectiveGameUrl ? (
            <iframe
              key={effectiveGameUrl}
              src={effectiveGameUrl}
              title="GameZone"
              className="w-full"
              style={{ height: '68vh', border: 'none' }}
              allow="fullscreen; autoplay"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Gamepad2 className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">Loading game…</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default GameZone;
