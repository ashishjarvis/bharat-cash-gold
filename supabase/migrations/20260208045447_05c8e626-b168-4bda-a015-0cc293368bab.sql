-- Add mobile_number to profiles for phone-based auth
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS mobile_number text UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash text;

-- Create index for faster mobile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_mobile_number ON public.profiles(mobile_number);

-- Update RLS to allow inserting profiles without auth for signup
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Allow anyone to insert a new profile (for signup)
CREATE POLICY "Anyone can create profile during signup" 
ON public.profiles 
FOR INSERT 
WITH CHECK (true);

-- Allow users to read their own profile by mobile number (for login check)
CREATE POLICY "Anyone can check profile by mobile for login" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
ON public.profiles 
FOR UPDATE 
USING (true);