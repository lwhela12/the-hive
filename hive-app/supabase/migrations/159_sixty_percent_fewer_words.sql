-- Nat, on her phone, looking at HIVE-Wide's board: the category header names
-- the room, then a description restates it, then the welcome thread's title
-- restates it again, then its own body restates it a fourth time — "too much
-- description of the description of the description." "HIVE-Wide" is already
-- self-explanatory; cut everywhere it explains itself instead of saying
-- something new. This also drops the welcome post's list of HIVEs by name
-- (OG, Tech, Production), which Nat separately asked to remove — new HIVEs
-- keep landing here without another edit.

-- The category's own subtitle and the welcome post's body were saying the
-- same sentence twice in a row on the same screen. The name already carries
-- the subtitle's job, so the subtitle goes to nothing rather than to fewer
-- words saying the same thing again.
update public.board_categories
set description = null
where name = 'HIVE-Wide General Discussion'
  and reach = 'all_hives';

update public.board_posts
set content = 'Say hi, ask for help, or share what you''re working on — anyone in any HIVE can see it.'
where title = 'Welcome to HIVE-Wide';
