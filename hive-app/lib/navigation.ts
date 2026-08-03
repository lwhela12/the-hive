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

export const NAV_DESTINATIONS: NavDestination[] = [
  // The shared high street comes first, because it's where you land.
  { key: 'hive-wide', label: 'HIVE-Wide', emoji: '🌍', route: '/hive-wide', gate: 'everyone' },

  { key: 'clive', label: 'Clive', emoji: '✨', route: '/', gate: 'everyone', dividerBefore: true },
  { key: 'home', label: 'Home', emoji: '🏠', route: '/hive', gate: 'everyone' },
  { key: 'members', label: 'Members', emoji: '👥', route: '/members', gate: 'everyone' },
  { key: 'boards', label: 'Boards', emoji: '📋', route: '/board', gate: 'everyone' },
  { key: 'messages', label: 'Messages', emoji: '💌', route: '/messages', gate: 'everyone', badge: 'dms' },
  { key: 'meetings', label: 'Meetings', emoji: '🗓️', route: '/meetings', gate: 'everyone' },
  { key: 'buzz', label: 'The Buzz', emoji: '📰', route: '/buzz', gate: 'everyone' },
  { key: 'honey-pot', label: 'Honey Pot', emoji: '🍯', route: '/honey-pot', gate: 'everyone' },

  // You, and the levers.
  { key: 'profile', label: 'Profile', emoji: '🐝', route: '/profile', gate: 'everyone', dividerBefore: true },
  { key: 'admin', label: 'Admin', emoji: '⚙️', route: '/admin', gate: 'admin' },
  { key: 'newsletter', label: 'Newsletter draft', emoji: '✍️', route: '/newsletter', gate: 'owner' },
];

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
  let best: NavDestination | null = null;
  for (const d of NAV_DESTINATIONS) {
    const hit = d.route === '/' ? pathname === '/' : pathname.startsWith(d.route);
    if (hit && (!best || d.route.length > best.route.length)) best = d;
  }
  return best?.key ?? null;
}
