-- ONE END OF THE MONTH, ONE BEFORE WE MEET. THE DATABASE SAYS SO NOW.
--
-- Nat, 2026-09-04: *"there should be 1 end of the month check in survey & one
-- 'before we meet' check in survey & it doesnt matter if you are in 1 hive or
-- all 3, you only get one, so i dunno how there is stil a duplicate?"*
--
-- ## How there was still a duplicate
--
-- Migration 225 made `community_id` nullable and NULL mean HIVE-Wide, and the
-- shared "End of the month" was created the next day. What it never did was
-- CLOSE the per-HIVE rows the shared one replaces. OG's and Tech's had already
-- been retired by hand, so the gap left exactly one row standing — Production's
-- "Halfway check-in" — and one row standing is invisible until somebody counts.
--
-- The merge was written as a creation and the retirement was left to a person's
-- memory. That is the actual defect; the extra row is only what it looked like.
--
-- So the rule stops being a habit and becomes a constraint: **while a HIVE-Wide
-- check-in of a kind is open, no HIVE may hold its own open one of that kind.**
--
-- ## Only the two merged kinds
--
-- The quarterly and the end-of-year are deliberately untouched. They are their
-- own thing, they belong to a HIVE, and there is no HIVE-Wide version of either
-- for them to collide with — so widening this rule to cover them would be a
-- rule about a shape that does not exist, waiting to surprise somebody who
-- launches Q4 while Q3 is still open.

-- --------------------------------------------------------------------------
-- WHAT KIND OF CHECK-IN A ROW IS
-- --------------------------------------------------------------------------
--
-- A survey's TITLE IS ITS TYPE — there is no `kind` column, and this is the
-- fourth place that truth is written (the app's `lib/checkIns.ts`, the edge
-- functions' `_shared/checkInPatterns.ts`, `schedule-meeting`, and now here).
-- The patterns below are the same ones, transcribed; `npm run
-- lint:check-in-kinds` fails the build if the app's copy ever drifts from the
-- edge functions'.
--
-- Retired titles are kept on purpose. "Halfway check-in", "Where the show got
-- to this month" and "Pro HIVE POP" are all the end-of-month row under names it
-- used to carry, and a rule that only recognises today's name is a rule that
-- stops applying the moment somebody renames something.

create or replace function public.check_in_kind(title text)
returns text
language sql
immutable
as $$
  select case
    when title ~* 'end[-\s]of[-\s]year\s+check-?in' then 'year'
    when title ~* 'quarterly\s+check-?in' then 'quarter'
    when title ~* '(end of the month|where the show got to this month|pro hive pop|halfway check-?in)'
      then 'endofmonth'
    when title ~* '(before (our first meeting|we meet)|monthly\s+check-?in)' then 'premeeting'
  end;
$$;

comment on function public.check_in_kind(text) is
  'Which check-in a survey row is, read off its title — the only place that fact lives. endofmonth | premeeting | quarter | year, or NULL for a survey Nat wrote by hand. Retired titles still answer, so a rename cannot quietly move a row out of its own rhythm.';

-- --------------------------------------------------------------------------
-- THE ONE-TIME SWEEP
-- --------------------------------------------------------------------------
--
-- Closes what is standing today. Production's active "Halfway check-in" is the
-- only row this touches; its one answer (Nat's own, August, "@sara") stays
-- exactly where it is, because closing a check-in never removes what people
-- wrote in it.

update public.surveys s
   set is_active = false
 where s.is_active
   and s.community_id is not null
   and public.check_in_kind(s.title) in ('endofmonth', 'premeeting')
   and exists (
     select 1 from public.surveys wide
      where wide.community_id is null
        and wide.is_active
        and public.check_in_kind(wide.title) = public.check_in_kind(s.title)
   );

-- --------------------------------------------------------------------------
-- AND THE RULE THAT KEEPS IT CLOSED
-- --------------------------------------------------------------------------
--
-- Fires only when a row TRANSITIONS to open — an insert that is already open,
-- or an update that opens a closed one. Not on every update, and that
-- distinction is load-bearing: `schedule-meeting` rolls `due_date` forward on
-- the shared "Before we meet" every time any HIVE books a meeting, and a
-- trigger that read `NEW.is_active` on any update would have turned that
-- ordinary edit into the October cutover, on whatever afternoon somebody
-- happened to schedule a meeting.
--
-- Both directions are covered, and HIVE-Wide wins both times:
--
--   a HIVE's own row opens   while a HIVE-Wide one of that kind is open
--                            -> it does not open. The shared one is the one
--                               that actually sends.
--   a HIVE-Wide row opens    -> every HIVE's own row of that kind closes. This
--                               is what the 14 October cutover is: opening the
--                               shared "Before we meet" retires the three
--                               per-HIVE ones by itself, rather than by
--                               somebody remembering three rows.
--
-- Within one scope the newest wins, which is what stops a second "Halfway
-- check-in" being created beside the first — the shape Production was in on
-- 2026-08-20 and nobody saw for a fortnight.

create or replace function public.close_check_ins_of_the_same_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text := public.check_in_kind(new.title);
begin
  if kind is null or kind not in ('endofmonth', 'premeeting') then
    return null;
  end if;

  if new.community_id is null then
    -- The shared one opens: every per-HIVE row of this kind stands down.
    update public.surveys
       set is_active = false
     where id <> new.id
       and is_active
       and public.check_in_kind(title) = kind;
  else
    -- A HIVE's own opens: only its own HIVE's other rows of this kind.
    update public.surveys
       set is_active = false
     where id <> new.id
       and is_active
       and community_id = new.community_id
       and public.check_in_kind(title) = kind;
  end if;

  return null;
end;
$$;

create or replace function public.refuse_a_check_in_the_wide_one_covers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text := public.check_in_kind(new.title);
begin
  if not new.is_active or new.community_id is null then return new; end if;
  if kind is null or kind not in ('endofmonth', 'premeeting') then return new; end if;

  if exists (
    select 1 from public.surveys wide
     where wide.community_id is null
       and wide.is_active
       and wide.id <> new.id
       and public.check_in_kind(wide.title) = kind
  ) then
    -- Closed rather than raised. Nobody creates these by hand any more, so an
    -- exception here would only ever surface as a red box on a screen that was
    -- doing something else; a row that quietly does not open is the answer Nat
    -- asked for — "you only get one".
    raise notice 'A HIVE-Wide % check-in is already open, so % stays closed.', kind, new.title;
    new.is_active := false;
  end if;

  return new;
end;
$$;

drop trigger if exists surveys_wide_check_in_wins on public.surveys;
create trigger surveys_wide_check_in_wins
  before insert or update of is_active, title, community_id on public.surveys
  for each row execute function public.refuse_a_check_in_the_wide_one_covers();

-- Two triggers rather than one `insert or update`, because a WHEN clause that
-- reads OLD cannot be attached to an INSERT.
drop trigger if exists surveys_one_check_in_of_a_kind on public.surveys;
create trigger surveys_one_check_in_of_a_kind
  after insert on public.surveys
  for each row
  when (new.is_active is true)
  execute function public.close_check_ins_of_the_same_kind();

drop trigger if exists surveys_one_check_in_of_a_kind_on_open on public.surveys;
create trigger surveys_one_check_in_of_a_kind_on_open
  after update of is_active on public.surveys
  for each row
  when (new.is_active is true and old.is_active is distinct from true)
  execute function public.close_check_ins_of_the_same_kind();
