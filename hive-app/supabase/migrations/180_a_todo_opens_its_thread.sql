-- A to-do can point at the thread it belongs to.
--
-- Nat designed this out loud on 2026-08-14, looking at Production HIVE's first
-- set of jobs and asking the question the app had no answer to: *"when people
-- go get that information, where should they put all of it? ... maybe there's
-- like a pre-production board and each one of these tasks is its own thread,
-- and then people can respond in there. If you know that your job is to call
-- Circus Center, you can click on your task and it'll bring you to that thread
-- inside of that board that has the phone number and the questions to ask, and
-- then you can leave your notes in it."*
--
-- `action_items` could already point at a wish (`related_wish_id`), a person
-- (`related_user_id`) and a whole board (`related_board_category_id`) — but not
-- at one thread. So a to-do could say "call the rigging vendor" and had nowhere
-- to send you for the questions, and nowhere for you to put the answer.
--
-- Nullable on purpose: almost every to-do in the app is a jot from a meeting
-- and has no thread behind it. This is for the ones that do.
alter table public.action_items
  add column if not exists related_board_post_id uuid
  references public.board_posts(id) on delete set null;

comment on column public.action_items.related_board_post_id is
  'The board thread this to-do opens. Tapping the to-do lands on the thread that holds the brief and collects what you find out.';

-- The lookup is always "given this to-do, which thread?", and the reverse
-- ("which to-dos hang off this thread?") is what the thread view will want.
create index if not exists action_items_related_board_post_id_idx
  on public.action_items (related_board_post_id)
  where related_board_post_id is not null;
