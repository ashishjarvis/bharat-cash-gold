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

const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'bharat_cash_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

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

  // ── Sign Up (mobile + password) ──────────────────────────
  const signUp = async (name: string, mobile: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('mobile_number', mobile)
        .maybeSingle();

      if (existing) return { error: 'Mobile number already registered. Please login.' };

      const passwordHash = await hashPassword(password);
      const id = crypto.randomUUID();

      const { error } = await supabase.from('profiles').insert({
        id, display_name: name, mobile_number: mobile, password_hash: passwordHash,
        total_coins: 0, lifetime_earnings: 0,
      });

      if (error) {
        console.error('Signup error:', error);
        return { error: 'Failed to create account. Please try again.' };
      }

      localStorage.setItem('bharat_cash_user_id', id);
      setUser({ id, display_name: name, mobile_number: mobile, total_coins: 0, lifetime_earnings: 0 });
      return { error: null };

    } catch (err) {
      console.error('Signup error:', err);
      return { error: 'An unexpected error occurred.' };
    }
  };

  // ── Sign In (mobile + password) ──────────────────────────
  const signIn = async (mobile: string, password: string): Promise<{ error: string | null }> => {
    try {
      const passwordHash = await hashPassword(password);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, mobile_number, password_hash, total_coins, lifetime_earnings')
        .eq('mobile_number', mobile)
        .maybeSingle();

      if (error || !data) return { error: 'Mobile number not found. Please sign up.' };
      if (data.password_hash !== passwordHash) return { error: 'Incorrect password. Please try again.' };

      localStorage.setItem('bharat_cash_user_id', data.id);
      setUser({
        id: data.id,
        display_name: data.display_name || 'User',
        mobile_number: data.mobile_number || '',
        total_coins: Number(data.total_coins) || 0,
        lifetime_earnings: Number(data.lifetime_earnings) || 0,
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
