-- Add 'historian' to the user_role enum
-- Historians can edit upcoming events

-- Check if 'historian' already exists in the enum before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'historian'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE user_role ADD VALUE 'historian' BEFORE 'admin';
  END IF;
END$$;
