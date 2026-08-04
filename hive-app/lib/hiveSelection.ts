import { Platform } from 'react-native';

// Has this person already said which HIVE they're in, this time round?
//
// People in one HIVE are never asked — there is nothing to choose. People in
// more than one (right now: Nat and Lucas) get the picker once when they arrive,
// and then the app leaves them alone until they sign out or come back fresh.
//
// It survives a page reload on purpose. Tapping the "fresh honey" bar reloads to
// pick up a new build, and that was throwing people back to the picker and
// losing their place — the reward for updating shouldn't be a question you
// already answered (Nat 2026-08-02). sessionStorage is the right lifetime: it
// dies with the tab, so a genuinely fresh arrival still gets asked.

const KEY = 'hive:confirmed';

const store = (): Storage | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    // Private browsing can throw on access rather than on use.
    return null;
  }
};

let confirmed = false;

export function hasConfirmedHive(): boolean {
  if (confirmed) return true;
  try {
    if (store()?.getItem(KEY) === '1') {
      confirmed = true;
      return true;
    }
  } catch { /* fall through to memory */ }
  return false;
}

export function markHiveConfirmed(): void {
  confirmed = true;
  try { store()?.setItem(KEY, '1'); } catch { /* memory is enough */ }
}

export function clearHiveConfirmation(): void {
  confirmed = false;
  wide = false;
  try { store()?.removeItem(KEY); } catch { /* memory is enough */ }
  try { store()?.removeItem(WIDE_KEY); } catch { /* memory is enough */ }
}

// ---------------------------------------------------------------------------
// Standing at HIVE-Wide
//
// The "Which HIVE today?" question is gone (Nat 2026-08-03). Her reasoning,
// which is better than the question was: now that HIVE-Wide sits under My HIVEs
// alongside the others, everybody is in at least two places — HIVE-Wide and
// their own HIVE — so asking which one at the door was a choice with no good
// default. Arriving above all of them and stepping down into one when you want
// to is the same information without the interrogation. "Not having to choose
// right here feels much better."
//
// Same lifetime as the confirmation above, and for the same reason: it survives
// a reload — otherwise the "fresh honey" refresh would drop you out of HIVE-Wide
// and back into whichever HIVE you were last in, mid-read — but it dies with the
// tab, so a genuinely fresh arrival starts above the HIVEs again.
// ---------------------------------------------------------------------------

const WIDE_KEY = 'hive:wide';

let wide = false;

export function isWholeHiveSelected(): boolean {
  if (wide) return true;
  try {
    if (store()?.getItem(WIDE_KEY) === '1') {
      wide = true;
      return true;
    }
  } catch { /* fall through to memory */ }
  return false;
}

export function setWholeHiveSelected(next: boolean): void {
  wide = next;
  try {
    if (next) store()?.setItem(WIDE_KEY, '1');
    else store()?.removeItem(WIDE_KEY);
  } catch { /* memory is enough */ }
}
