-- Add spin tracking columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS spins_today integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS free_spin_used boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_spin_reset_date date DEFAULT NULL;