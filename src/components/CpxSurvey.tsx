// ─── CPX SURVEY — Post-Ad Survey Integration ───────────────────────────────
// App ID: 32909 | Secret Hash: WTUge88NbM
// Shows after every rewarded ad completion.
// Reward is ONLY credited via server-side postback — never on open/click.
// Postback endpoint: POST /api/cpx/postback
// Conversion: ₹1 = 10 coins (read exact amount from postback, multiply × 10)

import { useState, useEffect, useCallback, useRef } from 'react';
import { ClipboardList, X, ExternalLink, Clock, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';

interface CpxSurveyProps {
  visible: boolean;               // controlled by parent after ad completes
  onClose: () => void;
  onRewardReceived: (coins: number) => void;
}

const CPX_APP_ID   = '32909';
const CPX_BASE_URL = 'https://offers.cpx-research.com/index.php';

// Simple hash of userId + secret (browser-safe, no md5 needed — server verifies via HMAC)
async function buildUserHash(userId: string): Promise<string> {
  const secret = 'WTUge88NbM';
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(userId);

  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig  = await crypto.subtle.sign('HMAC', key, msgData);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

type SurveyState = 'prompt' | 'loading' | 'opened' | 'waiting' | 'no_survey';

export const CpxSurvey = ({ visible, onClose, onRewardReceived }: CpxSurveyProps) => {
  const { user } = useSimpleAuth();
  const [state, setState]         = useState<SurveyState>('prompt');
  const [countdown, setCountdown] = useState(0);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionId = useRef<string>(crypto.randomUUID());

  // Clear all timers on unmount
  useEffect(() => () => {
    if (timerRef.current)  clearInterval(timerRef.current);
    if (pollRef.current)   clearInterval(pollRef.current);
  }, []);

  // Reset state when shown
  useEffect(() => {
    if (visible) {
      setState('prompt');
      setCountdown(0);
      sessionId.current = crypto.randomUUID();
    }
  }, [visible]);

  // Poll server for reward receipt after survey opened
  const startPolling = useCallback(() => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/cpx/reward-status?sessionId=${sessionId.current}&userId=${user?.id}`);
        const data = await res.json();
        if (data.rewarded) {
          clearInterval(pollRef.current!);
          onRewardReceived(data.coins);
          onClose();
        }
      } catch {}
      // Stop polling after 5 minutes
      if (attempts > 60) clearInterval(pollRef.current!);
    }, 5_000); // check every 5 seconds
  }, [user?.id, onRewardReceived, onClose]);

  const handleOpenSurvey = useCallback(async () => {
    if (!user) return;
    setState('loading');

    try {
      const hash = await buildUserHash(user.id);
      const params = new URLSearchParams({
        app_id:      CPX_APP_ID,
        ext_user_id: user.id,
        username:    user.display_name || 'User',
        hash,
        subid_1:     sessionId.current, // used by server postback for matching
      });

      const surveyUrl = `${CPX_BASE_URL}?${params.toString()}`;

      window.open(surveyUrl, '_blank');
      setState('waiting');

      // Start 2-minute countdown
      let secs = 120;
      setCountdown(secs);
      timerRef.current = setInterval(() => {
        secs--;
        setCountdown(secs);
        if (secs <= 0) {
          clearInterval(timerRef.current!);
          setState('no_survey');
        }
      }, 1_000);

      // Start polling for server-side reward confirmation
      startPolling();

    } catch {
      setState('no_survey');
    }
  }, [user, startPolling]);

  const handleSkip = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current)  clearInterval(pollRef.current);
    onClose();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-background border border-primary/30 p-5 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Bonus Survey!</h3>
              <p className="text-xs text-muted-foreground">Earn 50–500 extra coins</p>
            </div>
          </div>
          <button onClick={handleSkip} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* States */}
        {state === 'prompt' && (
          <>
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 mb-4">
              <p className="text-sm text-foreground font-medium mb-1">
                🎉 You get a survey! Fill it and get <strong>50 to 500 coins!</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Coins are credited automatically after successful survey completion. Conversion: ₹1 = 10 coins.
              </p>
            </div>
            <Button onClick={handleOpenSurvey} className="w-full h-12 font-bold bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:opacity-90">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Survey
            </Button>
            <button onClick={handleSkip} className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground py-2 transition-colors">
              Skip for now
            </button>
          </>
        )}

        {state === 'loading' && (
          <div className="text-center py-6">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Opening survey...</p>
          </div>
        )}

        {state === 'waiting' && (
          <>
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-blue-400 animate-pulse" />
                <p className="text-sm font-medium text-blue-400">Survey opened — waiting for completion...</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Complete the survey in the browser tab that just opened. Your coins will be credited automatically.
              </p>
              <div className="mt-2 text-center">
                <span className="font-orbitron text-blue-400 text-sm">
                  {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                </span>
                <span className="text-xs text-muted-foreground ml-1">remaining</span>
              </div>
            </div>
            <Button onClick={handleOpenSurvey} variant="outline" className="w-full border-blue-500/30 text-blue-400 mb-2">
              <ExternalLink className="w-4 h-4 mr-2" />
              Reopen Survey Tab
            </Button>
            <button onClick={handleSkip} className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors">
              Done / Close
            </button>
          </>
        )}

        {state === 'no_survey' && (
          <>
            <div className="p-4 rounded-xl bg-muted/30 border border-muted mb-4 text-center">
              <p className="text-sm text-muted-foreground font-medium mb-1">
                Finding high-paying surveys...
              </p>
              <p className="text-xs text-muted-foreground">
                Check back in 2 minutes! New surveys arrive regularly.
              </p>
            </div>
            <Button onClick={handleSkip} className="w-full btn-gold-glow">
              <CheckCircle className="w-4 h-4 mr-2" />
              OK, Got It
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
