import { NAV_DESTINATIONS, HIVE_WIDE_ROUTE } from './navigation';

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

/** Returns a path to navigate to, or null to stay exactly where you are. */
export function routeAfterHiveSwitch(
  pathname: string | null | undefined,
  destination: 'hive' | 'wide'
): string | null {
  const path = (pathname ?? '').split('?')[0].replace(/\/+$/, '') || '/';

  if (destination === 'wide') {
    // Going up. A page with a real all-HIVEs version follows you there.
    const dest = NAV_DESTINATIONS.find((d) => d.route.split('?')[0] === path);
    if (dest?.atWholeHive === 'wide') return dest.wideRoute ?? dest.route;
    if (dest?.atWholeHive === 'same') return null;
    // 'hidden' pages (Clive, Meetings, Honey Pot, Profile, Settings) and
    // anything unrecognised have no meaning above the HIVEs.
    return HIVE_WIDE_ROUTE;
  }

  // Coming down into a HIVE.
  //
  // The HIVE-Wide-only doors first, by hand: these are the routes you can only
  // be standing on when you're up there, so they need an answer rather than a
  // lookup. Boards keeps you on boards — that is the case Nat hit.
  const wideOnly: Record<string, string> = {
    '/hive-wide': '/hive',
    '/hive-wide-boards': '/board',
    // The Buzz is one newsletter for everybody and doesn't exist inside a HIVE.
    '/buzz': '/hive',
  };
  if (wideOnly[path]) return wideOnly[path];

  const dest = NAV_DESTINATIONS.find((d) => d.route.split('?')[0] === path);
  // Every page in the rail means something inside a HIVE — that is what being
  // in the rail is — so staying is right for all of them. Only an unrecognised
  // route (a deep link, a screen mid-flow) falls back to home.
  return dest ? null : '/hive';
}
