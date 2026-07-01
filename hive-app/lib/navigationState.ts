import {
  getStoredItem,
  getStoredItemAsync,
  removeStoredItemAsync,
  setStoredItemAsync,
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
]);

export function isAppPath(pathname: string | null | undefined): pathname is string {
  return !!pathname && APP_PATHS.has(pathname);
}

export function getLastAppPath(fallback = '/hive') {
  const savedPath = getStoredItem(LAST_APP_PATH_KEY);
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

  void setStoredItemAsync(LAST_APP_PATH_KEY, pathname);
}

export function clearLastAppPath() {
  void removeStoredItemAsync(LAST_APP_PATH_KEY);
}

export function getLastAppTabName(fallback = 'hive') {
  const path = getLastAppPath(`/${fallback}`);

  if (path === '/') return 'index';
  return path.replace(/^\//, '');
}
