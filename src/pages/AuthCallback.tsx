// ─── AUTH CALLBACK — Handles Supabase OAuth redirect ───────────────────────
// Loaded at /auth/callback after Google Sign-In redirect.
// Bridges the Supabase Auth session → custom profiles table → localStorage session.
// If the user has no profile, one is created automatically.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

type State = 'loading' | 'success' | 'error';

const AuthCallback = () => {
  const navigate  = useNavigate();
  const [state, setState]   = useState<State>('loading');
  const [message, setMessage] = useState('Verifying your account...');

  useEffect(() => {
    let cancelled = false;

    const handleCallback = async () => {
      try {
        // Supabase automatically parses the access_token/code from the URL
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session?.user) {
          // Try to exchange code manually (PKCE flow)
          const url = new URL(window.location.href);
          const code = url.searchParams.get('code');

          if (code) {
            const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeErr || !data.session?.user) {
              throw new Error(exchangeErr?.message || 'Failed to verify login');
            }
            // Use exchanged session
            await processUser(data.session.user, cancelled);
            return;
          }

          throw new Error(error?.message || 'No session found after login');
        }

        await processUser(session.user, cancelled);

      } catch (err: unknown) {
        if (cancelled) return;
        console.error('[AuthCallback] Error:', err);
        setState('error');
        setMessage(err instanceof Error ? err.message : 'Login failed. Please try again.');
        setTimeout(() => navigate('/auth'), 3000);
      }
    };

    const processUser = async (
      supabaseUser: { id: string; email?: string; user_metadata?: Record<string, string> },
      isCancelled: boolean
    ) => {
      if (isCancelled) return;

      const email = supabaseUser.email || '';
      const displayName =
        supabaseUser.user_metadata?.full_name ||
        supabaseUser.user_metadata?.name ||
        email.split('@')[0] ||
        'User';

      setMessage('Setting up your profile...');

      // Look up existing profile by email
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      let profileId: string;

      if (existingProfile?.id) {
        profileId = existingProfile.id;
      } else {
        // Create a new profile for this Google user
        const newId = crypto.randomUUID();
        const { error: insertErr } = await supabase
          .from('profiles')
          .insert({
            id: newId,
            email,
            display_name: displayName,
            total_coins: 0,
            lifetime_earnings: 0,
            // No mobile_number or password_hash for OAuth users
          });

        if (insertErr) {
          console.error('[AuthCallback] Profile creation error:', insertErr);
          // Profile might already exist with a different unique constraint — try fetching again
          const { data: retryProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

          if (!retryProfile?.id) throw new Error('Failed to create profile');
          profileId = retryProfile.id;
        } else {
          profileId = newId;
        }
      }

      if (isCancelled) return;

      // Set the custom session (same as mobile+password flow)
      localStorage.setItem('bharat_cash_user_id', profileId);
      setState('success');
      setMessage(`Welcome, ${displayName}!`);

      setTimeout(() => {
        if (!isCancelled) navigate('/');
      }, 1200);
    };

    handleCallback();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        {state === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <p className="text-foreground font-medium">{message}</p>
            <p className="text-muted-foreground text-sm mt-2">Please wait...</p>
          </>
        )}
        {state === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <p className="text-foreground font-bold text-lg">{message}</p>
            <p className="text-muted-foreground text-sm mt-2">Redirecting to dashboard...</p>
          </>
        )}
        {state === 'error' && (
          <>
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-foreground font-bold">Login Failed</p>
            <p className="text-muted-foreground text-sm mt-2">{message}</p>
            <p className="text-xs text-muted-foreground mt-1">Redirecting to login...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
