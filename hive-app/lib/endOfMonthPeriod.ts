/** One calendar for the form, its receipt, and the quarter review. */
export function pacificCalendarDate(instant: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(instant);
  const value = (part: string) => Number(parts.find(item => item.type === part)?.value);
  return new Date(value('year'), value('month') - 1, value('day'), 12);
}

export function endOfMonthContext(instant: Date) {
  const today = pacificCalendarDate(instant);
  // The month-end door remains useful for the first week of the next month.
  // Keep the previous month's receipt and its quarter questions together.
  const reviewDate = today.getDate() <= 7
    ? new Date(today.getFullYear(), today.getMonth(), 0, 12)
    : today;
  const period = `${reviewDate.getFullYear()}-${String(reviewDate.getMonth() + 1).padStart(2, '0')}`;
  return { period, reviewDate };
}
