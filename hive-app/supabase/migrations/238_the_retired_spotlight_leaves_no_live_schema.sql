-- Finish removing the retired rotating single-member spotlight from the live
-- schema. Migration 160 removed its tables, but two profile fields, three enum
-- values and one orphaned status type survived.

-- Preserve the archived board and its posts as history while moving the row to
-- a current, non-special category type.
update public.board_categories
set category_type = 'custom'
where category_type::text = 'queen_bee';

-- Three old machine-generated summaries still carried an unused structured
-- key. Remove the key without changing their historical prose.
update public.meetings
set summary = (summary::jsonb - 'queen_bee_highlights')::text
where summary::text ilike '%queen_bee_highlights%';

alter table public.profiles
  drop column if exists queen_bee_month,
  drop column if exists queen_bee_preference;

-- PostgreSQL cannot drop a single enum value, so rebuild the three in-use
-- types with only their current values. Policies and the partial index that
-- explicitly cast enum literals are restored unchanged below.
drop policy if exists "Members can create custom categories" on public.board_categories;
drop policy if exists "Members can update own custom categories" on public.board_categories;
drop policy if exists "Members can delete own custom categories" on public.board_categories;
drop policy if exists "File own check-in receipts" on public.check_in_completions;
drop policy if exists "Revise own check-in receipts" on public.check_in_completions;
drop index if exists public.notifications_user_activity_idx;

alter table public.events alter column event_type drop default;

alter type public.board_category_type rename to board_category_type_with_retired_value;
create type public.board_category_type as enum (
  'announcements', 'general', 'resources', 'introductions', 'custom'
);
alter table public.board_categories
  alter column category_type type public.board_category_type
  using category_type::text::public.board_category_type;

alter type public.event_type rename to event_type_with_retired_value;
create type public.event_type as enum ('meeting', 'birthday', 'custom');
alter table public.events
  alter column event_type type public.event_type
  using event_type::text::public.event_type;
alter table public.events alter column event_type set default 'custom'::public.event_type;

alter type public.notification_type rename to notification_type_with_retired_value;
create type public.notification_type as enum (
  'wish_match', 'meeting_summary', 'action_item', 'general',
  'wish_mention', 'board_mention', 'chat_mention'
);
alter table public.notifications
  alter column notification_type type public.notification_type
  using notification_type::text::public.notification_type;

drop type public.board_category_type_with_retired_value;
drop type public.event_type_with_retired_value;
drop type public.notification_type_with_retired_value;
drop type if exists public.queen_bee_status;

create policy "Members can create custom categories" on public.board_categories
  for insert with check (
    exists (
      select 1 from public.community_memberships
      where community_id = board_categories.community_id and user_id = auth.uid()
    )
    and category_type = 'custom'
    and is_system = false
    and requires_admin = false
    and created_by = auth.uid()
  );

create policy "Members can update own custom categories" on public.board_categories
  for update using (
    created_by = auth.uid()
    and category_type = 'custom'
    and is_system = false
  )
  with check (
    created_by = auth.uid()
    and category_type = 'custom'
    and is_system = false
  );

create policy "Members can delete own custom categories" on public.board_categories
  for delete using (
    created_by = auth.uid()
    and category_type = 'custom'
    and is_system = false
    and not exists (
      select 1 from public.board_posts
      where category_id = board_categories.id
    )
  );

create policy "File own check-in receipts" on public.check_in_completions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists(
      select 1 from public.surveys s
      where s.id = check_in_completions.survey_id and s.is_active and s.community_id is null
      and (
        (public.check_in_kind(s.title) = 'premeeting'
          and exists(select 1 from public.events e
            where 'meeting:' || e.id::text = check_in_completions.occurrence
            and e.community_id = check_in_completions.community_id
            and e.event_type = 'meeting' and e.status = 'scheduled'
            and e.event_date >= (now() at time zone 'America/Los_Angeles')::date))
        or (public.check_in_kind(s.title) = 'endofmonth'
          and check_in_completions.occurrence = 'month:' || to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM'))
      )
    )
    and (community_id is null or exists(select 1 from public.community_memberships m where m.user_id = auth.uid() and m.community_id = check_in_completions.community_id))
  );

create policy "Revise own check-in receipts" on public.check_in_completions
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists(
      select 1 from public.surveys s
      where s.id = check_in_completions.survey_id and s.is_active and s.community_id is null
      and (
        (public.check_in_kind(s.title) = 'premeeting'
          and exists(select 1 from public.events e
            where 'meeting:' || e.id::text = check_in_completions.occurrence
            and e.community_id = check_in_completions.community_id
            and e.event_type = 'meeting' and e.status = 'scheduled'
            and e.event_date >= (now() at time zone 'America/Los_Angeles')::date))
        or (public.check_in_kind(s.title) = 'endofmonth'
          and check_in_completions.occurrence = 'month:' || to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM'))
      )
    )
    and (community_id is null or exists(select 1 from public.community_memberships m where m.user_id = auth.uid() and m.community_id = check_in_completions.community_id))
  );

create index notifications_user_activity_idx
  on public.notifications (community_id, user_id, created_at desc)
  where notification_type in ('board_mention', 'wish_mention', 'chat_mention');

notify pgrst, 'reload schema';
