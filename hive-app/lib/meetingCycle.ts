import { supabase } from './supabase';

// The HIVE runs meeting-to-meeting, so "this cycle" windows should anchor to
// the actual previous meeting — the old fixed 35-day lookback dropped
// early-cycle hangs whenever meetings drifted more than five weeks apart
// (RIP Alphabet Mafia, June 17).

/**
 * The last meeting this HIVE actually had.
 *
 * **Two tables know, and neither knows on its own.**
 *
 * `events` holds the meeting on the calendar. OG's and Production's dates are
 * set meeting to meeting, so the row that was August's gets MOVED to September
 * rather than copied — and the moment it moves, August stops existing in the
 * past. On 2026-08-27 that is exactly where OG stood: the meeting happened on
 * the 19th and 20th, the newest past `events` row said **21 July**, and every
 * "since the last meeting" window in the app was therefore five weeks wide.
 * Nat's report was that her check-in's "done this cycle" list still showed
 * things she had finished a month and a half ago, month after month — twenty
 * items where ten were hers this cycle.
 *
 * `meetings` holds the night itself: the row written when a meeting is
 * recorded, transcribed or sealed. It cannot go backwards, because it is a
 * record rather than a plan — but a meeting nobody recorded leaves no row.
 *
 * So take the later of the two. Whichever table remembers, the cycle is right.
 */
export async function getCycleStart(communityId: string, beforeDate: string): Promise<Date> {
  const [scheduled, held] = await Promise.all([
    supabase
      .from('events')
      .select('event_date')
      .eq('community_id', communityId)
      .eq('event_type', 'meeting')
      .lt('event_date', beforeDate)
      .order('event_date', { ascending: false })
      .limit(1),
    supabase
      .from('meetings')
      .select('date')
      .eq('community_id', communityId)
      .lt('date', beforeDate)
      .order('date', { ascending: false })
      .limit(1),
  ]);

  const scheduledDate = (scheduled.data?.[0] as { event_date?: string } | undefined)?.event_date;
  const heldDate = (held.data?.[0] as { date?: string } | undefined)?.date;
  // Plain YYYY-MM-DD strings, so the later one sorts later as text too.
  const lastMeeting = [scheduledDate, heldDate]
    .filter((value): value is string => !!value)
    .sort()
    .pop();

  if (lastMeeting) {
    const [year, month, day] = lastMeeting.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - 35);
  return fallback;
}

/** The active "{Potential} HIVE Hang Ideas" board, if it exists. */
export async function getHangIdeasBoard(communityId: string): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('board_categories')
    .select('id, name, status')
    .eq('community_id', communityId)
    .ilike('name', '%hang%');
  const board = ((data ?? []) as { id: string; status?: string | null }[])
    .find((row) => !row.status || row.status === 'active');
  return board ?? null;
}

// Check-in hang suggestions post straight onto the hang-ideas board — the
// surveys, the deck, and the boards are one loop. Deduped by title so a
// re-submitted check-in doesn't double-post.
export async function postHangSuggestionToBoard(input: {
  communityId: string;
  userId: string;
  suggestion: string;
  monthLabel: string;
}): Promise<boolean> {
  const suggestion = input.suggestion.trim();
  if (!suggestion) return false;

  const board = await getHangIdeasBoard(input.communityId);
  if (!board) return false;

  const title = suggestion.length > 80 ? `${suggestion.slice(0, 77)}…` : suggestion;
  const { data: existing } = await supabase
    .from('board_posts')
    .select('id')
    .eq('category_id', board.id)
    .ilike('title', title)
    .limit(1);
  if ((existing ?? []).length > 0) return false;

  const { error } = await (supabase as any).from('board_posts').insert({
    community_id: input.communityId,
    category_id: board.id,
    author_id: input.userId,
    title,
    content: `💡 Suggested in the ${input.monthLabel} check-in${suggestion === title ? '' : `: ${suggestion}`}`,
  });
  if (error) {
    console.warn('Hang suggestion board post skipped:', error);
    return false;
  }
  return true;
}

// Home shows the halfway nudge for a stretch of days, so it needs to know when
// you've actually done it — there's no survey row for the short flow, the way
// the pre-meeting check-in has one. Keyed by month: one halfway pass per cycle
// is the whole idea.
export const getHalfwayDoneKey = (communityId: string, userId: string) =>
  `the-hive:halfway-done:${communityId}:${userId}:${new Date().toISOString().slice(0, 7)}`;
