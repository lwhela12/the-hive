-- Add structured Honey Pot ledger details so members can audit every entry.

alter table public.honey_pot_transactions
  add column if not exists payment_method text,
  add column if not exists external_counterparty_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'honey_pot_transactions_payment_method_check'
      and conrelid = 'public.honey_pot_transactions'::regclass
  ) then
    alter table public.honey_pot_transactions
      add constraint honey_pot_transactions_payment_method_check
      check (
        payment_method is null
        or payment_method in ('cash_app', 'venmo', 'zelle', 'cash', 'check', 'other')
      );
  end if;
end $$;

create index if not exists honey_pot_transactions_community_created_idx
  on public.honey_pot_transactions (community_id, created_at desc);

create index if not exists honey_pot_transactions_payment_method_idx
  on public.honey_pot_transactions (community_id, payment_method)
  where payment_method is not null;

drop function if exists public.record_honey_pot_transaction(
  uuid,
  numeric,
  text,
  text,
  uuid,
  integer,
  integer,
  integer
);

create or replace function public.record_honey_pot_transaction(
  p_community_id uuid,
  p_amount numeric,
  p_transaction_type text,
  p_note text default null,
  p_payment_method text default null,
  p_external_counterparty_name text default null,
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

  if p_payment_method is not null
    and p_payment_method not in ('cash_app', 'venmo', 'zelle', 'cash', 'check', 'other')
  then
    raise exception 'Invalid Honey Pot payment method'
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
      p_dues_year is not null
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
    payment_method,
    external_counterparty_name,
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
    p_payment_method,
    nullif(trim(p_external_counterparty_name), ''),
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
  text,
  text,
  uuid,
  integer,
  integer,
  integer
) to authenticated;
