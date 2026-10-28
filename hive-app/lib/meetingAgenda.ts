/** Apply one meeting's omissions to both navigation and the outline. */
export function meetingDeck<T extends { slides: string[]; agenda: { key: string }[] }>(
  base: T, meetingId: string | undefined, omissions?: Record<string, readonly string[]>,
): T {
  const skipped = meetingId ? omissions?.[meetingId] : undefined;
  if (!skipped?.length) return base;
  return { ...base, slides: base.slides.filter(key => !skipped.includes(key)), agenda: base.agenda.filter(item => !skipped.includes(item.key)) };
}

/** A skipped shared slide lands on the next available part of this meeting. */
export function meetingSlidePosition(key: string, original: readonly string[], visible: readonly string[]) {
  const direct = visible.indexOf(key);
  if (direct >= 0) return direct;
  const oldIndex = original.indexOf(key);
  if (oldIndex < 0) return -1;
  const next = original.slice(oldIndex + 1).find(candidate => visible.includes(candidate));
  return next ? visible.indexOf(next) : visible.length - 1;
}
