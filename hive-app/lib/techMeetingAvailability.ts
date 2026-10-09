import { formatDateShort, formatTimeRange } from './dateUtils';
import { parseTimeInput } from './timeInput';

export type MeetingTimeOption = { date: string; start: string; end: string };
export type MeetingTimeAnswer = {
  meetingId: string;
  choices: Record<string, 'yes' | 'maybe' | 'no'>;
  favorite?: string;
  suggestion?: string;
};

export type TechMeetingTimePoll = { meetingId: string; options: MeetingTimeOption[] };

export const MEETING_TIME_ANSWER_KEY = 'q_next_meeting_times';

export function meetingTimeId(option: MeetingTimeOption): string {
  return `${option.date}T${option.start}`;
}

export function meetingTimeLabel(option: MeetingTimeOption): string {
  const [year, month, day] = option.date.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday}, ${formatDateShort(option.date)} · ${formatTimeRange(option.start, option.end)} PT`;
}

export function normalizeMeetingTimeOptions(raw: unknown): MeetingTimeOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row): MeetingTimeOption[] => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const date = typeof item.date === 'string' ? item.date : '';
    const start = parseTimeInput(typeof item.start === 'string' ? item.start : '');
    const end = parseTimeInput(typeof item.end === 'string' ? item.end : '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !start || !end || start >= end) return [];
    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return [];
    return [{ date, start, end }];
  }).slice(0, 5);
}

export function readMeetingTimePoll(notes: unknown, meetingId: string | null | undefined): TechMeetingTimePoll | null {
  if (!notes || typeof notes !== 'object' || !meetingId) return null;
  const raw = (notes as Record<string, unknown>).techMeetingTimePoll;
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (item.meetingId !== meetingId) return null;
  const options = normalizeMeetingTimeOptions(item.options);
  return options.length ? { meetingId, options } : null;
}

export function readMeetingTimeAnswer(raw: unknown, meetingId: string): MeetingTimeAnswer | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const answer = raw as Record<string, unknown>;
  if (answer.meetingId !== meetingId || !answer.choices || typeof answer.choices !== 'object' || Array.isArray(answer.choices)) return null;
  const choices: MeetingTimeAnswer['choices'] = {};
  for (const [key, value] of Object.entries(answer.choices as Record<string, unknown>)) {
    if (value === 'yes' || value === 'maybe' || value === 'no') choices[key] = value;
  }
  return {
    meetingId,
    choices,
    favorite: typeof answer.favorite === 'string' ? answer.favorite : undefined,
    suggestion: typeof answer.suggestion === 'string' ? answer.suggestion.trim() : undefined,
  };
}

export function tallyMeetingTimes(
  poll: TechMeetingTimePoll,
  memberAnswers: unknown[],
) {
  const ids = new Set(poll.options.map(meetingTimeId));
  const answers = memberAnswers.map(raw => readMeetingTimeAnswer(raw, poll.meetingId)).filter((item): item is MeetingTimeAnswer => !!item);
  const responded = answers.filter(item => Object.keys(item.choices).some(id => ids.has(id)) || !!item.suggestion).length;
  return {
    responded,
    rows: poll.options.map(option => {
      const id = meetingTimeId(option);
      return {
        option,
        yes: answers.filter(answer => answer.choices[id] === 'yes').length,
        maybe: answers.filter(answer => answer.choices[id] === 'maybe').length,
        no: answers.filter(answer => answer.choices[id] === 'no').length,
        favorite: answers.filter(answer => answer.favorite === id && (answer.choices[id] === 'yes' || answer.choices[id] === 'maybe')).length,
      };
    }),
    suggestions: answers.map(answer => answer.suggestion).filter((item): item is string => !!item),
  };
}
