import AsyncStorage from '@react-native-async-storage/async-storage';

export function getWebStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return typeof window.localStorage === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getStoredItem(key: string): string | null {
  try {
    return getWebStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setStoredItem(key: string, value: string) {
  try {
    getWebStorage()?.setItem(key, value);
  } catch {
    // Storage can be unavailable or quota-limited in private browsing modes.
  }
}

export function removeStoredItem(key: string) {
  try {
    getWebStorage()?.removeItem(key);
  } catch {
    // Best effort only.
  }
}

export async function getStoredItemAsync(key: string): Promise<string | null> {
  const syncValue = getStoredItem(key);
  if (syncValue !== null) return syncValue;

  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setStoredItemAsync(key: string, value: string): Promise<void> {
  setStoredItem(key, value);

  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable or quota-limited in private browsing modes.
  }
}

export async function removeStoredItemAsync(key: string): Promise<void> {
  removeStoredItem(key);

  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Best effort only.
  }
}

/**
 * Same idea as `localStorage`, but dies with the tab instead of living
 * forever — for state that should survive a reload or switching between
 * screens, but not a genuinely fresh arrival days later. `lib/hiveSelection.ts`
 * established this lifetime first, for the same reason.
 */
export function getWebSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return typeof window.sessionStorage === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getSessionItem(key: string): string | null {
  try {
    return getWebSessionStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setSessionItem(key: string, value: string) {
  try {
    getWebSessionStorage()?.setItem(key, value);
  } catch {
    // Storage can be unavailable or quota-limited in private browsing modes.
  }
}

export function removeSessionItem(key: string) {
  try {
    getWebSessionStorage()?.removeItem(key);
  } catch {
    // Best effort only.
  }
}

/**
 * Session-scoped on web (dies with the tab); AsyncStorage on native, where
 * closing and reopening the app is the normal way people use it and losing
 * your place there would be the surprising thing. Never touches
 * `localStorage` — that's the point.
 */
export async function setSessionItemAsync(key: string, value: string): Promise<void> {
  setSessionItem(key, value);

  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable or quota-limited in private browsing modes.
  }
}

export async function getSessionItemAsync(key: string): Promise<string | null> {
  const sessionValue = getSessionItem(key);
  if (sessionValue !== null) return sessionValue;

  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function removeSessionItemAsync(key: string): Promise<void> {
  removeSessionItem(key);

  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Best effort only.
  }
}
