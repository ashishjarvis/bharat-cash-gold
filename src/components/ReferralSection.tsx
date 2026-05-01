import { useState, useEffect } from 'react';
import { Users, Copy, CheckCircle, Gift, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { toast } from 'sonner';

interface ReferralSectionProps {
  onReward: (coins: number) => void;
}

export const ReferralSection = ({ onReward }: ReferralSectionProps) => {
  const { user } = useSimpleAuth();
  const [referralCode, setReferralCode] = useState('');
  const [referralCount, setReferralCount] = useState(0);
  const [earnedFromReferrals, setEarnedFromReferrals] = useState(0);
  const [inputCode, setInputCode] = useState('');
  const [hasUsedCode, setHasUsedCode] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchReferralData = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('referral_code, referral_count, referred_by')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setReferralCode(data.referral_code || '');
        setReferralCount(data.referral_count || 0);
        setHasUsedCode(!!data.referred_by);
        setEarnedFromReferrals((data.referral_count || 0) * 5); // 5 coins per successful referral
      }
    };
    
    fetchReferralData();
  }, [user]);

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    toast.success('Referral code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareCode = async () => {
    const shareText = `🎁 Join Bharat Cash Money and earn real money!\n\nUse my referral code: ${referralCode}\n\nDownload now and start earning! 💰`;
    const shareUrl = `https://goldrush-earn-app.lovable.app/?ref=${referralCode}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Bharat Cash Money - Earn Real Money!',
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or share failed, fallback to WhatsApp
        const waText = encodeURIComponent(shareText + '\n' + shareUrl);
        window.open(`https://wa.me/?text=${waText}`, '_blank');
      }
    } else {
      // Fallback: open WhatsApp directly
      const waText = encodeURIComponent(shareText + '\n' + shareUrl);
      window.open(`https://wa.me/?text=${waText}`, '_blank');
    }
  };

  const applyReferralCode = async () => {
    if (!user || !inputCode.trim() || hasUsedCode) return;
    
    // Check if code exists and is not own code
    const { data: referrerProfile } = await supabase
      .from('profiles')
      .select('id, referral_code')
      .eq('referral_code', inputCode.toUpperCase())
      .single();
    
    if (!referrerProfile) {
      toast.error('Invalid referral code');
      return;
    }
    
    if (referrerProfile.id === user.id) {
      toast.error("You can't use your own code!");
      return;
    }
    
    // Save the referral relationship
    const { error: referralError } = await supabase
      .from('referrals')
      .insert({
        referrer_id: referrerProfile.id,
        referred_id: user.id,
        referral_code: inputCode.toUpperCase(),
      });
    
    if (referralError) {
      toast.error('Failed to apply referral code');
      return;
    }
    
    // Update current user's referred_by
    await supabase
      .from('profiles')
      .update({ referred_by: referrerProfile.id })
      .eq('id', user.id);
    
    setHasUsedCode(true);
    toast.success('Referral code applied! Your friend will be rewarded after your first withdrawal.');
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-secondary to-neon-cyan flex items-center justify-center">
          <Users className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h3 className="font-bold text-lg text-primary">Referral Program</h3>
          <p className="text-muted-foreground text-sm">Earn 5 coins per friend!</p>
        </div>
      </div>

      {/* Your Referral Code */}
      <div className="mb-6">
        <label className="text-sm text-muted-foreground mb-2 block">Your Referral Code</label>
        <div className="flex gap-2">
          <div className="flex-1 p-3 rounded-lg bg-muted/50 border border-primary/30 font-orbitron text-lg text-center text-primary">
            {referralCode || 'Loading...'}
          </div>
          <Button
            onClick={copyCode}
            variant="outline"
            className="border-primary/30 text-primary hover:bg-primary/10"
          >
            {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
          </Button>
          <Button
            onClick={shareCode}
            className="btn-gold-glow"
          >
            <Share2 className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-muted/30 border border-muted text-center">
          <p className="text-2xl font-orbitron font-bold text-secondary">{referralCount}</p>
          <p className="text-xs text-muted-foreground">Friends Invited</p>
        </div>
        <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 text-center">
          <p className="text-2xl font-orbitron font-bold text-accent">{earnedFromReferrals}</p>
          <p className="text-xs text-muted-foreground">Coins Earned</p>
        </div>
      </div>

      {/* Enter Friend's Code */}
      {!hasUsedCode && (
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-5 h-5 text-primary" />
            <p className="font-medium text-primary">Have a friend's code?</p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Enter referral code"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              className="bg-muted/50 border-primary/30 text-foreground uppercase"
            />
            <Button
              onClick={applyReferralCode}
              disabled={!inputCode.trim()}
              className="btn-gold-glow"
            >
              Apply
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Your friend gets 5 coins after your first withdrawal!
          </p>
        </div>
      )}

      {hasUsedCode && (
        <div className="p-3 rounded-lg bg-accent/10 border border-accent/30 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-accent" />
          <span className="text-sm text-accent">Referral code already applied!</span>
        </div>
      )}
    </div>
  );
};
