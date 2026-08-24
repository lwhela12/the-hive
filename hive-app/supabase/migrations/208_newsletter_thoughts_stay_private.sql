-- A newsletter thought is Nat's scratchpad, not member news.
--
-- Quick Add already has a member-visible "News from Nat" path. A raw thought
-- needs a separate home so jotting something down can never publish it, show it
-- to members, draft a newsletter, preview one, or send one.

create table public.newsletter_thoughts (
  id bigint generated always as identity primary key,
  content text not null check (length(btrim(content)) > 0 and length(content) <= 1000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.newsletter_thoughts is
  'Owner-only raw material for a future newsletter. Archive; never delete.';

alter table public.newsletter_thoughts enable row level security;

create policy "owners read newsletter thoughts"
  on public.newsletter_thoughts for select
  to authenticated
  using (public.is_hive_owner());

create policy "owners add newsletter thoughts"
  on public.newsletter_thoughts for insert
  to authenticated
  with check (public.is_hive_owner() and created_by = auth.uid());

create policy "owners edit or archive newsletter thoughts"
  on public.newsletter_thoughts for update
  to authenticated
  using (public.is_hive_owner())
  with check (public.is_hive_owner());

create or replace function public.guard_newsletter_thought_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id
      or new.created_by <> old.created_by
      or new.created_at <> old.created_at then
      raise exception 'A newsletter thought keeps its identity and author.';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_newsletter_thought_write
  before insert or update on public.newsletter_thoughts
  for each row execute function public.guard_newsletter_thought_write();

revoke all on public.newsletter_thoughts from anon;
revoke all on public.newsletter_thoughts from authenticated;
grant select, insert, update on public.newsletter_thoughts to authenticated;
grant usage, select on sequence public.newsletter_thoughts_id_seq to authenticated;
-- No DELETE policy or grant: thoughts become receipts, not vanished history.
