const MONTHS = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dayDistance = (from: string, to: string) => Math.round(
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
);

/**
 * A range is current until its final day. Its start is history, not a missed
 * deadline — this is the distinction that keeps a holiday from becoming late
 * while the person is still away.
 */
export function whatsNextDateLabel(start: string, today: string, end?: string | null): string {
  const last = end && end > start ? end : start;
  if (start <= today && today <= last) return start === last ? 'Today' : 'Now';

  const distance = today > last ? -dayDistance(last, today) : dayDistance(today, start);
  if (distance === 1) return 'Tomorrow';
  if (distance === -1) return '1 day late';
  if (distance < 0) return `${-distance} days late`;

  const [year, month, day] = start.split('-').map(Number);
  return `${DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]} ${MONTHS[month - 1]} ${day}`;
}

export function whatsNextIsOverdue(start: string, today: string, end?: string | null): boolean {
  return (end && end > start ? end : start) < today;
}
