-- A welcome tour belongs to the current membership cycle.
--
-- The original tour mark was lifetime-per-person-per-HIVE. That correctly kept
-- a finished/skipped tour away on another device, but it also suppressed a
-- genuinely fresh invitation after an old membership had been removed. The
-- repair updates the existing mark's completed_at when the new membership's
-- tour is finished or skipped, so the same primary key can safely serve each
-- membership cycle.

create policy "You can refresh your own tour mark"
on public.tour_marks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
