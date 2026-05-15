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
