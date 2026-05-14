const memoryDrafts = new Map<string, string>();

function getLocalStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function getDraft(key: string): string {
  try {
    const storage = getLocalStorage();
    if (storage) return storage.getItem(key) ?? '';
  } catch {
    // Fall back to memory storage below.
  }

  return memoryDrafts.get(key) ?? '';
}

export function setDraft(key: string, value: string) {
  memoryDrafts.set(key, value);

  try {
    const storage = getLocalStorage();
    if (storage) storage.setItem(key, value);
  } catch {
    // Memory storage already has the latest value.
  }
}

export function clearDraft(key: string) {
  memoryDrafts.delete(key);

  try {
    const storage = getLocalStorage();
    if (storage) storage.removeItem(key);
  } catch {
    // Memory storage was cleared above.
  }
}
