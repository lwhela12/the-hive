-- How you like to hear from the HIVE — asked out loud, once, by Nat.
--
-- Nat, 2026-09-02, writing three group texts by hand: *"maybe include in the
-- survey a question if they like emails or texts better."*
--
-- **This is not `preferred_contact` coming back.** That column offered Email,
-- Phone and Text on the profile page, it defaulted to a value nobody chose,
-- and `notify` GATED mail on it — so six people who had never touched it were
-- quietly opted out of every email the HIVE would ever send, with nothing on
-- screen saying so. Nat killed it on 2026-09-01: *"this 'preferred contact
-- method' is silly, because we dont have those options."* The column is still
-- there and nothing reads it. It stays that way.
--
-- What is different here is the whole reason the question is worth asking
-- again: it has a destination, and the destination is Nat, not the mailer.
-- She reads it in Admin and decides who to text. Nothing in the app sends a
-- text, and nothing here decides who gets an email — the seven real switches
-- do that, one per kind, each one something a member set on purpose.
--
-- So: NULL by default, which means unanswered. A default value would put a
-- choice in the mouths of ten people who were never asked, and that is the
-- exact mistake the column above was.
--
-- Constrained to three answers so a typo cannot become a fourth silent
-- category in Nat's readout.

alter table public.profiles
  add column if not exists contact_pref text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_contact_pref_check'
  ) then
    alter table public.profiles
      add constraint profiles_contact_pref_check
      check (contact_pref is null or contact_pref in ('email', 'text', 'either'));
  end if;
end $$;

comment on column public.profiles.contact_pref is
  'How this member likes to hear from the HIVE: email, text, or either. NULL means they have not been asked yet. Read by Admin so Nat knows who to text. Never gate mail on it — the per-kind email_* switches are the ones a member set on purpose.';
