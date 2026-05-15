update public.profiles
set profile_title = 'Founder'
where lower(email) = 'natwalstead@gmail.com'
  and (profile_title is null or btrim(profile_title) = '');
