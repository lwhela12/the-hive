import { getMeaningfulActionItemText } from './actionItemDisplay';

/**
 * Meeting Helper selection used when a live OG note is a brand-new ask.
 *
 * A sentinel keeps "make a wish" distinct from `null`, which means the note
 * is only a to-do and must not touch any wish. Real wish ids are UUIDs, so the
 * value can never collide with a database row.
 */
export const NEW_MEETING_WISH_ID = '__new_meeting_wish__';

/**
 * The wish is the ask, while the leading @words are only task routing.
 * Keep the person's actual meeting words instead of asking Nat to rewrite the
 * room mid-conversation; the member can polish the wish later if they want.
 */
export function meetingWishCopy(note: string): { title: string; description: string } {
  const description = getMeaningfulActionItemText(note).replace(/\s+/g, ' ').trim();
  const compact = description.replace(/[.!?]+$/, '').trim();
  const title = compact.length > 78 ? `${compact.slice(0, 75).trimEnd()}…` : compact;
  return { title, description };
}
