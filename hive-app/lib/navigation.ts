/**
 * Every place you can go in HIVE, listed once.
 *
 * Two decisions from Nat on 2026-08-03, both about the same problem — that the
 * app keeps growing and the navigation kept being hand-maintained in two files
 * that drifted apart.
 *
 * ONE: emoji, everywhere. "I feel like I'm constantly fighting with you about
 * the emojis... I take it back. Every time we expand, this is going to be
 * harder." She's right, and the drawer proved it — Clive, Home, Boards, Messages
 * and Meetings wore the hand-drawn HIVE icons while The Buzz wore 📰 and Honey
 * Pot wore both at once. Every new feature meant either commissioning a drawing
 * or quietly breaking the set.
 *
 * This retires the hand-drawn icon family from navigation. It was lovely and it
 * was hers, so it's worth saying plainly rather than letting it disappear: the
 * honey-drop icons still exist in components/ui, and nothing stops them coming
 * back somewhere they can be admired rather than scanned past at 22 pixels.
 *
 * TWO: one list, not two. The tab bar and the drawer each kept their own copy,
 * which is why Admin could vanish from one and survive in the other. Both now
 * read this.
 *
 * ADDING A DESTINATION: put it here, pick an emoji, done. It appears in the rail
 * in this order, and nowhere else needs editing.
 */

export type NavGate = 'everyone' | 'admin' | 'owner';

export type NavDestination = {
  key: string;
  label: string;
  /** Standard emoji. Every platform already has it; nobody has to draw one. */
  emoji: string;
  route: string;
  /** Who sees it at all. */
  gate: NavGate;
  /** Which live count rides on it, if any. */
  badge?: 'dms';
  /** A rule above this item in the rail, to group things loosely. */
  dividerBefore?: boolean;
};

/**
 * The rail reads top to bottom as zoom levels, then pages, then the god view —
 * Nat's ordering, arrived at out loud on 2026-08-03 after three false starts:
 *
 *   HIVE, and the line about a bee        what this is
 *   ────────────────────────────────
 *   HIVE-Wide                             the most zoomed-out view
 *   My HIVE  (+ each of yours, in colour) the view you live in
 *   ────────────────────────────────
 *   Home · Clive · Members · Boards …     the pages of whichever view you're in
 *   ────────────────────────────────
 *   Admin                                 god view, and the newsletter is in it
 *
 * Newsletter draft moved inside Admin at her request — it's a tool for running
 * the place, not a page you visit.
 */
// Home is NOT in this list. "My HIVEs" IS home — tapping it goes to /hive, and
// your HIVEs hang under it. Having both was the same place twice, one above the
// line and one below (Nat 2026-08-03).
export const NAV_DESTINATIONS: NavDestination[] = [
  { key: 'clive', label: 'Clive', emoji: '✨', route: '/', gate: 'everyone' },
  { key: 'members', label: 'Members', emoji: '👥', route: '/members', gate: 'everyone' },
  { key: 'boards', label: 'Boards', emoji: '📋', route: '/board', gate: 'everyone' },
  { key: 'messages', label: 'Messages', emoji: '💌', route: '/messages', gate: 'everyone', badge: 'dms' },
  { key: 'meetings', label: 'Meetings', emoji: '🗓️', route: '/meetings', gate: 'everyone' },
  { key: 'honey-pot', label: 'Honey Pot', emoji: '🍯', route: '/honey-pot', gate: 'everyone' },
  { key: 'profile', label: 'Profile', emoji: '🐝', route: '/profile', gate: 'everyone' },
  // Profile is about you; Settings is the plumbing behind you (2026-08-03).
  // Admin already wears the cog, so Settings takes the sliders.
  { key: 'settings', label: 'Settings', emoji: '🎛️', route: '/settings', gate: 'everyone' },
];

/** The two zoom levels, above the line. HIVE-Wide is always first. */
export const HIVE_WIDE_ROUTE = '/hive-wide';

/**
 * What sits under HIVE-Wide in the rail.
 *
 * These were four honeycombs on the HIVE-Wide page until 2026-08-03. They are
 * destinations, and destinations belong in the rail — the same call that emptied
 * Home's comb row on the same day. It also means the page can be about the month
 * rather than about navigation.
 */
export const HIVE_WIDE_CHILDREN: NavDestination[] = [
  { key: 'hw-boards', label: 'Boards', emoji: '📋', route: '/hive-wide-boards', gate: 'everyone' },
  { key: 'hw-buzz', label: 'The Buzz', emoji: '📰', route: '/buzz', gate: 'everyone' },
  // Feedback on the app is feedback on all of it, not on the HIVE you happen to
  // be standing in — so it sits up here rather than in each HIVE's page list
  // (Nat 2026-08-03).
  { key: 'hw-feedback', label: 'App Feedback', emoji: '💬', route: '/hive?feedback=1', gate: 'everyone' },
  { key: 'hw-calendar', label: 'Calendar', emoji: '🗓️', route: '/meetings', gate: 'everyone' },
];

/** Below the last line. Owners see the newsletter tools once they're inside. */
export const ADMIN_DESTINATION: NavDestination = {
  key: 'admin', label: 'Admin', emoji: '⚙️', route: '/admin', gate: 'admin',
};

/** What this person is actually allowed to see. */
export function visibleDestinations(opts: {
  isAdmin: boolean;
  isOwner: boolean;
}): NavDestination[] {
  return NAV_DESTINATIONS.filter((d) => {
    if (d.gate === 'owner') return opts.isOwner;
    if (d.gate === 'admin') return opts.isAdmin || opts.isOwner;
    return true;
  });
}

/**
 * Which destination a path belongs to, for highlighting the rail.
 *
 * Longest match wins, so /board/thread-id lights up Boards rather than falling
 * through to Clive at '/', which matches everything.
 */
export function activeKeyForPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  if (pathname.startsWith(HIVE_WIDE_ROUTE)) return 'hive-wide';
  let best: NavDestination | null = null;
  for (const d of [...NAV_DESTINATIONS, ADMIN_DESTINATION]) {
    const hit = d.route === '/' ? pathname === '/' : pathname.startsWith(d.route);
    if (hit && (!best || d.route.length > best.route.length)) best = d;
  }
  return best?.key ?? null;
}
