/** Date and time display rules shared by every member-facing surface. */

const SHORT_MONTHS = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

/**
 * Parse a date string without timezone conversion
 */
function parseDateString(date: string | Date): Date {
  // For date-only strings (YYYY-MM-DD), parse without timezone conversion
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  }
  return typeof date === 'string' ? new Date(date) : date;
}

/**
 * Format a date string or Date object to American format MM-DD-YYYY
 */
export function formatDate(date: string | Date): string {
  const d = parseDateString(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}-${day}-${year}`;
}

/**
 * Format a date for display with month name (e.g., "January 15, 2025")
 */
export function formatDateLong(date: string | Date): string {
  const d = parseDateString(date);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Format a date for short display (e.g., "Jan 15")
 */
export function formatDateShort(date: string | Date): string {
  const d = parseDateString(date);
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Format an inclusive date range the way HIVE says it (e.g., "Sept 4-12" or
 * "Sept 30-Oct 2"). Falls back to the single-date format when there is no
 * end date or the range is degenerate.
 */
export function formatDateRangeShort(start: string | Date, end?: string | Date | null): string {
  if (!end) return formatDateShort(start);
  const startDate = parseDateString(start);
  const endDate = parseDateString(end);
  if (endDate.getTime() <= startDate.getTime()) return formatDateShort(start);

  const sameMonth = startDate.getMonth() === endDate.getMonth()
    && startDate.getFullYear() === endDate.getFullYear();
  return sameMonth
    ? `${formatDateShort(startDate)}-${endDate.getDate()}`
    : `${formatDateShort(startDate)}-${formatDateShort(endDate)}`;
}

/**
 * Format a date for medium display (e.g., "Jan 15, 2025")
 */
export function formatDateMedium(date: string | Date): string {
  const d = parseDateString(date);
  return `${formatDateShort(d)}, ${d.getFullYear()}`;
}

/** A short date with a human clock for timestamps: "Sept 7, 2:30pm". */
export function formatDateTimeShort(date: string | Date): string {
  const d = parseDateString(date);
  if (Number.isNaN(d.getTime())) return String(date);
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${formatDateShort(d)}, ${formatTime(clock)}`;
}

/**
 * Parse an American format date (MM-DD-YYYY or MM/DD/YYYY) to ISO format (YYYY-MM-DD) for database storage
 */
export function parseAmericanDate(dateStr: string): string | null {
  // Handle MM-DD-YYYY and MM/DD/YYYY formats
  const americanMatch = dateStr.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (americanMatch) {
    const [, month, day, year] = americanMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Handle YYYY-MM-DD format (already ISO)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return dateStr;
  }

  return null;
}

/**
 * Convert ISO date (YYYY-MM-DD) to American format (MM-DD-YYYY) for display in input
 */
export function isoToAmerican(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${month}-${day}-${year}`;
  }
  return isoDate;
}

/**
 * Format a time string (HH:MM:SS or HH:MM) as compact 12-hour time ("7pm").
 * Editable clock fields deliberately keep `humanTimeInput`'s fuller "7:00 PM"
 * shape; this helper is for reading, never typing.
 */
export function formatTime(time: string): string {
  const [hoursStr, minutesStr] = time.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = minutesStr || '00';
  const period = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return minutes === '00' ? `${displayHours}${period}` : `${displayHours}:${minutes}${period}`;
}

/**
 * When it starts and when it finishes — "5-7pm".
 *
 * Nat, 2026-08-21: *"i couldnt add window, like 5-7, i could only put in
 * 5pm."* Meetings had a start and nothing else, so members were told when to
 * arrive and left to guess how long to hold (migration 202).
 *
 * The am/pm is said once when both ends share it, because "5pm-7pm"
 * is the same fact written twice. With no end time this is exactly
 * `formatTime`, so a meeting nobody has given an end to reads as it always did.
 */
export function formatTimeRange(start: string, end?: string | null): string {
  if (!end) return formatTime(start);

  const startText = formatTime(start);
  const endText = formatTime(end);
  const startPeriod = startText.slice(-2);
  const endPeriod = endText.slice(-2);

  if (startPeriod === endPeriod) {
    return `${startText.slice(0, -2)}-${endText}`;
  }
  return `${startText}-${endText}`;
}
