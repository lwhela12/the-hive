/** The door on the members' app, and who still has a key.
 *
 *  To open the HIVE: set HIVE_CLOSED to false and push. That is the whole job.
 *  The screen, the bypass and everything below come back on their own; nothing
 *  else needs editing and nothing needs remembering.
 *
 *  Closed 2026-08-02 overnight, opened the morning of 08-03, and closed again an
 *  hour later when an audit found eighteen ways data could cross a boundary it
 *  shouldn't. All eighteen were fixed and re-attacked as an ordinary member the
 *  same day (`50b0f94`), so the door opened again the evening of 08-03 — Nat
 *  needs to walk the whole app and show Lucas, and a closed sign was in the way.
 *
 *  This mirrors sprouts-app/lib/maintenance.ts on purpose. The two apps keep
 *  borrowing structure from each other, so where they solve the same problem
 *  they should look the same — it is how a fix in one gets noticed by the other.
 */
export const HIVE_CLOSED = false;

/** The accounts that can still get in while the HIVE is closed.
 *
 *  Nat and Lucas sign in to each other's accounts constantly and work as one
 *  person — "we're the yin and the yang, two peas, one pod" (Nat 2026-08-03).
 *  Anywhere one of them is named, both belong. */
export const HIVE_KEEPER_EMAILS = [
  'natwalstead@gmail.com',
  'lucas@whelanpartners.com',
];

export function isHiveKeeper(email: string | null | undefined): boolean {
  const clean = email?.trim().toLowerCase();
  return !!clean && HIVE_KEEPER_EMAILS.includes(clean);
}

/**
 * The escape hatch that works before anybody has signed in.
 *
 * Deliberately kept alongside the email list rather than replaced by it: the
 * list can only help someone who is already signed in, and the one moment you
 * most need a way in is when sign-in itself is misbehaving. app.the-hive.app/?bee=1
 * sticks for the tab.
 */
const BYPASS_KEY = 'hive:bee';

export function hasBypassTicket(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('bee') === '1') {
      window.sessionStorage.setItem(BYPASS_KEY, '1');
      return true;
    }
    return window.sessionStorage.getItem(BYPASS_KEY) === '1';
  } catch {
    // Private browsing can refuse sessionStorage. Being unable to remember the
    // ticket is not a reason to hand one out.
    return false;
  }
}
