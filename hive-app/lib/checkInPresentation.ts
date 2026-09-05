import type { SurveyQuestion } from '../types';

export const PLATE_QUESTION: SurveyQuestion = {
  id: 'q_plate', text: 'How much is on your plate right now?', type: 'choice', required: false,
  options: ['🍽️ Plenty of room — hand me something', "🥄 A bit on there, and I've got room for this", "🍲 Pretty full — I'll take one small thing", '🫙 Full to the brim — I want to listen this time'],
};
const capacityIds = new Set(['q_plate', 'q_energy_level', 'q_energy_mode', 'q_feeling_today']);
/** Presentation only: stable IDs/old answers remain untouched; never convert energy to capacity. */
export function checkInQuestions(questions: SurveyQuestion[], month = false): SurveyQuestion[] {
  return questions.filter(q => !capacityIds.has(q.id) && q.id !== 'q_contact').map(q => {
    if (month && ['q_newsletter', 'q_eom_newsletter', 'q_shoutout'].includes(q.id)) return { ...q, text: 'Anything for the Buzz? Upcoming shows, events, a plug, or a shout-out for someone — include names, dates and links.' };
    if (month && /how (did|has|is).*(month|things)|how.*month.*(go|been)/i.test(q.text)) return { ...q, text: 'How are things going so far this month?' };
    if (['q_pop_progress', 'q_show_progress'].includes(q.id)) return { ...q, text: 'What else moved forward? Use your completed work and current goals as a reminder; add findings, changes, or credit for someone who helped.' };
    if (q.id === 'q_pop_priorities') return { ...q, text: 'What should the room be ready to help with? Your current goal, blocker and the outcome you want.' };
    if (q.id === 'q_hive_help_recap') return { ...q, type: 'long' as const, text: 'Any reflection on this HIVE’s Help activity? Completion is already handled in your roster — no need to report it twice.' };
    return q;
  });
}
export type MeetingPreview = { id: string; community_id: string; event_date: string; event_time?: string | null };
export function meetingLabel(event?: MeetingPreview): string {
  if (!event) return 'No meeting scheduled yet';
  const date = new Date(`${event.event_date.slice(0, 10)}T12:00:00`);
  const day = Number.isNaN(date.getTime()) ? event.event_date : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const match = /^(\d{2}):(\d{2})/.exec(event.event_time ?? '');
  const time = match ? `${Number(match[1]) % 12 || 12}:${match[2]} ${Number(match[1]) >= 12 ? 'PM' : 'AM'} PT` : 'Time to be confirmed';
  return `${day} · ${time}`;
}
