import type { SurveyQuestion } from '../types';

export const PLATE_QUESTION: SurveyQuestion = {
  id: 'q_plate', text: 'How much is on your plate right now?', type: 'choice', required: false,
  options: ['🍽️ Plenty of room — hand me something', "🥄 A bit on there, and I've got room for this", "🍲 Pretty full — I'll take one small thing", '🫙 Full to the brim — I want to listen this time'],
};
export const FEELING_QUESTION: SurveyQuestion = {
  id: 'q_feeling_today',
  text: 'How are you feeling coming into this meeting?',
  type: 'choice',
  required: false,
  options: [
    '😊 Great — bring it on!',
    '😌 Good & steady',
    '😴 Tired, but here',
    '🫠 Overwhelmed — please go gently',
    '🤒 Under the weather — love me from a distance',
    '💛 Sad or low — extra hugs welcome',
    '🖤 Sad or low — love me from a distance',
    '🌀 All over the place',
  ],
};
export const FEELING_NOTE_QUESTION: SurveyQuestion = {
  id: 'q_feeling_note',
  text: 'Anything you want the room to know? (Optional)',
  type: 'short',
  required: false,
};
export const HD_FOCUS_QUESTION: SurveyQuestion = {
  id: 'q_hd_wish',
  text: 'Choose your HD wish for this month',
  type: 'long',
  required: false,
};
const standardizedArrivalIds = new Set([
  'q_plate',
  'q_energy_level',
  'q_energy_mode',
  FEELING_QUESTION.id,
  FEELING_NOTE_QUESTION.id,
]);
const productionHomeworkIds = new Set([
  'q_show_progress',
  'q_on_board',
  'q_pictures',
  'q_show_obstacles',
  'q_show_next',
  'q_biggest_question',
  'q_pop_progress',
  'q_pop_obstacles',
  'q_pop_priorities',
  'q_hd_wish',
]);
/** Presentation only: persisted survey rows and old answers remain untouched; never convert energy to capacity. */
export function checkInQuestions(questions: SurveyQuestion[], month = false, hiveSlug?: string | null): SurveyQuestion[] {
  const productionMeeting = !month && ['show', 'production'].includes((hiveSlug ?? '').trim().toLowerCase());
  const alreadyHasHdFocus = questions.some(q => q.id === HD_FOCUS_QUESTION.id);
  const presented = questions.filter(q => (
    !standardizedArrivalIds.has(q.id)
    && q.id !== 'q_contact'
    // Production HIVE is one shared project. Its assigned jobs and their live
    // status are already drawn above the questions; asking members to retype
    // the same work into four prose boxes made the check-in unusable and left
    // a second, hidden account of the project. Keep the stored answers, retire
    // these fields from Before we meet, and let the board and to-do rows remain
    // the source of truth.
    && (!productionMeeting || !productionHomeworkIds.has(q.id))
    // The live roster above the questions already brings completed and open
    // work to the member. A second blank "what moved" box turns that useful
    // pre-seed into homework, so the old progress question is presentation-only
    // retired. Keep stored answers and stable ids untouched.
    && !['q_pop_progress', 'q_show_progress'].includes(q.id)
    // One room-help question is enough. `q_pop_priorities` is the surviving
    // free-text answer in End of the month. Before a meeting, the actionable
    // version is the member's HD focus below.
    && q.id !== 'q_pop_obstacles'
    && (month || q.id !== 'q_pop_priorities' || !alreadyHasHdFocus)
  )).map(q => {
    if (month && ['q_newsletter', 'q_eom_newsletter', 'q_shoutout'].includes(q.id)) return { ...q, text: 'Anything for the Buzz? Upcoming shows, events, a plug, or a shout-out for someone — include names, dates and links.' };
    if (month && /how (did|has|is).*(month|things)|how.*month.*(go|been)/i.test(q.text)) return { ...q, text: 'How are things going so far this month?' };
    if (q.id === 'q_attendance' && q.options) return {
      ...q,
      options: q.options.map(option => /missing this one/i.test(option)
        ? '😢 Missing this one — please email me the recap'
        : option),
    };
    if (q.id === 'q_pop_priorities') return month
      ? { ...q, text: 'What should the room help you move forward?' }
      : { ...HD_FOCUS_QUESTION };
    if (q.id === 'q_hd_wish') return { ...q, text: HD_FOCUS_QUESTION.text };
    if (q.id === 'q_hive_help_recap') return { ...q, type: 'focus' as const, text: 'How did this month’s HIVE Help go?' };
    return q;
  });

  // The plate picker sits immediately above the survey. These two compact,
  // optional asks complete the arrival context and already render on the
  // member's card, so the room can respond with care before business starts.
  if (!month) {
    presented.unshift({ ...FEELING_QUESTION }, { ...FEELING_NOTE_QUESTION });
  }

  // Every Before we meet check-in arrives at the HummDinger with one chosen
  // HD. Older HIVE question rows do not all contain that field, so add the
  // shared picker after the hard-out question when there is nothing to replace.
  // This changes presentation only; persisted survey rows and old answers stay
  // untouched.
  // Production's HummDinger is the shared show and its assigned jobs. The
  // personal HD picker belongs to the individual-goal HIVEs.
  if (!month && !productionMeeting && !presented.some(q => q.id === HD_FOCUS_QUESTION.id)) {
    const hardOutIndex = presented.findIndex(q => q.id === 'q_hard_out');
    presented.splice(hardOutIndex >= 0 ? hardOutIndex + 1 : 0, 0, { ...HD_FOCUS_QUESTION });
  }
  return presented;
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
