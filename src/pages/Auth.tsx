import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSimpleAuth } from '@/contexts/SimpleAuthContext';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Shield, Zap, User, Phone, Lock, Eye, EyeOff, Loader2, Coins } from 'lucide-react';
import { toast }   from '@/hooks/use-toast';
import LoadingScreen from '@/components/LoadingScreen';
import appLogo from '@/assets/logo.png';

const Auth = () => {
  const { user, loading, signUp, signIn, signInWithGoogle } = useSimpleAuth();
  const navigate = useNavigate();

  const [isLogin,       setIsLogin]       = useState(true);
  const [name,          setName]          = useState('');
  const [mobile,        setMobile]        = useState('');
  const [password,      setPassword]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate('/');
  }, [user, loading, navigate]);

  const validateMobile = (num: string) => /^[6-9]\d{9}$/.test(num);

  const handleSubmit = async () => {
    if (!isLogin && !name.trim()) {
      toast({ title: "Error", description: "Please enter your name", variant: "destructive" });
      return;
    }
    if (!validateMobile(mobile)) {
      toast({ title: "Error", description: "Please enter a valid 10-digit mobile number", variant: "destructive" });
      return;
    }
    if (password.length < 4) {
      toast({ title: "Error", description: "Password must be at least 4 characters", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        const { error } = await signIn(mobile, password);
        if (error) toast({ title: "Login Failed", description: error, variant: "destructive" });
        else toast({ title: "Welcome Back!", description: "You have logged in successfully" });
      } else {
        const { error } = await signUp(name.trim(), mobile, password);
        if (error) toast({ title: "Sign Up Failed", description: error, variant: "destructive" });
        else toast({ title: "Account Created!", description: "Start earning coins now!" });
      }
    } catch (err) {
      console.error('Auth error:', err);
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast({ title: "Google Sign-In Failed", description: error, variant: "destructive" });
        setGoogleLoading(false);
      }
      // On success, browser redirects — googleLoading stays true (page navigates away)
    } catch {
      toast({ title: "Error", description: "Google Sign-In unavailable. Please use mobile login.", variant: "destructive" });
      setGoogleLoading(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Logo & Branding */}
      <div className="text-center mb-8">
        <img src={appLogo} alt="Bharat Cash Gold" className="w-24 h-24 rounded-2xl mx-auto mb-4 gold-glow" />
        <h1 className="text-3xl font-orbitron font-bold gold-gradient-text mb-2">
          Bharat Cash Gold
        </h1>
        <p className="text-muted-foreground text-sm">
          India's #1 Money Earning App
        </p>
      </div>

      {/* Auth Form */}
      <div className="w-full max-w-sm glass-card p-6 space-y-4">
        <h2 className="text-xl font-bold text-center text-primary mb-4">
          {isLogin ? 'Login' : 'Sign Up'}
        </h2>

        {/* ── Google Sign-In Button ─────────────────────────── */}
        <Button
          onClick={handleGoogleSignIn}
          disabled={googleLoading || isSubmitting}
          variant="outline"
          className="w-full h-12 flex items-center gap-3 border-muted hover:border-primary/50 bg-muted/30 hover:bg-muted/50 text-foreground font-medium"
        >
          {googleLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          <span>{googleLoading ? 'Redirecting...' : 'Continue with Google'}</span>
        </Button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-muted" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or use mobile number</span>
          </div>
        </div>

        {/* ── Mobile + Password Fields ──────────────────────── */}
        {!isLogin && (
          <div className="space-y-2">
            <Label htmlFor="name" className="text-muted-foreground flex items-center gap-2">
              <User className="w-4 h-4" /> Full Name
            </Label>
            <Input id="name" placeholder="Enter your name" value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-muted/50 border-primary/30 text-foreground placeholder:text-muted-foreground focus:border-primary" />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="mobile" className="text-muted-foreground flex items-center gap-2">
            <Phone className="w-4 h-4" /> Mobile Number
          </Label>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-primary/30 bg-muted/30 text-muted-foreground text-sm">+91</span>
            <Input id="mobile" type="tel" placeholder="9876543210" value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="rounded-l-none bg-muted/50 border-primary/30 text-foreground placeholder:text-muted-foreground focus:border-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-muted-foreground flex items-center gap-2">
            <Lock className="w-4 h-4" /> Password
          </Label>
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="bg-muted/50 border-primary/30 text-foreground placeholder:text-muted-foreground focus:border-primary pr-10" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={isSubmitting || googleLoading}
          className="w-full h-12 text-lg font-bold btn-gold-glow mt-4">
          {isSubmitting
            ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Please wait...</>
            : isLogin ? 'Login' : 'Sign Up'}
        </Button>

        <p className="text-center text-sm text-muted-foreground mt-4">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => { setIsLogin(!isLogin); setName(''); setMobile(''); setPassword(''); }}
            className="text-primary font-semibold hover:underline">
            {isLogin ? 'Sign Up' : 'Login'}
          </button>
        </p>
      </div>

      {/* Features */}
      <div className="w-full max-w-sm space-y-3 mt-8">
        <div className="glass-card p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center"><Zap className="w-4 h-4 text-accent" /></div>
          <div><h3 className="font-semibold text-xs">Earn Coins Daily</h3><p className="text-[10px] text-muted-foreground">Watch ads & complete tasks</p></div>
        </div>
        <div className="glass-card p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-secondary/20 flex items-center justify-center"><Coins className="w-4 h-4 text-secondary" /></div>
          <div><h3 className="font-semibold text-xs">Convert to ₹</h3><p className="text-[10px] text-muted-foreground">10 Coins = ₹1</p></div>
        </div>
        <div className="glass-card p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center"><Shield className="w-4 h-4 text-primary" /></div>
          <div><h3 className="font-semibold text-xs">Secure & Verified</h3><p className="text-[10px] text-muted-foreground">Trusted by thousands</p></div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-6 text-center max-w-sm">
        By continuing, you agree to our{' '}
        <Link to="/privacy-policy" className="text-primary underline hover:text-primary/80">Privacy Policy</Link>
      </p>
    </div>
  );
};

export default Auth;
