import { supabase } from './supabase';
import { getCycleStart } from './meetingCycle';
import { currentMonthlyHelpPost } from './monthlyHiveHelp';

export type ActivityContext = {
  help: { id: string; title: string; content: string | null } | null;
  hangs: { id: string; title: string; eventDate: string | null }[];
};

/** Read-only donor of monthly-tuneup's helper focus and cycle calendar. */
export async function fetchCheckInActivityContext(communityId: string): Promise<ActivityContext> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const since = await getCycleStart(communityId, today);
  const [boards, nextMeeting] = await Promise.all([
    supabase.from('board_categories').select('id, name, status, topic_kind, reach')
      .eq('community_id', communityId).or('topic_kind.eq.helper_log,name.ilike.%HIVE Helpers%'),
    supabase.from('events').select('event_date').eq('community_id', communityId)
      .eq('event_type', 'meeting').gte('event_date', today).order('event_date', { ascending: true }).limit(1),
  ]);
  if (boards.error || nextMeeting.error) throw boards.error || nextMeeting.error;
  const candidates = (boards.data ?? []).filter(row => !row.status || row.status === 'active')
    .sort((a, b) => Number(b.reach === 'all_hives') - Number(a.reach === 'all_hives')
      || Number(b.topic_kind === 'helper_log') - Number(a.topic_kind === 'helper_log'));
  const month = new Date().toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const board = candidates.find(row => row.reach === 'all_hives')
    ?? candidates.find(row => row.name.toLowerCase().includes(month)) ?? candidates[0];
  const fallback = new Date(); fallback.setDate(fallback.getDate() + 35);
  const until = nextMeeting.data?.[0]?.event_date ?? fallback.toISOString().slice(0, 10);
  const [posts, events] = await Promise.all([
    board ? supabase.from('board_posts').select('id, title, content, created_at').eq('community_id', communityId)
      .eq('category_id', board.id).or('status.is.null,status.eq.active').is('archived_at', null)
      .order('created_at', { ascending: false }).limit(10) : Promise.resolve({ data: [], error: null }),
    supabase.from('events').select('id, title, event_date, end_date, event_type')
      .eq('community_id', communityId).gte('event_date', since.toISOString().slice(0, 10))
      .lte('event_date', until).neq('event_type', 'meeting').neq('event_type', 'birthday')
      .or('status.is.null,status.eq.scheduled')
      .order('event_date', { ascending: true }),
  ]);
  if (posts.error || events.error) throw posts.error || events.error;
  return {
    // A future month's thread may already exist; only this month's focus is current.
    help: currentMonthlyHelpPost(posts.data ?? [], today.slice(0, 7))
      ?? ((posts.data ?? []).some(row => /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+HIVE Help/i.test(row.title))
        ? null : (posts.data ?? []).find(row => !/ideas/i.test(row.title)) ?? null),
    hangs: (events.data ?? []).filter(event => event.event_date <= today
      && !/\b(out of town|away|travel|vacation|galavant|dues due|pending|tentative|cancelled|canceled)\b/i.test(event.title)
      && !/^Q[1-4]\s+\d{4}\s+(begins|ends)\b/i.test(event.title))
      .map(event => ({ id: event.id, title: event.title, eventDate: event.event_date ?? null })),
  };
}
