import { Platform } from 'react-native';

export const LAST_APP_PATH_KEY = 'the-hive:last-app-path';

const APP_PATHS = new Set([
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
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return fallback;
  }

  const savedPath = window.localStorage.getItem(LAST_APP_PATH_KEY);
  return isAppPath(savedPath) ? savedPath : fallback;
}

export function saveLastAppPath(pathname: string | null | undefined) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !isAppPath(pathname)) {
    return;
  }

  window.localStorage.setItem(LAST_APP_PATH_KEY, pathname);
}

export function getLastAppTabName(fallback = 'hive') {
  const path = getLastAppPath(`/${fallback}`);

  if (path === '/') return 'index';
  return path.replace(/^\//, '');
}
