import { supabase } from './supabase';
import { getCycleStart } from './meetingCycle';

export type ActivityContext = {
  help: { id: string; title: string; content: string | null } | null;
  hangs: { id: string; title: string; eventDate: string | null }[];
};

/** Read-only donor of monthly-tuneup's helper focus and cycle calendar. */
export async function fetchCheckInActivityContext(communityId: string): Promise<ActivityContext> {
  const today = new Date().toISOString().slice(0, 10);
  const since = await getCycleStart(communityId, today);
  const [boards, nextMeeting] = await Promise.all([
    supabase.from('board_categories').select('id, name, status, topic_kind')
      .eq('community_id', communityId).or('topic_kind.eq.helper_log,name.ilike.%HIVE Helpers%'),
    supabase.from('events').select('event_date').eq('community_id', communityId)
      .eq('event_type', 'meeting').gte('event_date', today).order('event_date', { ascending: true }).limit(1),
  ]);
  if (boards.error || nextMeeting.error) throw boards.error || nextMeeting.error;
  const candidates = (boards.data ?? []).filter(row => !row.status || row.status === 'active')
    .sort((a, b) => Number(b.topic_kind === 'helper_log') - Number(a.topic_kind === 'helper_log'));
  const month = new Date().toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const board = candidates.find(row => row.name.toLowerCase().includes(month)) ?? candidates[0];
  const fallback = new Date(); fallback.setDate(fallback.getDate() + 35);
  const until = nextMeeting.data?.[0]?.event_date ?? fallback.toISOString().slice(0, 10);
  const [posts, events] = await Promise.all([
    board ? supabase.from('board_posts').select('id, title, content').eq('community_id', communityId)
      .eq('category_id', board.id).or('status.is.null,status.eq.active').is('archived_at', null)
      .order('created_at', { ascending: false }).limit(10) : Promise.resolve({ data: [], error: null }),
    supabase.from('events').select('id, title, event_date, end_date, event_type')
      .eq('community_id', communityId).gte('event_date', since.toISOString().slice(0, 10))
      .lte('event_date', until).neq('event_type', 'meeting').neq('event_type', 'birthday')
      .order('event_date', { ascending: true }),
  ]);
  if (posts.error || events.error) throw posts.error || events.error;
  return {
    // A focus can predate the cycle boundary: newest active focus wins, not calendar month.
    help: (posts.data ?? []).find(row => !/ideas/i.test(row.title)) ?? null,
    hangs: (events.data ?? []).filter(event => !(event.end_date || /\b(out of town|away|trip|travel|galavant)/i.test(event.title)))
      .map(event => ({ id: event.id, title: event.title, eventDate: event.event_date ?? null })),
  };
}
