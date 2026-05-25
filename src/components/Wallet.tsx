// ─── WALLET — Withdrawal System (No WhatsApp redirect) ─────────────────────
// Flow: Form → server /api/withdrawals/create (atomic) → in-app success
// History: realtime Supabase subscription (Pending/Approved/Rejected)
// Locked coins: shown separately — deducted on request, released on admin action

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wallet as WalletIcon, ArrowRight, AlertCircle, CheckCircle,
  Coins, IndianRupee, Loader2, History, Clock, Lock,
} from 'lucide-react';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { supabase }      from '@/integrations/supabase/client';
import { toast }         from 'sonner';

interface WalletProps {
  totalCoins:  number;
  lockedCoins: number;
  rupeesValue: string;
  onWithdraw:  (coins: number, upiId: string, paymentMethod?: string) => Promise<boolean>;
}

interface WithdrawalRecord {
  id:           string;
  transaction_id: string | null;
  coins_amount: number;
  rupees_amount: number;
  upi_id:       string;
  status:       string;
  notes:        string | null;
  created_at:   string;
}

type PayMethod = 'upi' | 'paytm' | 'phonepe';

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending:  { label: '⏳ Pending',  cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
  approved: { label: '✅ Approved', cls: 'text-green-400 bg-green-400/10 border-green-400/30' },
  rejected: { label: '❌ Rejected', cls: 'text-red-400   bg-red-400/10   border-red-400/30' },
  processing: { label: '⏳ Pending', cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
};

export const Wallet = ({ totalCoins, lockedCoins, rupeesValue, onWithdraw }: WalletProps) => {
  const { user } = useSimpleAuth();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [upiId,          setUpiId]          = useState('');
  const [paymentMethod,  setPaymentMethod]  = useState<PayMethod>('upi');
  const [status,         setStatus]         = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMsg,       setErrorMsg]       = useState('');
  const [history,        setHistory]        = useState<WithdrawalRecord[]>([]);
  const [showHistory,    setShowHistory]    = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const coinsToWithdraw = parseInt(withdrawAmount) || 0;
  const rupeesToReceive = (coinsToWithdraw / 10).toFixed(2);
  const isValidAmount   = coinsToWithdraw >= 10 && coinsToWithdraw <= totalCoins;
  const hasMinimum      = totalCoins >= 10;
  const hasPaymentId    = upiId.trim().length > 0;
  const quickAmounts    = [10, 50, 100, 500];

  // ── Fetch withdrawal history ────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setHistoryLoading(true);
    const { data } = await supabase
      .from('withdrawals')
      .select('id, transaction_id, coins_amount, rupees_amount, upi_id, status, notes, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      setHistory(data.map((r: any) => ({
        ...r,
        coins_amount:  Number(r.coins_amount),
        rupees_amount: Number(r.rupees_amount),
      })));
    }
    setHistoryLoading(false);
  }, [user]);

  // ── Realtime subscription for withdrawal history ────────────────────────
  useEffect(() => {
    if (!user) return;
    fetchHistory();

    realtimeRef.current = supabase
      .channel(`withdrawals-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'withdrawals', filter: `user_id=eq.${user.id}`,
      }, () => fetchHistory())
      .subscribe();

    return () => {
      if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    };
  }, [user, fetchHistory]);

  // ── Handle withdrawal submission ────────────────────────────────────────
  const handleWithdraw = async () => {
    setErrorMsg('');

    if (!hasMinimum) {
      toast.error('Minimum 10 Coins (₹1) required.');
      return;
    }
    if (coinsToWithdraw < 10) {
      toast.error('Minimum withdrawal is 10 Coins.');
      return;
    }
    if (coinsToWithdraw > totalCoins) {
      toast.error('Insufficient balance.');
      return;
    }
    if (!hasPaymentId) {
      toast.error(`Please enter your ${getPaymentLabel()}.`);
      return;
    }

    setStatus('processing');

    const success = await onWithdraw(coinsToWithdraw, upiId, paymentMethod);

    if (success) {
      setStatus('success');
      setWithdrawAmount('');
      setUpiId('');
      setShowHistory(true);
      toast.success('Withdrawal request submitted! Processing within 24 hours.');
      setTimeout(() => setStatus('idle'), 6000);
    } else {
      setStatus('error');
      setErrorMsg('Withdrawal failed. You may already have a pending request, or check your balance.');
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  const getPaymentLabel = () =>
    paymentMethod === 'upi' ? 'UPI ID' : paymentMethod === 'paytm' ? 'Paytm Number' : 'PhonePe Number';

  const getPaymentPlaceholder = () =>
    paymentMethod === 'upi' ? 'yourname@upi' : '9876543210';

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      {/* ── Balance Card ─────────────────────────────────────────────────── */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-gold-dark flex items-center justify-center gold-glow">
            <WalletIcon className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-xl gold-gradient-text">My Wallet</h2>
            <p className="text-sm text-muted-foreground">Withdraw your earnings</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-4 rounded-xl bg-muted/30 border border-primary/20">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="w-4 h-4 text-primary" />
              <p className="text-xs text-muted-foreground">Available</p>
            </div>
            <p className="text-2xl font-orbitron font-bold text-primary">{totalCoins.toFixed(1)}</p>
          </div>
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/20">
            <div className="flex items-center gap-2 mb-1">
              <IndianRupee className="w-4 h-4 text-accent" />
              <p className="text-xs text-muted-foreground">Value in ₹</p>
            </div>
            <p className="text-2xl font-orbitron font-bold text-accent">₹{rupeesValue}</p>
          </div>
        </div>

        {/* Locked coins (pending withdrawal) */}
        {lockedCoins > 0 && (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <p className="text-sm text-yellow-400">
              <strong>{lockedCoins.toFixed(1)} coins</strong> locked in pending withdrawal
            </p>
          </div>
        )}

        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-sm text-primary"><strong>10 Coins = ₹1</strong> | Min withdrawal: 10 Coins</p>
        </div>

        {!hasMinimum && (
          <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
            <p className="text-sm text-destructive font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Need {(10 - totalCoins).toFixed(1)} more coins to withdraw.
            </p>
          </div>
        )}
      </div>

      {/* ── Withdrawal Form ───────────────────────────────────────────────── */}
      <div className="glass-card p-6">
        <h3 className="font-bold text-lg text-primary mb-4">Withdraw Funds</h3>

        {/* Payment method */}
        <div className="mb-4">
          <Label className="text-muted-foreground mb-2 block text-sm">Payment Method</Label>
          <div className="flex gap-2">
            {(['upi', 'paytm', 'phonepe'] as PayMethod[]).map(m => (
              <Button key={m} type="button"
                variant={paymentMethod === m ? 'default' : 'outline'}
                onClick={() => setPaymentMethod(m)}
                className={paymentMethod === m
                  ? 'flex-1 btn-gold-glow text-xs px-2'
                  : 'flex-1 border-muted text-muted-foreground hover:text-primary hover:border-primary bg-transparent text-xs px-2'}
              >
                {m === 'upi' ? 'UPI' : m === 'paytm' ? 'Paytm' : 'PhonePe'}
              </Button>
            ))}
          </div>
        </div>

        {/* Payment ID */}
        <div className="mb-4">
          <Label htmlFor="upiId" className="text-muted-foreground mb-2 block text-sm">
            Enter {getPaymentLabel()}
          </Label>
          <Input id="upiId" placeholder={getPaymentPlaceholder()} value={upiId}
            onChange={e => setUpiId(e.target.value)}
            className="bg-muted/50 border-primary/30 text-foreground placeholder:text-muted-foreground focus:border-primary" />
        </div>

        {/* Amount */}
        <div className="mb-4">
          <Label htmlFor="amount" className="text-muted-foreground mb-2 block text-sm">
            Coins to Withdraw
          </Label>
          <Input id="amount" type="number" placeholder="Minimum 10 coins"
            value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
            className="bg-muted/50 border-primary/30 text-foreground placeholder:text-muted-foreground focus:border-primary" />

          <div className="flex gap-2 mt-2">
            {quickAmounts.map(amt => (
              <button key={amt} onClick={() => setWithdrawAmount(amt.toString())}
                disabled={amt > totalCoins}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  amt <= totalCoins
                    ? 'bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30'
                    : 'bg-muted/30 text-muted-foreground cursor-not-allowed'}`}>
                {amt}
              </button>
            ))}
          </div>

          {coinsToWithdraw > 0 && (
            <p className="text-sm text-accent mt-2">
              You'll receive: <strong className="font-orbitron">₹{rupeesToReceive}</strong>
            </p>
          )}
        </div>

        {/* Status feedback */}
        {status !== 'idle' && (
          <div className={`mb-4 p-4 rounded-xl flex items-start gap-3 ${
            status === 'success'    ? 'bg-green-500/10 border border-green-500/30 text-green-400'
            : status === 'processing' ? 'bg-warning/10 border border-warning/30 text-warning'
            : 'bg-destructive/10 border border-destructive/30 text-destructive'}`}>
            {status === 'success'    ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              : status === 'processing' ? <Loader2 className="w-5 h-5 flex-shrink-0 mt-0.5 animate-spin" />
              : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
            <div>
              {status === 'success' ? (
                <>
                  <p className="font-bold">Request submitted! ✅</p>
                  <p className="text-sm mt-1 opacity-80">
                    Your withdrawal is under review. Processing within 24 hours.
                    {lockedCoins > 0 && ` ${lockedCoins.toFixed(1)} coins are locked until admin processes it.`}
                  </p>
                </>
              ) : status === 'error' ? (
                <p className="text-sm">{errorMsg || 'Withdrawal failed. Please try again.'}</p>
              ) : (
                <p className="text-sm">Submitting withdrawal request...</p>
              )}
            </div>
          </div>
        )}

        <Button onClick={handleWithdraw}
          disabled={!hasMinimum || status === 'processing' || !isValidAmount || !hasPaymentId}
          className="w-full h-14 text-lg font-bold btn-gold-glow disabled:opacity-50 disabled:cursor-not-allowed">
          {status === 'processing' ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Processing...</>
          ) : hasMinimum ? (
            <>Withdraw {coinsToWithdraw >= 10 ? `₹${rupeesToReceive}` : ''}<ArrowRight className="w-5 h-5 ml-2" /></>
          ) : (
            'Earn More Coins'
          )}
        </Button>
      </div>

      {/* ── Withdrawal History (realtime) ─────────────────────────────────── */}
      <div className="glass-card p-6">
        <button onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-lg text-primary">Withdrawal History</h3>
            {history.filter(h => h.status === 'pending').length > 0 && (
              <span className="text-xs bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded-full px-2 py-0.5">
                {history.filter(h => h.status === 'pending').length} pending
              </span>
            )}
          </div>
          <span className="text-muted-foreground">{showHistory ? '▲' : '▼'}</span>
        </button>

        {showHistory && (
          <div className="mt-4 space-y-3">
            {historyLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No withdrawals yet</p>
            ) : (
              history.map(record => {
                const st = STATUS_STYLES[record.status] || STATUS_STYLES.pending;
                return (
                  <div key={record.id}
                    className="flex items-start justify-between p-3 rounded-xl bg-muted/30 border border-muted gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">₹{record.rupees_amount.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground truncate">{record.upi_id}</p>
                      {record.transaction_id && (
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {record.transaction_id}
                        </p>
                      )}
                      {record.notes && record.status === 'rejected' && (
                        <p className="text-xs text-red-400 mt-0.5">Note: {record.notes}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`inline-block text-xs px-2 py-1 rounded-full border ${st.cls}`}>
                        {st.label}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {formatDate(record.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <p className="text-center text-[10px] text-muted-foreground pt-1">
              🔴 Realtime — updates automatically
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
