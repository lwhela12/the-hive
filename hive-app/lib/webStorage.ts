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
