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
  /**
   * What this page does when you are standing at Whole HIVE rather than inside
   * one HIVE (Nat 2026-08-03).
   *
   * 'same'   — means the same thing wherever you stand. Profile, Settings,
   *            App Feedback, Log out: they are about you, not about a HIVE.
   * 'wide'   — has a real all-HIVEs version, at `wideRoute` if it needs a
   *            different door.
   * 'hidden' — only means something inside one HIVE, so it steps out of the
   *            list rather than showing you one HIVE's answer while you are
   *            standing above all of them.
   * 'only'   — the reverse: it lives at HIVE-Wide and nowhere else, so it is
   *            absent from every HIVE's page list. The Buzz is the one, and it
   *            always was one newsletter across all of them.
   */
  atWholeHive?: 'same' | 'wide' | 'hidden' | 'only';
  /** Where 'wide' items go when you are at Whole HIVE, if not `route`. */
  wideRoute?: string;
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
  // Clive knows one HIVE's people, wishes and history. There is no version of
  // him that speaks for all three at once, so he steps out at Whole HIVE.
  { key: 'clive', label: 'Clive', emoji: '✨', route: '/', gate: 'everyone', atWholeHive: 'hidden' },
  { key: 'members', label: 'Members', emoji: '👥', route: '/members', gate: 'everyone', atWholeHive: 'wide' },
  // Out of HIVE-Wide (Nat 2026-08-03). Shared boards answered a real problem
  // yesterday — Announcements, HIVE Approved and the helper log existed three
  // times over and only OG's copies had content — but "a board every HIVE sees"
  // immediately raises "can I share ONE board with ONE other HIVE?", which is a
  // permissions model rather than an afternoon. Every board is back in OG
  // (migration 142), so there is nothing up here to point at. `wideRoute` stays
  // written down: the screen still exists and works, and this is the boards
  // changing their minds rather than the idea leaving the app.
  { key: 'boards', label: 'Boards', emoji: '📋', route: '/board', gate: 'everyone', atWholeHive: 'hidden', wideRoute: '/hive-wide-boards' },
  // Out of HIVE-Wide for now, at Nat's call (2026-08-03): "if you want to
  // message HIVE-Wide, you can just do so from your regular message spot for
  // now." Standing above the HIVEs, the list could only ever hold one entry —
  // every other room and DM belongs to a single HIVE — so the page was a room
  // list with one room in it, wrapped in a split view built for many. The
  // shared room itself is untouched: it still sits in each HIVE's Messages
  // list, one tap from where you already read your messages.
  { key: 'messages', label: 'Messages', emoji: '💌', route: '/messages', gate: 'everyone', badge: 'dms', atWholeHive: 'hidden' },
  // Every HIVE's next meeting is already on the Whole HIVE page itself, and the
  // meetings screen is where you CREATE one — which has no all-HIVEs meaning.
  { key: 'meetings', label: 'Meetings', emoji: '🗓️', route: '/meetings', gate: 'everyone', atWholeHive: 'hidden' },
  // Real money, belonging to one HIVE. It is already switched off for Tech.
  { key: 'honey-pot', label: 'Honey Pot', emoji: '🍯', route: '/honey-pot', gate: 'everyone', atWholeHive: 'hidden' },
  // The Buzz lives at HIVE-Wide and nowhere else now (Nat 2026-08-03). It was
  // always one newsletter across all the HIVEs, so a copy of it inside OG was
  // OG appearing to own the thing everybody shares.
  { key: 'buzz', label: 'The Buzz', emoji: '📰', route: '/buzz', gate: 'everyone', atWholeHive: 'only' },
  // Out of HIVE-Wide for now, at Nat's call (2026-08-03). Your profile is the
  // same page wherever you stand, so having it up there too was a second door
  // to one room while the HIVE-Wide idea is still settling.
  { key: 'profile', label: 'Profile', emoji: '🐝', route: '/profile', gate: 'everyone', atWholeHive: 'hidden' },
  // Settings is a gear, because settings are a gear (Nat 2026-08-03). It wore
  // the sliders only because Admin had the cog first, which is backwards — the
  // page everybody uses should get the obvious icon, and the one two people
  // use can be the one you have to learn. Admin took the keys instead.
  // Settings steps out at HIVE-Wide (Nat 2026-08-03): "you have to be inside of
  // your smaller HIVE to change that." Which is true of most of what is in
  // there — notifications, your name in a HIVE, leaving one — so offering it
  // from above them all was offering to change something without saying what.
  { key: 'settings', label: 'Settings', emoji: '⚙️', route: '/settings', gate: 'everyone', atWholeHive: 'hidden' },
  // Feedback on the app is feedback on all of it, wherever you happen to be.
  // It said 'same' from the day the rail was written, and pointed at /hive —
  // which is the one route that CANNOT mean the same thing wherever you stand.
  // Nat found it by clicking App Feedback at HIVE-Wide and landing in Production
  // HIVE (2026-08-03). Its own screen now, with no community id in the path.
  { key: 'feedback', label: 'App Feedback', emoji: '💬', route: '/app-feedback', gate: 'everyone', atWholeHive: 'same' },
];

/** The two zoom levels, above the line. HIVE-Wide is always first. */
export const HIVE_WIDE_ROUTE = '/hive-wide';

/**
 * HIVE-Wide had its own section of the rail with its own children for about an
 * hour, and Nat killed it the same afternoon she asked for it — correctly.
 *
 * "We just move HIVE-Wide under My HIVEs. Then we aren't trying to reinvent the
 * wheel, it's just the same format as all the other ones." Two shapes to learn
 * became one: HIVE-Wide is the first entry under My HIVEs, next to OG, Tech and
 * Production, and the single page list below serves whichever one you picked.
 * Anything added later gets added once instead of twice.
 *
 * The name survived a wobble too ("All HIVEs?"), and stayed HIVE-Wide: it reads
 * like "the whole wide world", and the hyphenated shape can't be mistaken for
 * the name of an individual HIVE.
 */
export const WHOLE_HIVE_KEY = 'hive-wide';

/** The page list, as it should read from where this person is standing. */
export function destinationsForPlace(opts: {
  isAdmin: boolean;
  isOwner: boolean;
  wholeHive: boolean;
}): NavDestination[] {
  return visibleDestinations(opts)
    .filter((d) => (
      opts.wholeHive ? d.atWholeHive !== 'hidden' : d.atWholeHive !== 'only'
    ))
    .map((d) => (
      opts.wholeHive && d.atWholeHive === 'wide' && d.wideRoute
        ? { ...d, route: d.wideRoute }
        : d
    ));
}

/** Below the last line. Owners see the newsletter tools once they're inside. */
export const ADMIN_DESTINATION: NavDestination = {
  // The keys to the place, now that Settings has the gear.
  key: 'admin', label: 'Admin', emoji: '🔑', route: '/admin', gate: 'admin',
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
  // The shared boards are Boards — they just happen to live at a wide door, so
  // the rail should light up Boards there rather than the HIVE you came from.
  // Checked before the HIVE-Wide prefix, which would otherwise swallow it.
  if (pathname.startsWith('/hive-wide-boards')) return 'boards';
  if (pathname.startsWith(HIVE_WIDE_ROUTE)) return 'hive-wide';
  let best: NavDestination | null = null;
  for (const d of [...NAV_DESTINATIONS, ADMIN_DESTINATION]) {
    const hit = d.route === '/' ? pathname === '/' : pathname.startsWith(d.route);
    if (hit && (!best || d.route.length > best.route.length)) best = d;
  }
  return best?.key ?? null;
}
