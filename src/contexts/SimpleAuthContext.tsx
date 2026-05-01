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
  signOut: () => void;
}

const SimpleAuthContext = createContext<SimpleAuthContextType | undefined>(undefined);

// Simple hash function for password (in production, use bcrypt on server)
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'bharat_cash_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const SimpleAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const storedUserId = localStorage.getItem('bharat_cash_user_id');
    
    if (storedUserId) {
      // Fetch user profile from DB
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
      setLoading(false);
    }
  }, []);

  const signUp = async (name: string, mobile: string, password: string): Promise<{ error: string | null }> => {
    try {
      // Check if mobile already exists
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('mobile_number', mobile)
        .maybeSingle();

      if (existing) {
        return { error: 'Mobile number already registered. Please login.' };
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Generate unique ID
      const id = crypto.randomUUID();

      // Create profile
      const { error } = await supabase
        .from('profiles')
        .insert({
          id,
          display_name: name,
          mobile_number: mobile,
          password_hash: passwordHash,
          total_coins: 0,
          lifetime_earnings: 0,
        });

      if (error) {
        console.error('Signup error:', error);
        return { error: 'Failed to create account. Please try again.' };
      }

      // Set session
      localStorage.setItem('bharat_cash_user_id', id);
      setUser({
        id,
        display_name: name,
        mobile_number: mobile,
        total_coins: 0,
        lifetime_earnings: 0,
      });

      return { error: null };
    } catch (err) {
      console.error('Signup error:', err);
      return { error: 'An unexpected error occurred.' };
    }
  };

  const signIn = async (mobile: string, password: string): Promise<{ error: string | null }> => {
    try {
      // Hash password
      const passwordHash = await hashPassword(password);

      // Find user
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, mobile_number, password_hash, total_coins, lifetime_earnings')
        .eq('mobile_number', mobile)
        .maybeSingle();

      if (error || !data) {
        return { error: 'Mobile number not found. Please sign up.' };
      }

      // Check password
      if (data.password_hash !== passwordHash) {
        return { error: 'Incorrect password. Please try again.' };
      }

      // Set session
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

  const signOut = () => {
    localStorage.removeItem('bharat_cash_user_id');
    setUser(null);
  };

  return (
    <SimpleAuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </SimpleAuthContext.Provider>
  );
};

export const useSimpleAuth = () => {
  const context = useContext(SimpleAuthContext);
  if (context === undefined) {
    throw new Error('useSimpleAuth must be used within a SimpleAuthProvider');
  }
  return context;
};
