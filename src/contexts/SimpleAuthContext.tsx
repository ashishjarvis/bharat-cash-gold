import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UserProfile {
  id: string;
  display_name: string;
  mobile_number: string;
  total_coins: number;
  lifetime_earnings: number;
}

interface SimpleAuthContextType {
  user: UserProfile | null;
  loading: boolean;
  signUp: (name: string, mobile: string, password: string) => Promise<{ error: string | null }>;
  signIn: (mobile: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => void;
}

const SimpleAuthContext = createContext<SimpleAuthContextType | undefined>(undefined);


export const SimpleAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser]       = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Restore session on mount ─────────────────────────────
  useEffect(() => {
    const storedUserId = localStorage.getItem('bharat_cash_user_id');

    if (storedUserId) {
      supabase
        .from('profiles')
        .select('id, display_name, mobile_number, total_coins, lifetime_earnings')
        .eq('id', storedUserId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setUser({
              id: data.id,
              display_name: data.display_name || 'User',
              mobile_number: data.mobile_number || '',
              total_coins: Number(data.total_coins) || 0,
              lifetime_earnings: Number(data.lifetime_earnings) || 0,
            });
          } else {
            localStorage.removeItem('bharat_cash_user_id');
          }
          setLoading(false);
        });
    } else {
      // Also check if a Supabase OAuth session exists (e.g. after redirect)
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session?.user?.email) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, display_name, mobile_number, total_coins, lifetime_earnings')
            .eq('email', session.user.email)
            .maybeSingle();

          if (profile) {
            localStorage.setItem('bharat_cash_user_id', profile.id);
            setUser({
              id: profile.id,
              display_name: profile.display_name || 'User',
              mobile_number: profile.mobile_number || '',
              total_coins: Number(profile.total_coins) || 0,
              lifetime_earnings: Number(profile.lifetime_earnings) || 0,
            });
          }
        }
        setLoading(false);
      });
    }
  }, []);

  // ── Sign Up (mobile + password) — hashing done server-side via bcrypt ──
  const signUp = async (name: string, mobile: string, password: string): Promise<{ error: string | null }> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mobile, password }),
      });
      const data = await res.json();

      if (!res.ok) return { error: data.error || 'Failed to create account. Please try again.' };

      localStorage.setItem('bharat_cash_user_id', data.userId);
      setUser({
        id: data.userId,
        display_name: data.displayName,
        mobile_number: data.mobileNumber,
        total_coins: 0,
        lifetime_earnings: 0,
      });
      return { error: null };

    } catch (err) {
      console.error('Signup error:', err);
      return { error: 'An unexpected error occurred.' };
    }
  };

  // ── Sign In (mobile + password) — verified server-side via bcrypt ───────
  const signIn = async (mobile: string, password: string): Promise<{ error: string | null }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, password }),
      });
      const data = await res.json();

      if (!res.ok) return { error: data.error || 'An unexpected error occurred.' };

      localStorage.setItem('bharat_cash_user_id', data.userId);
      setUser({
        id: data.userId,
        display_name: data.displayName || 'User',
        mobile_number: data.mobileNumber || '',
        total_coins: data.totalCoins || 0,
        lifetime_earnings: data.lifetimeEarnings || 0,
      });
      return { error: null };

    } catch (err) {
      console.error('Login error:', err);
      return { error: 'An unexpected error occurred.' };
    }
  };

  // ── Google Sign-In (Supabase OAuth) ──────────────────────
  // Opens Google OAuth in the browser. On redirect, /auth/callback
  // bridges the Supabase session → our custom profiles table.
  const signInWithGoogle = async (): Promise<{ error: string | null }> => {
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('[GoogleAuth] OAuth error:', error.message);
        return { error: 'Google Sign-In failed. Please try mobile login.' };
      }

      // OAuth redirects the page — this line is never reached
      return { error: null };

    } catch (err) {
      console.error('[GoogleAuth] Unexpected error:', err);
      return { error: 'Google Sign-In is not available right now. Please use mobile login.' };
    }
  };

  // ── Sign Out ──────────────────────────────────────────────
  const signOut = () => {
    localStorage.removeItem('bharat_cash_user_id');
    supabase.auth.signOut().catch(() => {}); // also clear Supabase OAuth session if present
    setUser(null);
  };

  return (
    <SimpleAuthContext.Provider value={{ user, loading, signUp, signIn, signInWithGoogle, signOut }}>
      {children}
    </SimpleAuthContext.Provider>
  );
};

export const useSimpleAuth = () => {
  const context = useContext(SimpleAuthContext);
  if (context === undefined) throw new Error('useSimpleAuth must be used within a SimpleAuthProvider');
  return context;
};
