// Smart event icons (Nat's moonshot): the emoji reads the event instead of
// defaulting to a pushpin. Types win first, then title keywords.
export function getEventEmoji(event: {
  title?: string | null;
  event_type?: string | null;
  end_date?: string | null;
}): string {
  if (event.event_type === 'birthday') return '🎂';
  if (event.event_type === 'meeting') return '🐝';

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

// Family-icon counterpart: returns a HiveIcon name when the event type has
// earned its own drawing; null falls back to the smart emoji.
//
// The 'crown' went with Queen Bee, retired April 2026. Nothing maps to it now,
// so it is gone from the list of icons an event can ask for.
export function getEventHiveIcon(event: {
  title?: string | null;
  event_type?: string | null;
  end_date?: string | null;
}): 'cake' | 'bee' | 'suitcase' | 'note' | 'pin' | null {
  if (event.event_type === 'birthday') return 'cake';
  if (event.event_type === 'meeting') return 'bee';
  const title = (event.title ?? '').toLowerCase();
  if (/\b(out of town|travel|traveling|trip|away|galavant|vacation|flight)\b/.test(title) || event.end_date) return 'suitcase';
  if (/\b(writer|writers|writing)\b/.test(title)) return 'note';
  if (/\b(bday|birthday)\b/.test(title)) return 'cake';
  if (getEventEmoji(event) === '📌') return 'pin';
  return null;
}

/**
 * Is this person actually invited, or are they only allowed to know it exists?
 *
 * Nat, 2026-08-05: *"we want everyone to be able to see when our meetings are,
 * (everyone HIVE wide) but i dont want everyone to be able to join the meet."*
 *
 * Seeing and coming were one column until migration 148. Now an event can be
 * visible HIVE-Wide while the address and the joining link stay with the HIVE
 * whose meeting it is — which is the difference between telling the other HIVEs
 * you exist and handing them your front door.
 *
 * Events written before that migration have no invite rung of their own, and
 * for those the visibility genuinely WAS the invitation, so it stands in.
 */
export function isInvitedToEvent(
  event: { visibility?: string | null; invited_scope?: string | null; community_id?: string | null },
  myCommunityIds: string[],
): boolean {
  const rung = event.invited_scope ?? event.visibility ?? 'members';
  // Anyone at all, and anyone in any HIVE — everybody reading the app is in one.
  if (rung === 'public' || rung === 'all_hives') return true;
  // This HIVE only: you have to be in the HIVE whose event it is.
  if (!event.community_id) return true;
  return myCommunityIds.includes(event.community_id);
}
