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
  /**
   * A shorter name, for the phone's narrow rail.
   *
   * The collapsed rail on a phone now writes a name under every picture
   * (2026-08-06), and it is about 58 pixels wide. Most labels fit on one line
   * or wrap neatly onto two; the ones that read badly when they wrap say so
   * here. Leave it off and the full label is used.
   */
  shortLabel?: string;
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
   *
   *            Five rows sit here — Clive, Meetings, Honey Pot, Profile,
   *            Settings — and together they are most of what a new member's
   *            invite email tells them to go and do. Messages was the sixth
   *            until Nat reversed that call on 2026-08-11 (below). HIVE-Wide
   *            stays the page everybody lands on (Nat 2026-08-06: "otherwise
   *            you might never go there"), so the landing page carries the
   *            way down instead: `app/(app)/hive-wide.tsx` opens with a named
   *            door into the member's own HIVE, where the rest still live.
   *            Hiding a row costs nothing as long as something on the page
   *            says where it went.
   * 'only'   — the reverse: it lives at HIVE-Wide and nowhere else, so it is
   *            absent from every HIVE's page list. Nothing uses it today — The
   *            Buzz did until 2026-08-17, when Nat asked for it in every HIVE's
   *            rail showing the identical page.
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
// Home IS in this list again (Nat 2026-08-04): "silly oversight here, we need a
// Home button sitting right above Clive for all of them."
//
// On 08-03 it was taken out because "My HIVEs" already went to /hive, and having
// both looked like the same place twice. That reasoning was sound and the result
// was still wrong, for a reason the screenshot makes obvious: "My HIVEs" has the
// three HIVEs indented underneath it, so it reads as a SECTION HEADING, not as a
// door. Nobody looks at a heading and thinks "that is the button home". So the
// heading is a heading now (it no longer navigates — see SideRail) and Home is
// the first thing in the page list, where you would look for it.
export const NAV_DESTINATIONS: NavDestination[] = [
  // Home means the home of wherever you are standing: your HIVE's page inside a
  // HIVE, and the HIVE-Wide landing above them.
  { key: 'home', label: 'Home', emoji: '🏠', route: '/hive', gate: 'everyone', atWholeHive: 'wide', wideRoute: '/hive-wide' },
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
  // Boards shows at HIVE-Wide, and shows nothing.
  //
  // It was hidden up here, which was tidy and slightly dishonest: the shared
  // boards are genuinely empty — every board in the app still belongs to the
  // HIVE that made it — and hiding the door made that look like a missing
  // feature rather than a decision nobody has taken yet. Nat, 2026-08-05: "we
  // COULD have a boards button on the HIVE-Wide nav side & just say 'nothing
  // here yet' ... the better move is to ask my HIVErs at the meeting."
  { key: 'boards', label: 'Boards', emoji: '📋', route: '/board', gate: 'everyone', atWholeHive: 'wide', wideRoute: '/hive-wide-boards' },
  // Back into HIVE-Wide (Nat reversed her own 2026-08-03 call, 2026-08-11).
  // Standing above the HIVEs the room list can only ever hold one entry — the
  // shared HIVE-Wide room (migration 139) — since every other room and DM
  // belongs to a single HIVE, but `messages.tsx` already knew how to show
  // exactly that one room and nothing else, so no `wideRoute` is needed.
  { key: 'messages', label: 'Messages', emoji: '💌', route: '/messages', gate: 'everyone', badge: 'dms', atWholeHive: 'wide' },
  // Every HIVE's next meeting is already on the Whole HIVE page itself, and the
  // meetings screen is where you CREATE one — which has no all-HIVEs meaning.
  { key: 'meetings', label: 'Meetings', emoji: '🗓️', route: '/meetings', gate: 'everyone', atWholeHive: 'hidden' },
  /**
   * The deck you actually run a meeting from, one row under Meetings.
   *
   * It used to be reachable only from inside Meetings, which is two clicks from
   * anywhere and no clicks that look like anything. Nat, 2026-08-19, after
   * running the first Production HIVE off it: *"I want meeting helper on the
   * left-hand side of the nav bar, instead of just inside of the meetings,
   * because when I'm running a meeting... I have so many clicks away if I want
   * to get back to where I was."* And Oliver, in the room: *"I'm locked out, I
   * can't figure out how to get back."*
   *
   * Hidden at HIVE-Wide. It was `same` for about an hour, on her first ask that
   * it *"always be there"* — and she took it straight back the moment she saw
   * it up there (2026-08-19): *"meeting helper can't be hive wide because it
   * depends on which meeting helper you're in. So get rid of meeting helper
   * from hive wide, but each hive should have its own meeting helper in the
   * sidebar."* A deck belongs to one HIVE's meeting, so a row above all three
   * can only guess which one you meant.
   */
  { key: 'meeting-helper', label: 'Meeting Helper', emoji: '🎬', shortLabel: 'Helper', route: '/meeting-helper', gate: 'everyone', atWholeHive: 'hidden' },
  // Real money, belonging to one HIVE. It is already switched off for Tech.
  { key: 'honey-pot', label: 'Honey Pot', emoji: '🍯', route: '/honey-pot', gate: 'everyone', atWholeHive: 'hidden' },
  /**
   * The Buzz is in every HIVE's rail, and it is the SAME page in all of them.
   *
   * It was HIVE-Wide-only from 2026-08-03, on the reasoning that a copy inside
   * OG would be OG appearing to own the thing everybody shares. True of a copy.
   * This is not a copy: `buzz.tsx` asks for every newsletter post there is and
   * lets row-level security decide what comes back, so it draws the identical
   * list wherever you are standing.
   *
   * Nat, 2026-08-17: *"We can put a shortcut here, in the left hand side nav,
   * but that 'The Buzz' should just show you the exact same thing as HIVE
   * Wide."* Which is what it does — the newsletter lives in exactly two places,
   * here and the public site, and this is a door to the first one.
   */
  { key: 'buzz', label: 'The Buzz', emoji: '📰', route: '/buzz', gate: 'everyone', atWholeHive: 'same' },
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
  // 📣 rather than 💬 (Nat 2026-08-04). The speech balloon rendered as a pale
  // blob against the dark rail, and it sat four rows under 💌 Messages saying
  // the same thing — two "somebody is talking" icons for two different places.
  // A megaphone is speaking UP, which is what this screen is for.
  { key: 'feedback', label: 'App Feedback', emoji: '📣', shortLabel: 'Feedback', route: '/app-feedback', gate: 'everyone', atWholeHive: 'same' },
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
/**
 * Is this page allowed to be open while somebody is standing at HIVE-Wide?
 *
 * `atWholeHive` used to be read by exactly one thing: the rail, when deciding
 * which rows to draw. Hiding a row is not the same as closing a door, and on
 * 2026-08-21 Nat opened a link and landed on Meetings with HIVE-WIDE written
 * across the top of it: *"it looks like i'm in HIVE wide & in a meeting,
 * thats not good."* Every route around it had the same hole — Meeting Helper,
 * Honey Pot, Profile, Settings, Admin, Clive — because none of them was ever
 * asked. A link, a bookmark, the back button and a deep link with a `?code=`
 * on it all walk straight past a menu.
 *
 * So the question is asked here, once, by route rather than by row, and the
 * layout asks it on every navigation.
 *
 * It is an ALLOW-list on purpose. A page added next month is HIVE-only until
 * somebody says otherwise, which is the safe way round: the cost of being
 * wrong is a reader quietly stepping into their own HIVE, rather than a page
 * about one HIVE wearing another one's name.
 */
export function routeLivesAtWholeHive(pathname: string | null | undefined): boolean {
  const path = (pathname ?? '').split('?')[0].replace(/\/+$/, '') || '/';

  // The HIVE-Wide pages themselves, and any 'wide' destination's wide twin.
  if (path === HIVE_WIDE_ROUTE) return true;
  if (NAV_DESTINATIONS.some((d) => d.wideRoute && d.wideRoute === path)) return true;

  // 'same' means the same thing wherever you stand; 'only' lives up here.
  const dest = NAV_DESTINATIONS.find((d) => d.route === path);
  if (dest && (dest.atWholeHive === 'same' || dest.atWholeHive === 'only')) return true;

  // A 'wide' page with no `wideRoute` is one page serving both places — the
  // Members list is the same screen whether you are looking at one HIVE or
  // all of them. One WITH a wideRoute has a twin up here, so its own route
  // belongs to a single HIVE and steps you back down into one.
  if (dest && dest.atWholeHive === 'wide' && !dest.wideRoute) return true;

  // The short check-in links pick their own HIVE and hand over — they are a
  // door rather than a page, so they are left to do their job.
  if (path.startsWith('/checkin')) return true;

  return false;
}

export function activeKeyForPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  // The shared boards are Boards — they just happen to live at a wide door, so
  // the rail should light up Boards there rather than the HIVE you came from.
  // Checked before the HIVE-Wide prefix, which would otherwise swallow it.
  if (pathname.startsWith('/hive-wide-boards')) return 'boards';
  // The Monthly Tune-up is still reached from inside Meetings rather than the
  // rail, so it belongs to Meetings in the footer trail — without this the
  // strip showed only the HIVE's name and stopped, which is what Nat saw
  // standing in the Meeting Helper on 2026-08-14: *"the footer's not keeping up
  // with us at the bottom, it just says Production HIVE."*
  //
  // The Meeting Helper is no longer one of them. It has its own row in the rail
  // as of 2026-08-19, so it lights up as itself and names itself in the footer,
  // exactly like every other page — and `meeting-helper.tsx` dropped the deep
  // crumb it used to add, which would now say its own name twice.
  if (pathname.startsWith('/monthly-tuneup')) return 'meetings';
  if (pathname.startsWith(HIVE_WIDE_ROUTE)) return 'hive-wide';
  let best: NavDestination | null = null;
  for (const d of [...NAV_DESTINATIONS, ADMIN_DESTINATION]) {
    const hit = d.route === '/' ? pathname === '/' : pathname.startsWith(d.route);
    if (hit && (!best || d.route.length > best.route.length)) best = d;
  }
  return best?.key ?? null;
}
