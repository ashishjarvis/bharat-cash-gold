import { useState, useEffect } from 'react';
import { Wallet as WalletIcon, ArrowRight, AlertCircle, CheckCircle, Coins, IndianRupee, Loader2, History, Clock, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { supabase } from '@/integrations/supabase/client';

interface WalletProps {
  totalCoins: number;
  rupeesValue: string;
  onWithdraw: (coins: number, upiId: string) => Promise<boolean>;
}

interface WithdrawalRecord {
  id: string;
  coins_amount: number;
  rupees_amount: number;
  upi_id: string;
  status: string;
  created_at: string;
}

// Admin WhatsApp number for receiving withdrawal requests
const ADMIN_PHONE = '919507124965';

// Generate secure transaction hash
const generateSecureHash = (userId: string, amount: number, timestamp: number): string => {
  const data = `${userId}-${amount}-${timestamp}-bharatcash-secure`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
};

// Generate unique transaction ID
const generateTransactionId = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BC${timestamp}${random}`;
};

export const Wallet = ({ totalCoins, rupeesValue, onWithdraw }: WalletProps) => {
  const { user } = useSimpleAuth();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'paytm' | 'phonepe'>('upi');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const coinsToWithdraw = parseInt(withdrawAmount) || 0;
  const rupeesToReceive = (coinsToWithdraw / 10).toFixed(2);
  
  // Validation
  const hasMinimumCoins = totalCoins >= 10;
  const isValidAmount = coinsToWithdraw >= 10 && coinsToWithdraw <= totalCoins;
  const hasPaymentId = upiId.trim().length > 0;

  // Fetch withdrawal history
  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (data) {
        setWithdrawalHistory(data);
      }
    };
    
    fetchHistory();
  }, [user, status]);

  const handleWithdraw = async () => {
    // Check minimum balance
    if (totalCoins < 10) {
      setStatus('error');
      setMessage('Minimum 10 Coins (₹1) required.');
      setTimeout(() => setStatus('idle'), 4000);
      return;
    }

    // Check withdrawal amount
    if (coinsToWithdraw < 10) {
      setStatus('error');
      setMessage('Minimum withdrawal is 10 Coins (₹1).');
      setTimeout(() => setStatus('idle'), 4000);
      return;
    }

    if (coinsToWithdraw > totalCoins) {
      setStatus('error');
      setMessage('Insufficient balance.');
      setTimeout(() => setStatus('idle'), 4000);
      return;
    }

    if (!hasPaymentId) {
      setStatus('error');
      setMessage(`Please enter your ${paymentMethod === 'upi' ? 'UPI ID' : paymentMethod === 'paytm' ? 'Paytm Number' : 'PhonePe Number'}.`);
      setTimeout(() => setStatus('idle'), 4000);
      return;
    }

    setStatus('processing');
    setMessage('Processing your withdrawal...');

    const success = await onWithdraw(coinsToWithdraw, upiId);
    
    if (success) {
      setStatus('success');
      
      // Get current time in IST
      const now = new Date();
      const timestamp = now.getTime();
      const istTime = now.toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      // Generate secure transaction ID and hash
      const transactionId = generateTransactionId();
      const secureHash = generateSecureHash(user?.id || '', coinsToWithdraw, timestamp);

      // Generate WhatsApp message for admin with all security details
      const userName = user?.display_name || 'User';
      const userMobile = user?.mobile_number || 'N/A';
      const whatsappMessage = encodeURIComponent(
        `💰 *BHARAT CASH - WITHDRAWAL REQUEST*\n\n` +
        `🔐 *Transaction ID:* ${transactionId}\n` +
        `🛡️ *Secure Hash:* ${secureHash}\n\n` +
        `👤 *User Name:* ${userName}\n` +
        `📱 *Registered Mobile:* ${userMobile}\n` +
        `💳 *Payment Method:* ${paymentMethod.toUpperCase()}\n` +
        `🏦 *${paymentMethod === 'upi' ? 'UPI ID' : paymentMethod === 'paytm' ? 'Paytm Number' : 'PhonePe Number'}:* ${upiId}\n` +
        `🪙 *Coins:* ${coinsToWithdraw}\n` +
        `₹ *Amount:* ₹${rupeesToReceive}\n` +
        `🕐 *Time (IST):* ${istTime}\n\n` +
        `✅ *VERIFY:* Mobile number must match user's registered mobile.`
      );
      
      // Open WhatsApp with admin notification
      window.open(`https://wa.me/${ADMIN_PHONE}?text=${whatsappMessage}`, '_blank');
      
      setWithdrawAmount('');
      setUpiId('');
    } else {
      setStatus('error');
      setMessage('Withdrawal failed. Please try again.');
    }

    setTimeout(() => setStatus('idle'), 8000);
  };

  const quickAmounts = [10, 50, 100, 500];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-accent bg-accent/10 border-accent/30';
      case 'processing': return 'text-warning bg-warning/10 border-warning/30';
      case 'rejected': return 'text-destructive bg-destructive/10 border-destructive/30';
      default: return 'text-muted-foreground bg-muted/10 border-muted/30';
    }
  };

  const getPaymentPlaceholder = () => {
    switch (paymentMethod) {
      case 'upi': return 'yourname@upi';
      case 'paytm': return '9876543210';
      case 'phonepe': return '9876543210';
    }
  };

  const getPaymentLabel = () => {
    switch (paymentMethod) {
      case 'upi': return 'UPI ID';
      case 'paytm': return 'Paytm Number';
      case 'phonepe': return 'PhonePe Number';
    }
  };

  return (
    <div className="space-y-4">
      {/* Balance Card */}
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

        {/* Balance Display */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-muted/30 border border-primary/20">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="w-4 h-4 text-primary" />
              <p className="text-xs text-muted-foreground">Total Coins</p>
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

        {/* Conversion info */}
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center gap-2 mb-6">
          <AlertCircle className="w-5 h-5 text-primary flex-shrink-0" />
          <p className="text-sm text-primary">
            <strong>10 Coins = ₹1</strong> | Min withdrawal: 10 Coins
          </p>
        </div>

        {/* Minimum balance warning */}
        {!hasMinimumCoins && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <p className="text-sm text-destructive font-medium">
                Minimum 10 Coins (₹1) required to withdraw.
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              You need {(10 - totalCoins).toFixed(1)} more coins to withdraw.
            </p>
          </div>
        )}
      </div>

      {/* Withdrawal Form */}
      <div className="glass-card p-6">
        <h3 className="font-bold text-lg text-primary mb-4">Withdraw Funds</h3>

        {/* Payment method */}
        <div className="mb-4">
          <Label className="text-muted-foreground mb-2 block text-sm">Payment Method</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={paymentMethod === 'upi' ? 'default' : 'outline'}
              onClick={() => setPaymentMethod('upi')}
              className={paymentMethod === 'upi' 
                ? 'flex-1 btn-gold-glow text-xs px-2' 
                : 'flex-1 border-muted text-muted-foreground hover:text-primary hover:border-primary bg-transparent text-xs px-2'
              }
            >
              UPI
            </Button>
            <Button
              type="button"
              variant={paymentMethod === 'paytm' ? 'default' : 'outline'}
              onClick={() => setPaymentMethod('paytm')}
              className={paymentMethod === 'paytm' 
                ? 'flex-1 btn-gold-glow text-xs px-2' 
                : 'flex-1 border-muted text-muted-foreground hover:text-primary hover:border-primary bg-transparent text-xs px-2'
              }
            >
              Paytm
            </Button>
            <Button
              type="button"
              variant={paymentMethod === 'phonepe' ? 'default' : 'outline'}
              onClick={() => setPaymentMethod('phonepe')}
              className={paymentMethod === 'phonepe' 
                ? 'flex-1 btn-gold-glow text-xs px-2' 
                : 'flex-1 border-muted text-muted-foreground hover:text-primary hover:border-primary bg-transparent text-xs px-2'
              }
            >
              PhonePe
            </Button>
          </div>
        </div>

        {/* UPI/Paytm/PhonePe ID */}
        <div className="mb-4">
          <Label htmlFor="upiId" className="text-muted-foreground mb-2 block text-sm">
            Enter {getPaymentLabel()}
          </Label>
          <Input
            id="upiId"
            placeholder={getPaymentPlaceholder()}
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            className="bg-muted/50 border-primary/30 text-foreground placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        {/* Amount */}
        <div className="mb-4">
          <Label htmlFor="amount" className="text-muted-foreground mb-2 block text-sm">
            Amount of Coins to Withdraw
          </Label>
          <Input
            id="amount"
            type="number"
            placeholder="Enter coins (minimum 10)"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="bg-muted/50 border-primary/30 text-foreground placeholder:text-muted-foreground focus:border-primary"
          />
          
          {/* Quick amounts */}
          <div className="flex gap-2 mt-2">
            {quickAmounts.map(amount => (
              <button
                key={amount}
                onClick={() => setWithdrawAmount(amount.toString())}
                disabled={amount > totalCoins}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  amount <= totalCoins
                    ? 'bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30'
                    : 'bg-muted/30 text-muted-foreground cursor-not-allowed'
                }`}
              >
                {amount}
              </button>
            ))}
          </div>

          {coinsToWithdraw > 0 && (
            <p className="text-sm text-accent mt-3">
              You'll receive: <strong className="font-orbitron">₹{rupeesToReceive}</strong>
            </p>
          )}
        </div>

        {/* Status message */}
        {status !== 'idle' && (
          <div className={`mb-4 p-4 rounded-xl flex items-start gap-3 ${
            status === 'success' 
              ? 'bg-warning/20 border-2 border-warning text-warning' 
              : status === 'processing'
              ? 'bg-warning/10 border border-warning/30 text-warning'
              : 'bg-destructive/10 border border-destructive/30 text-destructive'
          }`}>
            {status === 'success' ? (
              <Rocket className="w-6 h-6 flex-shrink-0 mt-0.5 text-warning" />
            ) : status === 'processing' ? (
              <Loader2 className="w-5 h-5 flex-shrink-0 mt-0.5 animate-spin" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            )}
            <div>
              {status === 'success' ? (
                <p className="text-base font-bold text-warning">
                  Request Sent! 🚀 Your payment will be processed within 24 hours.
                </p>
              ) : (
                <p className="text-sm">{message}</p>
              )}
            </div>
          </div>
        )}

        {/* Withdraw button */}
        <Button
          onClick={handleWithdraw}
          disabled={!hasMinimumCoins || status === 'processing'}
          className="w-full h-14 text-lg font-bold btn-gold-glow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'processing' ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Processing...
            </>
          ) : hasMinimumCoins ? (
            <>
              Withdraw {coinsToWithdraw >= 10 ? `₹${rupeesToReceive}` : ''}
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          ) : (
            'Earn More Coins'
          )}
        </Button>
      </div>

      {/* Withdrawal History */}
      <div className="glass-card p-6">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-lg text-primary">Withdrawal History</h3>
          </div>
          <span className="text-muted-foreground">{showHistory ? '▲' : '▼'}</span>
        </button>

        {showHistory && (
          <div className="mt-4 space-y-3">
            {withdrawalHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No withdrawals yet</p>
            ) : (
              withdrawalHistory.map((record) => (
                <div 
                  key={record.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-muted"
                >
                  <div>
                    <p className="font-medium text-foreground">₹{record.rupees_amount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{record.upi_id}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(record.status || 'processing')}`}>
                      {record.status === 'processing' ? '⏳ Pending' : 
                       record.status === 'completed' ? '✓ Completed' : 
                       record.status === 'rejected' ? '✗ Rejected' : record.status}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {formatDate(record.created_at || '')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
