-- Let in-app Activity deep-link personal mention notifications without
-- exposing private notifications as community-wide feed items.
alter table public.notifications
  add column if not exists metadata jsonb default '{}'::jsonb;

create index if not exists notifications_user_activity_idx
  on public.notifications (community_id, user_id, created_at desc)
  where notification_type in ('board_mention', 'wish_mention', 'chat_mention');

comment on column public.notifications.metadata is
  'Optional route/context payload for in-app notification surfaces, such as board post, wish, or chat room ids.';
