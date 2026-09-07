-- Every event surface listens to the same canonical public.events rows.
-- Adding the table to Realtime lets a change in another tab/device invalidate
-- the shared cache immediately; focus refetch remains the recovery path.
do $$
begin
  alter publication supabase_realtime add table public.events;
exception
  when duplicate_object then null;
end
$$;
