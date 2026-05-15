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

create or replace function public.record_honey_pot_transaction(
  p_community_id uuid,
  p_amount numeric,
  p_transaction_type text,
  p_note text default null,
  p_related_user_id uuid default null,
  p_dues_year integer default null,
  p_dues_quarter integer default null,
  p_dues_covered_quarters integer default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_recorder uuid := auth.uid();
begin
  if v_recorder is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if not public.is_community_treasurer(p_community_id) then
    raise exception 'Treasurer access required'
      using errcode = '42501';
  end if;

  if p_transaction_type not in ('deposit', 'withdrawal', 'adjustment') then
    raise exception 'Invalid Honey Pot transaction type'
      using errcode = '22023';
  end if;

  if p_amount = 0 then
    raise exception 'Honey Pot amount cannot be zero'
      using errcode = '22023';
  end if;

  if p_transaction_type = 'deposit' and p_amount < 0 then
    raise exception 'Deposits must be positive'
      using errcode = '22023';
  end if;

  if p_transaction_type = 'withdrawal' and p_amount > 0 then
    raise exception 'Withdrawals must be negative'
      using errcode = '22023';
  end if;

  if p_transaction_type <> 'deposit'
    and (
      p_related_user_id is not null
      or p_dues_year is not null
      or p_dues_quarter is not null
      or p_dues_covered_quarters is not null
    )
  then
    raise exception 'Only deposits can be tagged as dues'
      using errcode = '22023';
  end if;

  if p_dues_year is not null
    and (
      p_related_user_id is null
      or p_dues_covered_quarters is null
      or (p_dues_covered_quarters < 4 and p_dues_quarter is null)
    )
  then
    raise exception 'Dues tags require a member, year, and covered quarter range'
      using errcode = '22023';
  end if;

  insert into public.honey_pot_transactions (
    community_id,
    amount,
    transaction_type,
    note,
    recorded_by,
    related_user_id,
    dues_year,
    dues_quarter,
    dues_covered_quarters
  ) values (
    p_community_id,
    p_amount,
    p_transaction_type,
    nullif(trim(p_note), ''),
    v_recorder,
    p_related_user_id,
    p_dues_year,
    p_dues_quarter,
    p_dues_covered_quarters
  );

  insert into public.honey_pot (
    community_id,
    balance,
    updated_by,
    updated_at
  ) values (
    p_community_id,
    p_amount,
    v_recorder,
    now()
  )
  on conflict (community_id) do update
    set balance = public.honey_pot.balance + excluded.balance,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning balance into v_balance;

  return coalesce(v_balance, 0);
end;
$$;

grant execute on function public.record_honey_pot_transaction(
  uuid,
  numeric,
  text,
  text,
  uuid,
  integer,
  integer,
  integer
) to authenticated;
