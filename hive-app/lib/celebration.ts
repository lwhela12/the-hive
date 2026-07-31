/**
 * A tiny broadcast for "something worth cheering just happened".
 *
 * Granting a wish happens from five different screens, and each one closes its
 * modal the instant the grant succeeds — so confetti rendered inside the modal
 * gets unmounted before anyone sees it. Instead the celebration lives once, at
 * the tab layout, and any code anywhere can set it off by calling celebrate().
 */

export interface Celebration {
  /** Big line, e.g. "HD Wish Granted!" */
  title: string;
  /** Small line underneath. Optional. */
  subtitle?: string;
}

type Listener = (celebration: Celebration) => void;

const listeners = new Set<Listener>();

export function celebrate(title: string, subtitle?: string) {
  listeners.forEach((listener) => listener({ title, subtitle }));
}

export function onCelebrate(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The one call every "mark as HD granted" path makes, so the wording and the
 * timing stay identical wherever a wish is granted from.
 *
 * The short wait is deliberate: the grant modal is still on screen when the
 * grant succeeds, and a sheet sliding away would swallow the first half of the
 * confetti.
 */
export function celebrateWishGranted() {
  setTimeout(() => {
    celebrate('HD Wish Granted!', 'The HIVE came together on this one.');
  }, 500);
}
