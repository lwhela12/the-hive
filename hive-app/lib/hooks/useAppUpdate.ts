import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// "Fresh honey" update detection (web only — native builds are no-ops).
//
// Vercel writes dist/version.json at build time (see vercel.json buildCommand).
// It is served with Cache-Control: no-cache so a fetch always reflects the
// currently deployed build. We remember the buildId that was live when the
// session started, re-check every POLL_INTERVAL_MS and whenever the tab is
// foregrounded, and flag `updateAvailable` when the deployed buildId changes.

const POLL_INTERVAL_MS = 5 * 60 * 1000; // ~5 minutes

// Module-level singleton so every consumer (banner, refresh pill) shares one
// baseline and one polling loop no matter how many components mount the hook.
let baselineBuildId: string | null = null;
let updateAvailable = false;
let pollingStarted = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

async function fetchDeployedBuildId(): Promise<string | null> {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { buildId?: unknown };
    return typeof data?.buildId === 'string' && data.buildId.length > 0 ? data.buildId : null;
  } catch {
    return null; // offline / not yet deployed — never surface an error
  }
}

async function checkForUpdate() {
  if (updateAvailable) return; // already flagged; nothing more to learn

  const deployedBuildId = await fetchDeployedBuildId();
  if (!deployedBuildId) return;

  if (baselineBuildId === null) {
    // First successful fetch of the session — remember what we're running.
    baselineBuildId = deployedBuildId;
    return;
  }

  if (deployedBuildId !== baselineBuildId) {
    updateAvailable = true;
    notifyListeners();
  }
}

function startPollingOnce() {
  if (pollingStarted) return;
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof fetch !== 'function') return;
  pollingStarted = true;

  void checkForUpdate(); // startup: establish the baseline buildId

  setInterval(() => {
    void checkForUpdate();
  }, POLL_INTERVAL_MS);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate();
      }
    });
  }
}

/**
 * Apply a pending update: nudge the service worker to pick up the new build,
 * tell any waiting worker to activate immediately, then hard-reload.
 * Every step is guarded so any failure still ends in a plain reload.
 */
export async function applyAppUpdate(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update().catch(() => {});
        // sw.js listens for SKIP_WAITING messages (public/sw.js) — activate
        // any freshly installed worker instead of leaving it waiting.
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      }
    }
  } catch {
    // fall through to reload — a plain reload still fetches fresh HTML
    // because the SW uses a network-first strategy for navigations.
  }

  window.location.reload();
}

/**
 * Web-only hook exposing whether a newer deployment is live.
 * On native this always returns { updateAvailable: false }.
 */
export function useAppUpdate() {
  const [available, setAvailable] = useState(updateAvailable);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    startPollingOnce();

    const listener = () => setAvailable(updateAvailable);
    listeners.add(listener);
    listener(); // sync in case the flag flipped before this mount

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { updateAvailable: available, applyUpdate: applyAppUpdate };
}
