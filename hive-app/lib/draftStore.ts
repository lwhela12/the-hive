import { getWebStorage } from './webStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryDrafts = new Map<string, string>();
const pendingDraftWrites = new Map<string, Promise<void>>();

function queueDraftWrite(key: string, write: () => Promise<void>) {
  const pendingWrite = (pendingDraftWrites.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(write);

  pendingDraftWrites.set(key, pendingWrite);

  pendingWrite.finally(() => {
    if (pendingDraftWrites.get(key) === pendingWrite) {
      pendingDraftWrites.delete(key);
    }
  }).catch(() => {
    // Individual callers already handle AsyncStorage failures.
  });
}

export function getDraft(key: string): string {
  try {
    const storage = getWebStorage();
    if (storage) return storage.getItem(key) ?? '';
  } catch {
    // Fall back to memory storage below.
  }

  return memoryDrafts.get(key) ?? '';
}

export async function getDraftAsync(key: string): Promise<string> {
  const syncDraft = getDraft(key);
  if (syncDraft) return syncDraft;

  try {
    await pendingDraftWrites.get(key);

    const asyncDraft = await AsyncStorage.getItem(key);
    if (asyncDraft !== null) {
      memoryDrafts.set(key, asyncDraft);

      try {
        getWebStorage()?.setItem(key, asyncDraft);
      } catch {
        // AsyncStorage already has the latest value.
      }

      return asyncDraft;
    }
  } catch {
    // Fall back to the sync draft result.
  }

  return syncDraft;
}

export function setDraft(key: string, value: string) {
  memoryDrafts.set(key, value);

  try {
    const storage = getWebStorage();
    if (storage) storage.setItem(key, value);
  } catch {
    // Memory storage already has the latest value.
  }

  queueDraftWrite(key, () => AsyncStorage.setItem(key, value).catch(() => {
    // Web/memory storage already has the latest value.
  }));
}

export function clearDraft(key: string) {
  memoryDrafts.delete(key);

  try {
    const storage = getWebStorage();
    if (storage) storage.removeItem(key);
  } catch {
    // Memory storage was cleared above.
  }

  queueDraftWrite(key, () => AsyncStorage.removeItem(key).catch(() => {
    // Web/memory storage already has the latest value.
  }));
}
