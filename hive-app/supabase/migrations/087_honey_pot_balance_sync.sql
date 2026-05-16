-- Keep the Honey Pot balance in sync with the transparent transaction ledger.

create or replace function public.sync_honey_pot_balance_from_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.honey_pot (
    community_id,
    balance,
    updated_by,
    updated_at
  ) values (
    new.community_id,
    new.amount,
    new.recorded_by,
    now()
  )
  on conflict (community_id) do update
    set balance = public.honey_pot.balance + excluded.balance,
        updated_by = excluded.updated_by,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_honey_pot_balance_after_insert on public.honey_pot_transactions;
create trigger sync_honey_pot_balance_after_insert
  after insert on public.honey_pot_transactions
  for each row
  execute function public.sync_honey_pot_balance_from_transaction();

insert into public.honey_pot (
  community_id,
  balance,
  updated_at
)
select
  c.id,
  coalesce(sum(t.amount), 0)::numeric,
  now()
from public.communities c
left join public.honey_pot_transactions t on t.community_id = c.id
group by c.id
on conflict (community_id) do update
  set balance = excluded.balance,
      updated_at = now();

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

  select balance
  into v_balance
  from public.honey_pot
  where community_id = p_community_id;

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
