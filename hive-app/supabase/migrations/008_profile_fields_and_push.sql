-- Add occupation and push notification token to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS occupation text,
ADD COLUMN IF NOT EXISTS push_token text;

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.occupation IS 'User occupation or job title';
COMMENT ON COLUMN public.profiles.push_token IS 'Expo push notification token for iOS/Android';
