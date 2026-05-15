import { getWebStorage } from './webStorage';

const memoryDrafts = new Map<string, string>();

export function getDraft(key: string): string {
  try {
    const storage = getWebStorage();
    if (storage) return storage.getItem(key) ?? '';
  } catch {
    // Fall back to memory storage below.
  }

  return memoryDrafts.get(key) ?? '';
}

export function setDraft(key: string, value: string) {
  memoryDrafts.set(key, value);

  try {
    const storage = getWebStorage();
    if (storage) storage.setItem(key, value);
  } catch {
    // Memory storage already has the latest value.
  }
}

export function clearDraft(key: string) {
  memoryDrafts.delete(key);

  try {
    const storage = getWebStorage();
    if (storage) storage.removeItem(key);
  } catch {
    // Memory storage was cleared above.
  }
}
