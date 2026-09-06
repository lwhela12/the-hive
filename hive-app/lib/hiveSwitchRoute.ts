import { NAV_DESTINATIONS, HIVE_WIDE_ROUTE, placeForRoute } from './navigation';

/**
 * Where you land when you change HIVEs.
 *
 * Until now: home, always. Nat, 2026-08-03: "on HIVE-Wide Boards & change HIVEs
 * to OG HIVE's, can you make it so i stay on boards? just swap hives? instead of
 * bringing me back to home page? same with any page: i could click Clive & then
 * toggle between the diff HIVEs to see how Clive changes."
 *
 * That last sentence is the whole feature. Switching HIVEs isn't navigation —
 * it's changing which HIVE the page you're already looking at is ABOUT. Being
 * dumped on the home page every time made comparing two HIVEs a four-tap trip
 * instead of one, and it threw away the page you had deliberately opened.
 *
 * The rule: stay put when the page exists in the place you're going; go home
 * when it doesn't. The only thing this file decides is that second half, and it
 * reads the answer off NAV_DESTINATIONS rather than keeping its own list — a
 * page added to the rail is covered here the day it is added.
 */

/**
 * The screens that belong to one HIVE but are not in the side rail.
 *
 * The rail is not the list of per-HIVE pages — it is the list of pages with a
 * DOOR in the rail. These are reached from inside other screens, and every one
 * of them means exactly the same thing in the HIVE you are switching to.
 *
 * The Meeting Helper was here until 2026-08-19 and has a door of its own now,
 * so it is covered by the lookup below like every other page in the rail — and
 * going UP is covered too, which is the half that was broken while it had no
 * entry at all: Nat clicked HIVE-Wide from the deck and stayed on the deck.
 *
 * Found 2026-08-16, the hard way. The OG check-in email's button carries the
 * HIVE it belongs to now, so pressing it from HIVE-Wide switches you into OG and
 * opens the tune-up. Except it didn't: the switch landed, and then this file
 * called `/monthly-tuneup` unrecognised and sent her to Home. Nat: *"the OG HIVE
 * check in still only dropped me here ... its supposed to go all the way into
 * the actual survey!"*
 *
 * A deep link into a per-HIVE screen is exactly the case the fallback was
 * written to catch, and it is the one case where going home is wrong.
 */
const HIVE_SCREENS_OFF_THE_RAIL = new Set([
  '/beforewemeet',
  '/monthly-tuneup',
  '/arrival-board',
  '/newsletter',
]);

/** Returns a path to navigate to, or null to stay exactly where you are. */
export function routeAfterHiveSwitch(
  pathname: string | null | undefined,
  destination: 'hive' | 'wide'
): string | null {
  const path = (pathname ?? '').split('?')[0].replace(/\/+$/, '') || '/';

  if (destination === 'wide') {
    // Already reading something that means the same thing up here, or that
    // only exists up here? Then there is nowhere to go — stay on it.
    //
    // This is the half that was missing. Pressing HIVE-Wide while standing on
    // HIVE-Wide Boards used to look the route up by `route`, miss (its entry
    // is a `wideRoute`), and fall through to the landing page — so the button
    // for the place you were already in threw you off the page you were
    // reading. Nat, 2026-09-04: *"the paths just arent good or consistent."*
    if (placeForRoute(path) !== 'hive') return null;

    // A page with a real all-HIVEs version follows you there.
    const dest = NAV_DESTINATIONS.find((d) => d.route.split('?')[0] === path);
    if (dest?.atWholeHive === 'wide') return dest.wideRoute ?? dest.route;

    // 'hidden' pages (Clive, Meetings, Honey Pot, Profile, Settings) and
    // anything unrecognised have no meaning above the HIVEs.
    return HIVE_WIDE_ROUTE;
  }

  // Coming down into a HIVE.
  //
  // A wide twin hands you back its own HIVE-side half — `/hive-wide-boards`
  // becomes `/board`, `/hive-wide` becomes `/hive`. Read off the destination
  // list rather than a hand-written map, so a page that gains a wide twin is
  // covered going both ways the day it gains one.
  const twin = NAV_DESTINATIONS.find((d) => d.wideRoute === path);
  if (twin) return twin.route;

  // A per-HIVE screen with no door in the rail still stays put — see the list.
  if (HIVE_SCREENS_OFF_THE_RAIL.has(path)) return null;

  const dest = NAV_DESTINATIONS.find((d) => d.route.split('?')[0] === path);
  // Every page in the rail means something inside a HIVE — that is what being
  // in the rail is — so staying is right for all of them. Only a route that is
  // neither in the rail nor a wide twin falls back to home.
  return dest ? null : '/hive';
}
