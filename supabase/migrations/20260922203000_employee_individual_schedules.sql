-- Each employee can follow an individual schedule. Existing employees inherit
-- the company standard until an administrator configures a different one.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS work_start time,
  ADD COLUMN IF NOT EXISTS work_end time,
  ADD COLUMN IF NOT EXISTS break_minutes integer;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_break_minutes_nonnegative
  CHECK (break_minutes IS NULL OR break_minutes >= 0);
