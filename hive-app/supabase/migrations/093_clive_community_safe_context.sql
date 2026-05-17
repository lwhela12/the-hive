-- Clive context must not preload or summarize private chat rooms, DMs,
-- group DMs, or raw room_messages. Community-safe context comes from boards,
-- public/fulfilled wishes, skills, events, meetings, and Honey Pot state.

delete from public.context_summaries
where summary_type = 'room_messages';

create or replace function public.reject_room_message_context_summaries()
returns trigger as $$
begin
  if NEW.summary_type = 'room_messages' then
    raise exception 'room_messages context summaries are disabled for Clive privacy boundaries';
  end if;

  return NEW;
end;
$$ language plpgsql;

drop trigger if exists reject_room_message_context_summaries
  on public.context_summaries;

create trigger reject_room_message_context_summaries
  before insert or update
  on public.context_summaries
  for each row
  execute function public.reject_room_message_context_summaries();

comment on table public.context_summaries is
  'Cached summaries for LLM context. Clive reads conversation, board_activity, and meetings summaries only; room_messages summaries are purged and rejected for privacy.';
