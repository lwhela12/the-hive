-- Rich profile fields for deeper member discovery
alter table public.profiles
  add column if not exists bio text,
  add column if not exists current_project text,
  add column if not exists hometown text,
  add column if not exists fun_facts text[], -- array of up to 3 short fun facts
  add column if not exists favorite_book text,
  add column if not exists favorite_food text,
  add column if not exists favorite_hobby text,
  add column if not exists known_for text, -- "what are you known for in the group?"
  add column if not exists love_languages text[]; -- words_of_affirmation, acts_of_service, etc.
