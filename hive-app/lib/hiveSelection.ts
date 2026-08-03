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
  try { store()?.removeItem(KEY); } catch { /* memory is enough */ }
}
