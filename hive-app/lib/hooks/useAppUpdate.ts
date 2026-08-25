import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// "Fresh honey" update detection (web only — native builds are no-ops).
//
// Vercel writes dist/version.json at build time and stamps the same commit into
// the bundle as EXPO_PUBLIC_BUILD_ID (see vercel.json buildCommand). version.json
// is served no-cache, so fetching it always reports the currently deployed build.
//
// We compare that against the build THIS bundle was compiled from. The old code
// compared it against whatever the server happened to report when the session
// started, which meant the banner could almost never fire: refreshing the page
// re-pinned the baseline to the newest build, so a deploy that landed before you
// loaded was invisible, and a stale bundle handed over by the service worker
// went unnoticed forever (Nat 2026-07-26: "how come I'm not getting the banner").
//
// Knowing our own build id makes it a fact rather than a guess — if what's
// deployed isn't what we're running, there's fresh honey, no matter how you got
// here.

const RUNNING_BUILD_ID = process.env.EXPO_PUBLIC_BUILD_ID ?? '';

// Two minutes: version.json is a few bytes and served no-store, and a banner
// that shows up five minutes late has usually been beaten by a manual refresh.
const POLL_INTERVAL_MS = 2 * 60 * 1000;

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

async function checkForUpdate(): Promise<boolean> {
  if (updateAvailable) return true; // already flagged; nothing more to learn

  const deployedBuildId = await fetchDeployedBuildId();
  if (!deployedBuildId) return false;

  // Normal case: we know which build we are, so any difference is fresh honey —
  // including one deployed before this tab was ever opened.
  if (RUNNING_BUILD_ID) {
    if (deployedBuildId !== RUNNING_BUILD_ID) {
      updateAvailable = true;
      notifyListeners();
    }
    return updateAvailable;
  }

  // Fallback for local dev and any build without a stamped id: we can't know
  // what we're running, so only notice the build CHANGING mid-session. Better
  // than nagging every dev server about a mismatch it can't do anything about.
  if (baselineBuildId === null) {
    baselineBuildId = deployedBuildId;
    return false;
  }

  if (deployedBuildId !== baselineBuildId) {
    updateAvailable = true;
    notifyListeners();
  }
  return updateAvailable;
}

/**
 * Force a real, right-now check instead of trusting the background poll's
 * last result. The Refresh pill on Home is Nat's own answer for a group that
 * doesn't know to close and reopen an app — she told members "just tap that
 * and you'll always have the latest" — so it cannot settle for whatever the
 * passive 2-minute poll happened to have found by the time they tapped it.
 * (Nat, 2026-08-25: tapped it three times and got the old build every time,
 * because `updateAvailable` was still false at the moment of the tap.)
 */
export async function checkForUpdateNow(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return checkForUpdate();
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
