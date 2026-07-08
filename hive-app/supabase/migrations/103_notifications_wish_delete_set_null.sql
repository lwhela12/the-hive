alter table public.notifications
  drop constraint if exists notifications_related_wish_id_fkey;

alter table public.notifications
  add constraint notifications_related_wish_id_fkey
  foreign key (related_wish_id)
  references public.wishes(id)
  on delete set null;
