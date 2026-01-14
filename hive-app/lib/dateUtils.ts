/**
 * Date formatting utilities for consistent American date format (MM-DD-YYYY)
 */

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a date for medium display (e.g., "Jan 15, 2025")
 */
export function formatDateMedium(date: string | Date): string {
  const d = parseDateString(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Parse an American format date (MM-DD-YYYY) to ISO format (YYYY-MM-DD) for database storage
 */
export function parseAmericanDate(dateStr: string): string | null {
  // Handle MM-DD-YYYY format
  const americanMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
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
 * Format a time string (HH:MM:SS or HH:MM) to 12-hour format (e.g., "7:00 PM")
 */
export function formatTime(time: string): string {
  const [hoursStr, minutesStr] = time.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = minutesStr || '00';
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${period}`;
}
