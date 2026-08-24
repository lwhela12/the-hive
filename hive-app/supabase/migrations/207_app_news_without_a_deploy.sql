-- New News from Nat entries can be written without shipping a new app bundle.
-- The code list remains the frozen historical baseline; this table is only for
-- additions from now on. News speaks app-wide, so HIVE admins are deliberately
-- not writers: only profiles.is_owner may add or archive it.

create table public.app_news (
  id bigint generated always as identity primary key,
  occurred_on date not null,
  title text not null check (length(btrim(title)) > 0),
  detail text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.app_news is
  'Owner-written additions to the frozen app news baseline. Archive; never delete.';

alter table public.app_news enable row level security;

-- Every signed-in member sees active app news on Home, HIVE-Wide, the meeting
-- deck, and in newsletter facts. Archived copy disappears but remains stored.
create policy "members read active app news"
  on public.app_news for select
  to authenticated
  using (archived_at is null);

create policy "owners add app news"
  on public.app_news for insert
  to authenticated
  with check (public.is_hive_owner() and created_by = auth.uid());

create policy "owners edit or archive app news"
  on public.app_news for update
  to authenticated
  using (public.is_hive_owner())
  with check (public.is_hive_owner());

-- RLS cannot express immutable columns. Keep identity, authorship and creation
-- time fixed while still allowing an owner to correct copy/date or archive it.
create or replace function public.guard_app_news_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.title := btrim(new.title);
  new.detail := nullif(btrim(new.detail), '');

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'App news identity and authorship cannot be changed.';
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_app_news_write
  before insert or update on public.app_news
  for each row execute function public.guard_app_news_write();

revoke all on public.app_news from anon;
revoke all on public.app_news from authenticated;
grant select, insert, update on public.app_news to authenticated;
grant usage, select on sequence public.app_news_id_seq to authenticated;
-- Intentionally no DELETE policy and no DELETE grant for any app role.
