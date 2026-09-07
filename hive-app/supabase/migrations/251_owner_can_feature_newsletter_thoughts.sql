-- Nat's private newsletter notes are editorial direction. Marking one for the
-- next issue makes that instruction explicit, ahead of the automatic shortlist.
alter table public.newsletter_thoughts
  add column if not exists featured_in_next_issue boolean not null default false;

comment on column public.newsletter_thoughts.featured_in_next_issue is
  'Owner-selected editorial beat for the next Buzz. Featured notes outrank automatic newsletter selection.';
