import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

// One-tap PWA install (Android Chrome & other Chromium browsers, web only).
//
// The browser fires `beforeinstallprompt` when the app is installable. We
// capture it at module scope (it can fire before any component mounts) and
// expose it via useInstallPrompt(). Where the event never fires — iOS Safari,
// desktop browsers without support, or an already-installed app — callers
// fall back to their existing manual instructions.

// `beforeinstallprompt` is not in the DOM lib types — minimal local shape.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Stop the browser's own mini-infobar; we trigger the prompt ourselves.
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    notifyListeners();
  });
}

/**
 * Web-only hook for the captured install prompt.
 * - `canPromptInstall`: true when a native one-tap install prompt is available.
 * - `promptInstall()`: shows the browser install dialog; resolves true if accepted.
 * On native this is always { canPromptInstall: false }.
 */
export function useInstallPrompt() {
  const [canPromptInstall, setCanPromptInstall] = useState(
    Platform.OS === 'web' && deferredInstallPrompt !== null
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const listener = () => setCanPromptInstall(deferredInstallPrompt !== null);
    listeners.add(listener);
    listener(); // sync in case the event fired before this mount

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    const promptEvent = deferredInstallPrompt;
    if (Platform.OS !== 'web' || !promptEvent) return false;

    // Chrome only allows prompt() once per captured event — consume it.
    deferredInstallPrompt = null;
    notifyListeners();

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      return choice.outcome === 'accepted';
    } catch {
      return false;
    }
  }, []);

  return { canPromptInstall, promptInstall };
}
