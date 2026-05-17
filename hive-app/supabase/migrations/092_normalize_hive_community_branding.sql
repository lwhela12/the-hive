-- Normalize legacy community names so invite and onboarding screens use the official HIVE brand.

update public.communities
set name = 'H.I.V.E.'
where lower(trim(name)) in ('the hive', 'hive', 'the h.i.v.e.', 'h.i.v.e.');
