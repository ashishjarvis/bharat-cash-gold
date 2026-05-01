-- Drop the foreign key constraint that links profiles.id to auth.users
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
