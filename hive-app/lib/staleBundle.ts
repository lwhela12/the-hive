import { Platform } from 'react-native';
import { applyAppUpdate } from './hooks/useAppUpdate';

// ---------------------------------------------------------------------------
// When a piece of the app never arrives.
//
// Since route splitting was turned on (2026-08-06) the app arrives in about
// twenty pieces instead of one lump, and index.html names each piece by a
// filename that carries the build's fingerprint. Deploy again and every one of
// those filenames changes.
//
// So a browser holding the PREVIOUS page asks for pieces that no longer exist.
// That is the ordinary state of every member on the morning after a deploy, and
// it must heal itself, because the person it happens to is holding a phone and
// has done nothing wrong.
//
// It did not heal itself on 2026-08-07. Nat opened the app and got
// `Requiring unknown module "707"` — the login screen. Two things had to be
// true for that message to be the one she saw:
//
//   1. `vercel.json` rewrote EVERY unmatched path to index.html, so a missing
//      piece came back as `200` with an HTML page in it rather than a 404.
//   2. A <script> tag whose body is HTML fires `onload`, not `onerror`. The
//      browser reports a syntax error to the console and calls the load a
//      success — so the loader believed the login screen had arrived, then
//      asked for it and found nothing there.
//
// The rewrite is fixed, so a missing piece is now an honest 404 and the loader
// rejects properly. This file is the second half: whatever shape the failure
// takes, a member should get the new app instead of a dead end.
// ---------------------------------------------------------------------------

// The words the app uses when a piece of itself is missing. Metro throws the
// first one, its async loader the second, and browsers phrase the rest their
// own way when a dynamic import dies.
const STALE_BUNDLE_SIGNS = [
  'requiring unknown module',
  'loading module',
  'asyncrequireerror',
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
];

const RECOVERY_MARK = 'hive:stale-bundle-recovery';

// A minute is long enough that a reload which lands on the same broken build
// cannot spin, and short enough that a second deploy later the same day still
// gets its own chance to heal.
const RECOVERY_COOLDOWN_MS = 60 * 1000;

export function isStaleBundleError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === 'string'
        ? error
        : '';

  if (!message) return false;

  const haystack = message.toLowerCase();
  return STALE_BUNDLE_SIGNS.some((sign) => haystack.includes(sign));
}

function recoveryIsOnCooldown(): boolean {
  try {
    const last = window.sessionStorage.getItem(RECOVERY_MARK);
    if (!last) return false;
    return Date.now() - Number(last) < RECOVERY_COOLDOWN_MS;
  } catch {
    // Private browsing can refuse sessionStorage. Without a memory of the last
    // attempt the safe answer is "already tried" — a page that cannot remember
    // is a page that could reload forever.
    return true;
  }
}

/**
 * Fetch the new app and reload, once. Returns true when a reload is under way,
 * so a caller can keep a quiet screen up instead of showing an error nobody
 * will be looking at a moment from now.
 */
export function recoverFromStaleBundle(reason: string): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (recoveryIsOnCooldown()) return false;

  try {
    window.sessionStorage.setItem(RECOVERY_MARK, String(Date.now()));
  } catch {
    return false;
  }

  console.warn(`[HIVE] A piece of the app is from an older build (${reason}). Fetching the new one.`);

  // applyAppUpdate nudges the service worker first, so the reload lands on the
  // new build rather than the cached one that just failed.
  void applyAppUpdate();
  return true;
}

/**
 * Catch the failures that never reach React — a route's piece failing to load
 * rejects a promise outside the render tree, so the error boundary never hears
 * about it and the app simply stops on the splash.
 */
export function watchForStaleBundle(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  window.addEventListener('unhandledrejection', (event) => {
    if (isStaleBundleError(event.reason)) {
      recoverFromStaleBundle('a piece failed to load');
    }
  });

  window.addEventListener(
    'error',
    (event) => {
      // A <script> that 404s reports itself here rather than through the
      // message, so the target is the only thing that names the file.
      const target = event.target as HTMLScriptElement | null;
      const src = target?.tagName === 'SCRIPT' ? target.src : '';

      if (src && src.includes('/_expo/static/js/')) {
        recoverFromStaleBundle('a piece was not on the server');
        return;
      }

      if (isStaleBundleError(event.error ?? event.message)) {
        recoverFromStaleBundle('a piece was missing when it was needed');
      }
    },
    // Capture, because a failed <script> load does not bubble.
    true,
  );
}
