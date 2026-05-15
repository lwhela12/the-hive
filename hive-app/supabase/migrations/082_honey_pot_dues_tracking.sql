-- Track quarterly dues as structured Honey Pot transaction metadata.

alter table public.honey_pot_transactions
  add column if not exists related_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists dues_year integer,
  add column if not exists dues_quarter integer,
  add column if not exists dues_covered_quarters integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'honey_pot_transactions_dues_quarter_check'
      and conrelid = 'public.honey_pot_transactions'::regclass
  ) then
    alter table public.honey_pot_transactions
      add constraint honey_pot_transactions_dues_quarter_check
      check (dues_quarter is null or dues_quarter between 1 and 4);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'honey_pot_transactions_dues_covered_quarters_check'
      and conrelid = 'public.honey_pot_transactions'::regclass
  ) then
    alter table public.honey_pot_transactions
      add constraint honey_pot_transactions_dues_covered_quarters_check
      check (dues_covered_quarters is null or dues_covered_quarters between 1 and 4);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'honey_pot_transactions_dues_year_check'
      and conrelid = 'public.honey_pot_transactions'::regclass
  ) then
    alter table public.honey_pot_transactions
      add constraint honey_pot_transactions_dues_year_check
      check (dues_year is null or dues_year between 2020 and 2100);
  end if;
end $$;

create index if not exists honey_pot_transactions_related_user_dues_idx
  on public.honey_pot_transactions (community_id, related_user_id, dues_year, dues_quarter)
  where related_user_id is not null;

insert into public.honey_pot (community_id, balance)
select c.id, coalesce(sum(t.amount), 0)::numeric
from public.communities c
left join public.honey_pot_transactions t on t.community_id = c.id
group by c.id
on conflict (community_id) do nothing;

create or replace function public.is_community_admin(c_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_memberships cm
    left join public.profiles p on p.id = cm.user_id
    where cm.community_id = c_id
      and cm.user_id = auth.uid()
      and (cm.role::text = 'admin' or p.role::text = 'admin')
  );
$$;

create or replace function public.is_community_treasurer(c_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_memberships cm
    left join public.profiles p on p.id = cm.user_id
    where cm.community_id = c_id
      and cm.user_id = auth.uid()
      and (
        cm.role::text in ('treasurer', 'admin')
        or p.role::text in ('treasurer', 'admin')
      )
  );
$$;

drop policy if exists "Treasurer can insert honey pot" on public.honey_pot;
create policy "Treasurer can insert honey pot" on public.honey_pot
  for insert with check (public.is_community_treasurer(community_id));
