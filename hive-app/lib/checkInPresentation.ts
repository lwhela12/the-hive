import type { SurveyQuestion } from '../types';

export const PLATE_QUESTION: SurveyQuestion = {
  id: 'q_plate', text: 'How much is on your plate right now?', type: 'choice', required: false,
  options: ['🍽️ Plenty of room — hand me something', "🥄 A bit on there, and I've got room for this", "🍲 Pretty full — I'll take one small thing", '🫙 Full to the brim — I want to listen this time'],
};
const capacityIds = new Set(['q_plate', 'q_energy_level', 'q_energy_mode', 'q_feeling_today']);
/** Presentation only: stable IDs/old answers remain untouched; never convert energy to capacity. */
export function checkInQuestions(questions: SurveyQuestion[], month = false): SurveyQuestion[] {
  return questions.filter(q => (
    !capacityIds.has(q.id)
    && q.id !== 'q_contact'
    // The live roster above the questions already brings completed and open
    // work to the member. A second blank "what moved" box turns that useful
    // pre-seed into homework, so the old progress question is presentation-only
    // retired. Keep stored answers and stable ids untouched.
    && !['q_pop_progress', 'q_show_progress'].includes(q.id)
    // One room-help question is enough. `q_pop_priorities` is the surviving
    // answer because Meeting Helper already reads it onto the member's POP.
    && q.id !== 'q_pop_obstacles'
  )).map(q => {
    if (month && ['q_newsletter', 'q_eom_newsletter', 'q_shoutout'].includes(q.id)) return { ...q, text: 'Anything for the Buzz? Upcoming shows, events, a plug, or a shout-out for someone — include names, dates and links.' };
    if (month && /how (did|has|is).*(month|things)|how.*month.*(go|been)/i.test(q.text)) return { ...q, text: 'How are things going so far this month?' };
    if (q.id === 'q_attendance' && q.options) return {
      ...q,
      options: q.options.map(option => /missing this one/i.test(option)
        ? '😢 Missing this one — please email me the recap'
        : option),
    };
    if (q.id === 'q_pop_priorities') return { ...q, text: 'What should the room help you move forward?' };
    if (q.id === 'q_hive_help_recap') return { ...q, type: 'focus' as const, text: 'How did this month’s HIVE Help go?' };
    return q;
  });
}
export type MeetingPreview = { id: string; community_id: string; event_date: string; event_time?: string | null };
export const pacificToday = (now = new Date()): string => now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

export function meetingPriority(event: MeetingPreview | undefined, today = pacificToday()): 'today' | 'tomorrow' | 'future' | 'missing' {
  if (!event?.event_date) return 'missing';
  const day = event.event_date.slice(0, 10);
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  if (day === today) return 'today';
  if (day === next.toISOString().slice(0, 10)) return 'tomorrow';
  return day > today ? 'future' : 'missing';
}

/** Presentation only: all member HIVEs remain available; no response expiry. */
export function groupCheckInHives<T extends { community_id: string }>(members: T[], meetings: MeetingPreview[], today = pacificToday()) {
  const ordered = members.map(member => ({ member, event: meetings.filter(event => event.community_id === member.community_id && event.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time ?? '99').localeCompare(b.event_time ?? '99') || a.id.localeCompare(b.id))[0] }))
    .sort((a, b) => (a.event?.event_date ?? '9999').localeCompare(b.event?.event_date ?? '9999') || (a.event?.event_time ?? '99').localeCompare(b.event?.event_time ?? '99') || a.member.community_id.localeCompare(b.member.community_id));
  return {
    prominent: ordered.filter(({ event }) => ['today', 'tomorrow'].includes(meetingPriority(event, today))),
    future: ordered.filter(({ event }) => meetingPriority(event, today) === 'future'),
    missing: ordered.filter(({ event }) => meetingPriority(event, today) === 'missing'),
  };
}

export function meetingLabel(event?: MeetingPreview, today = pacificToday()): string {
  if (!event?.event_date) return 'No meeting scheduled yet';
  const date = new Date(`${event.event_date.slice(0, 10)}T12:00:00Z`);
  const priority = meetingPriority(event, today);
  const calendarDay = Number.isNaN(date.getTime()) ? event.event_date : date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  const day = priority === 'today' ? `Today · ${calendarDay}` : priority === 'tomorrow' ? `Tomorrow · ${calendarDay}` : calendarDay;
  const match = /^(\d{2}):(\d{2})/.exec(event.event_time ?? '');
  const time = match ? `${Number(match[1]) % 12 || 12}:${match[2]} ${Number(match[1]) >= 12 ? 'PM' : 'AM'} PT` : 'Time to be confirmed';
  return `${day} · ${time}`;
}

/** Seven Pacific calendar days including today; a suggestion window, never an access gate. */
export function upcomingCheckIns<T extends { community_id: string }>(
  members: T[], meetings: MeetingPreview[], saved: Record<string, unknown>,
  completedHive: string, today = pacificToday(),
): { member: T; event: MeetingPreview }[] {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  const until = end.toISOString().slice(0, 10);
  const grouped = groupCheckInHives(members, meetings, today);
  return [...grouped.prominent, ...grouped.future]
    .filter((item): item is { member: T; event: MeetingPreview } => !!item.event
      && item.member.community_id !== completedHive
      && !Object.prototype.hasOwnProperty.call(saved, item.member.community_id)
      && item.event.event_date < until);
}
