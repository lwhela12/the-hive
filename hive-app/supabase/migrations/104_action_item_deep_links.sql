-- Izzy #19: to-dos that refer to a wish/board/person deep-link straight there,
-- so "give Nat a recommendation" is one tap instead of a scroll safari.

alter table public.action_items
  add column if not exists related_wish_id uuid references public.wishes(id) on delete set null;

alter table public.action_items
  add column if not exists related_board_category_id uuid references public.board_categories(id) on delete set null;

alter table public.action_items
  add column if not exists related_user_id uuid references public.profiles(id) on delete set null;
