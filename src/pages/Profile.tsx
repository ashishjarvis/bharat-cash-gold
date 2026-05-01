import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LogOut, Coins, TrendingUp, Calendar, Users, Shield, FileText, Info, Code, Phone, Camera } from 'lucide-react';
import { toast } from 'sonner';

interface ProfileData {
  display_name: string | null;
  avatar_url: string | null;
  total_coins: number;
  lifetime_earnings: number;
  created_at: string;
  referral_code: string | null;
  referral_count: number;
  mobile_number: string | null;
}

const Profile = () => {
  const { user, signOut, loading } = useSimpleAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (data) setProfile(data);
      setLoadingProfile(false);
    };
    fetchProfile();
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    toast.success('Logged out successfully');
    navigate('/auth');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : prev);
      toast.success('Profile photo updated!');
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  if (loading || loadingProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const displayName = profile?.display_name || user?.display_name || 'User';
  const mobileNumber = profile?.mobile_number || user?.mobile_number || '';
  const maskedMobile = mobileNumber ? `+91 ${mobileNumber.slice(0, 2)}****${mobileNumber.slice(-4)}` : '';
  const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' }) : 'N/A';

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border p-4">
        <div className="max-w-md mx-auto flex items-center gap-4">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg bg-muted/30 text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg text-primary">My Profile</h1>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Profile Card with Avatar Upload */}
        <div className="glass-card p-6 text-center">
          <div className="relative w-24 h-24 mx-auto mb-4">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary gold-glow">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary to-gold-dark flex items-center justify-center">
                  <span className="text-3xl font-bold text-primary-foreground">{displayName.charAt(0).toUpperCase()}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center border-2 border-background shadow-lg hover:scale-110 transition-transform disabled:opacity-50"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-4 h-4 text-accent-foreground" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          <h2 className="text-xl font-bold gold-gradient-text mb-1">{displayName}</h2>
          
          {/* Validated Mobile */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30 border border-border mt-1">
            <Phone className="w-3.5 h-3.5 text-accent" />
            <span className="text-sm text-muted-foreground font-mono">{maskedMobile}</span>
            <Shield className="w-3.5 h-3.5 text-accent" />
          </div>

          {profile?.referral_code && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30">
              <span className="text-xs text-muted-foreground">Code:</span>
              <span className="font-orbitron text-sm text-primary">{profile.referral_code}</span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={<Coins className="w-5 h-5 text-primary" />} label="Balance" value={`${(profile?.total_coins || 0).toFixed(1)}`} sub="Coins" color="primary" />
          <StatCard icon={<TrendingUp className="w-5 h-5 text-accent" />} label="Lifetime" value={`${(profile?.lifetime_earnings || 0).toFixed(1)}`} sub="Coins" color="accent" />
        </div>

        {/* Referral & Member Info */}
        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-secondary" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Friends Referred</p>
            <p className="font-semibold">{profile?.referral_count || 0}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Earned</p>
            <p className="font-orbitron text-accent">{(profile?.referral_count || 0) * 5} coins</p>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Member Since</p>
            <p className="font-semibold">{memberSince}</p>
          </div>
        </div>

        {/* Value Card */}
        <div className="glass-card p-4 bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Total Value</p>
              <p className="text-xs text-muted-foreground">10 Coins = ₹1</p>
            </div>
            <p className="text-2xl font-orbitron font-bold text-accent">₹{((profile?.total_coins || 0) / 10).toFixed(2)}</p>
          </div>
        </div>

        {/* About */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Info className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-bold text-primary">About</h3>
          </div>
          <div className="space-y-3 text-sm">
            <AboutRow label="App Name" value="Bharat Cash Gold" highlight />
            <AboutRow label="Version" value="1.0.0" mono />
            <AboutRow label="Developer" value="Ashish Raj" icon={<Code className="w-4 h-4 text-accent" />} />
          </div>
        </div>

        {/* Links */}
        <div className="glass-card p-4 space-y-2">
          <Link to="/privacy-policy" className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-secondary/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-secondary" />
            </div>
            <span className="flex-1 font-medium">Privacy Policy</span>
            <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180" />
          </Link>
        </div>

        {/* Logout */}
        <Button onClick={handleLogout} variant="outline" className="w-full h-12 border-destructive/50 text-destructive hover:bg-destructive/10">
          <LogOut className="w-5 h-5 mr-2" />
          Logout
        </Button>
      </main>
    </div>
  );
};

// Sub-components
const StatCard = ({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) => (
  <div className="glass-card p-4 text-center">
    <div className={`w-10 h-10 rounded-xl bg-${color}/20 flex items-center justify-center mx-auto mb-2`}>
      {icon}
    </div>
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className={`text-xl font-orbitron font-bold text-${color}`}>{value}</p>
    <p className="text-xs text-muted-foreground">{sub}</p>
  </div>
);

const AboutRow = ({ label, value, highlight, mono, icon }: { label: string; value: string; highlight?: boolean; mono?: boolean; icon?: React.ReactNode }) => (
  <div className="flex items-center justify-between py-2 border-b border-border">
    <span className="text-muted-foreground">{label}</span>
    <div className="flex items-center gap-2">
      {icon}
      <span className={highlight ? 'font-semibold gold-gradient-text' : mono ? 'font-orbitron' : 'font-semibold text-accent'}>{value}</span>
    </div>
  </div>
);

export default Profile;
