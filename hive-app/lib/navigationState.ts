import {
  getSessionItem,
  getStoredItemAsync,
  removeSessionItemAsync,
  setSessionItemAsync,
} from './webStorage';

export const LAST_APP_PATH_KEY = 'the-hive:last-app-path';

const APP_PATHS = new Set([
  '/',
  '/index',
  '/hive',
  '/board',
  '/messages',
  '/meetings',
  '/profile',
  '/admin',
  '/buzz',
  // Meeting tools — restoring these after a resume matters most of all:
  // losing a half-finished tune-up mid-check-in is how "my survey
  // disappeared" reports happen.
  '/monthly-tuneup',
  '/arrival-board',
  '/meeting-helper',
  '/honey-pot',
]);

export function isAppPath(pathname: string | null | undefined): pathname is string {
  return !!pathname && APP_PATHS.has(pathname);
}

// On the web this is session-scoped on purpose (Nat 2026-08-08: "if you log
// all the way out and all the way back in... that's when you want a reset,
// but if you're just toggling screens quickly... that's when you wanted your
// spot saved"). sessionStorage already draws exactly that line for the
// HIVE-Wide picker (`lib/hiveSelection.ts`) — it survives a reload or
// switching tabs within the same sitting, and dies with the tab, so a
// genuinely fresh arrival (closed the browser, came back from the public
// site's login, opened it again the next day) starts clean instead of being
// dropped back into whatever screen was open who-knows-when. Before this, a
// browser tab whose Supabase session just never expired would resume the
// exact same screen forever — there was no such thing as "a while", only
// "signed in" or "signed out".
//
// On native, AsyncStorage is the actual persistent store, and closing and
// reopening the app is the ordinary way people use it there — losing your
// place on every relaunch would be the surprising behaviour, so that half
// keeps the old always-resume lifetime.
export function getLastAppPath(fallback = '/hive') {
  const savedPath = getSessionItem(LAST_APP_PATH_KEY);
  return isAppPath(savedPath) ? savedPath : fallback;
}

export async function getLastAppPathAsync(fallback = '/hive') {
  const savedPath = await getStoredItemAsync(LAST_APP_PATH_KEY);
  return isAppPath(savedPath) ? savedPath : fallback;
}

export function saveLastAppPath(pathname: string | null | undefined) {
  if (!isAppPath(pathname)) {
    return;
  }

  void setSessionItemAsync(LAST_APP_PATH_KEY, pathname);
}

export function clearLastAppPath() {
  void removeSessionItemAsync(LAST_APP_PATH_KEY);
}

export function getLastAppTabName(fallback = 'hive') {
  const path = getLastAppPath(`/${fallback}`);

  if (path === '/') return 'index';
  return path.replace(/^\//, '');
}
