import { Platform } from 'react-native';

// Where to send someone after they sign in.
//
// A link texted to the group — /monthly-tuneup?mode=midpoint — has to survive
// the sign-in round trip. Without this, anyone who happened to be signed out
// tapped the link, logged in, and landed on Home with no idea what they were
// invited to.

// Only ever an in-app path. Anything that isn't a plain "/path" is dropped, so
// a crafted ?returnTo= can't bounce someone to another site, and we never send
// them back to login in a loop.
export function sanitizeReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.startsWith('/(auth)') || value.startsWith('/login')) return null;
  return value;
}

// The current destination, QUERY STRING INCLUDED — `/monthly-tuneup` without
// its `?mode=midpoint` opens the wrong check-in, so pathname alone won't do.
export function currentReturnTo(pathname: string | null | undefined): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return sanitizeReturnTo(window.location.pathname + window.location.search);
  }
  return sanitizeReturnTo(pathname);
}
