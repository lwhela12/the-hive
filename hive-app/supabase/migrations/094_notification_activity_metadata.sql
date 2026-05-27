-- Let in-app Activity deep-link personal mention notifications without
-- exposing private notifications as community-wide feed items.
--
-- Some remote environments had migration history drift where the earlier enum
-- expansion migration was marked applied but the values were missing. Add the
-- mention values here, but do not use them until the next migration because
-- Postgres enum values cannot be referenced safely until after commit.
alter type public.notification_type add value if not exists 'board_mention';
alter type public.notification_type add value if not exists 'wish_mention';
alter type public.notification_type add value if not exists 'chat_mention';

alter table public.notifications
  add column if not exists metadata jsonb default '{}'::jsonb;

comment on column public.notifications.metadata is
  'Optional route/context payload for in-app notification surfaces, such as board post, wish, or chat room ids.';
