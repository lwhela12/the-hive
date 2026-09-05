// Wall-clock values only: never construct a Date or change a timezone here.
export function parseTimeInput(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? '';
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const second = Number(match[3] ?? 0);
  const period = match[4]?.toLowerCase();
  if (minute > 59 || second > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (period) hour = hour % 12 + (period === 'pm' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function humanTimeInput(value: string | null | undefined): string {
  const time = parseTimeInput(value);
  if (!time) return value ?? '';
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function timeWindowError(start: string, end: string, required = false): string | null {
  const a = parseTimeInput(start), b = parseTimeInput(end);
  if ((required || start.trim()) && !a) return 'Enter a start time like 6:00 PM.';
  if (end.trim() && !b) return 'Enter an end time like 8:00 PM.';
  if (b && !a) return 'Add a start time as well.';
  if (a && b && b <= a) return 'The end time should be after the start time.';
  return null;
}
