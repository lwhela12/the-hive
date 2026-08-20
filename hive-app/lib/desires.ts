/**
 * Desires a meeting surfaced, shared between the meeting summary and the
 * profile's wishes panel.
 *
 * `apply-meeting-notes` hears "Charlee dreams of a sticker show" in a
 * transcript and files it as `wishes_surfaced` on the meeting's summary —
 * words only, no rows. Two screens then offer it to the person it belongs to:
 * the Meeting Summary (its "Desires identified" section) and, since
 * 2026-08-19, the person's own wishes panel — Nat: *"those could auto populate
 * in the HD wishes in italics... yep add it, or refine it with Clive, or X to
 * get rid of it."*
 *
 * Both screens must agree on what one desire is CALLED, or a wish added on one
 * screen keeps being offered on the other. That name is `desireKey`.
 */

export type SurfacedDesire = { person_name: string; description: string };

/**
 * A name for one desire that survives the list being rebuilt.
 *
 * Position is no good as a name: reading the notes again renumbers everything,
 * and the fourth desire on Tuesday is the second one on Wednesday. Whose it is
 * and what it says do not move.
 */
export const desireKey = (desire: SurfacedDesire) => {
  const flatten = (text: string) =>
    (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${flatten(desire.person_name)}::${flatten(desire.description).slice(0, 160)}`;
};

/**
 * Whether the name a meeting used means this member. A meeting says "Charlee"
 * where the profile says "Charlee Shae" — first names are how a room refers
 * to people, so a first-name hit counts. Same rule the Meeting Summary's
 * `memberCalled` applies to the whole member list.
 */
export function desireIsFor(personName: string, memberName: string | null | undefined): boolean {
  const clean = (text: string | null | undefined) =>
    (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const wanted = clean(personName);
  const mine = clean(memberName);
  if (!wanted || !mine) return false;
  if (wanted === mine) return true;
  const wantedFirst = wanted.split(' ')[0];
  const mineFirst = mine.split(' ')[0];
  return !!mineFirst && (mineFirst === wanted || wantedFirst === mineFirst);
}

/**
 * An insight a meeting caught — the worth-keeping line somebody said, offered
 * back to them the way a surfaced desire is (Nat, 2026-08-19: "if you say
 * something clever... I wonder if those should auto populate in here too").
 * Same contract as desires: `apply-meeting-notes` writes `insights_caught`
 * onto the meeting summary, `insights_filed` / `insights_dismissed` are the
 * ledgers, and the key survives the list being rebuilt.
 */
export type CaughtInsight = { person_name: string; insight: string };

export const insightKey = (item: CaughtInsight) => {
  const flatten = (text: string) =>
    (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${flatten(item.person_name)}::${flatten(item.insight).slice(0, 160)}`;
};

/**
 * The stored summary as an object, or null when it is plain text. Strips the
 * model's occasional ```json fences — same tolerance `MeetingSummary` has.
 */
export function parseStoredSummary(summary: string | null | undefined): Record<string, unknown> | null {
  const raw = (summary ?? '')
    .trim()
    .replace(/^```json\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .replace(/^```\s*\n?/, '')
    .replace(/\n?```\s*$/, '');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // An older meeting kept plain text here.
  }
  return null;
}
