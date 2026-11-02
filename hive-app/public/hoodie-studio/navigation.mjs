// Match HIVE's named-destination close convention; never traverse unknown history.
const APP_ROUTES = new Set([
  '/', '/index', '/hive', '/hive-wide', '/board', '/hive-wide-boards', '/messages',
  '/meetings', '/profile', '/members', '/settings', '/admin', '/buzz', '/honey-pot',
  '/monthly-tuneup', '/arrival-board', '/meeting-helper', '/endofmonth',
  '/beforewemeet', '/newsletter', '/app-feedback',
]);

export function safeAppReturn(value, origin) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    const path = url.pathname.replace(/\/$/, '') || '/';
    if (url.origin !== origin || !(APP_ROUTES.has(path) || /^\/(checkin|halfway)\/[^/]+$/.test(path))) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export function studioReturnPath(studioUrl, referrer = '') {
  const current = new URL(studioUrl);
  const explicit = safeAppReturn(current.searchParams.get('returnTo'), current.origin);
  if (explicit) return explicit;
  try {
    const previous = new URL(referrer);
    if (previous.origin === current.origin) {
      const path = safeAppReturn(previous.pathname + previous.search + previous.hash, current.origin);
      if (path) return path;
    }
  } catch { /* Direct entry has no previous HIVE destination. */ }
  return '/hive';
}
