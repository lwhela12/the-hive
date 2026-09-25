import { parseTimeInput } from './timeInput';

export type MeetingPaceDeadline = {
  at: Date;
  source: 'meeting' | 'member';
};

/** The next end that matters to the room, without changing the HIVE's saved end. */
export function meetingPaceDeadline(
  now: Date,
  meetingEnd: string,
  memberHardOuts: Array<string | null | undefined>,
): MeetingPaceDeadline | null {
  const candidate = (raw: string | null | undefined, source: MeetingPaceDeadline['source']) => {
    const time = parseTimeInput(raw);
    if (!time) return null;
    const [hour, minute] = time.split(':').map(Number);
    const at = new Date(now);
    at.setHours(hour, minute, 0, 0);
    return at.getTime() > now.getTime() ? { at, source } : null;
  };

  const deadlines = [
    candidate(meetingEnd, 'meeting'),
    ...memberHardOuts.map((time) => candidate(time, 'member')),
  ].filter((value): value is MeetingPaceDeadline => value !== null);

  return deadlines.sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null;
}

export function minutesUntil(now: Date, deadline: MeetingPaceDeadline | null): number {
  return deadline ? Math.max(0, Math.ceil((deadline.at.getTime() - now.getTime()) / 60_000)) : 0;
}

export function pacePerStop(minutes: number, stops: number): string | null {
  if (minutes <= 0 || stops <= 0) return null;
  const each = minutes / stops;
  return each < 1 ? 'under 1 min' : `≈${Math.floor(each)} min`;
}
