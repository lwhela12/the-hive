// Smart event icons (Nat's moonshot): the emoji reads the event instead of
// defaulting to a pushpin. Types win first, then title keywords.
export function getEventEmoji(event: {
  title?: string | null;
  event_type?: string | null;
  end_date?: string | null;
}): string {
  if (event.event_type === 'birthday') return '🎂';
  if (event.event_type === 'meeting') return '🐝';
  if (event.event_type === 'queen_bee') return '👑';

  const title = (event.title ?? '').toLowerCase();
  if (/\b(out of town|travel|traveling|trip|away|galavant|vacation|flight)\b/.test(title) || event.end_date) return '✈️';
  if (/\b(pool|swim|beach|lake|river)\b/.test(title)) return '🏖️';
  if (/\b(bday|birthday)\b/.test(title)) return '🎂';
  if (/\b(dinner|brunch|lunch|potluck|bbq|cookout|taste|food)\b/.test(title)) return '🍽️';
  if (/\b(writer|writers|writing)\b/.test(title)) return '✍️';
  if (/\b(game|games|trivia)\b/.test(title)) return '🎲';
  if (/\b(show|concert|performance|drag|theater|theatre|comedy|open mic)\b/.test(title)) return '🎭';
  if (/\b(movie|film)\b/.test(title)) return '🎬';
  if (/\b(art|craft|paint|resin|vision board|crochet|macrame|macramé)\b/.test(title)) return '🎨';
  if (/\b(hike|hiking|walk|park|camp|camping)\b/.test(title)) return '🥾';
  return '📌';
}
