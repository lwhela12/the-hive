import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

type InstallableDisplayMode = 'fullscreen' | 'standalone' | 'minimal-ui';

export type WebAppDisplayMode = InstallableDisplayMode | 'browser';

const DISPLAY_MODE_QUERIES: InstallableDisplayMode[] = [
  'fullscreen',
  'standalone',
  'minimal-ui',
];

function navigatorIsStandalone() {
  if (typeof navigator === 'undefined') return false;

  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function readDisplayMode(): WebAppDisplayMode {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return 'standalone';
  }

  if (navigatorIsStandalone()) {
    return 'standalone';
  }

  if (typeof window.matchMedia !== 'function') {
    return 'browser';
  }

  const matchingMode = DISPLAY_MODE_QUERIES.find(mode =>
    window.matchMedia(`(display-mode: ${mode})`).matches
  );

  return matchingMode ?? 'browser';
}

export function useWebAppDisplayMode() {
  const [displayMode, setDisplayMode] = useState<WebAppDisplayMode>(readDisplayMode);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQueries = DISPLAY_MODE_QUERIES.map(mode =>
      window.matchMedia(`(display-mode: ${mode})`)
    );
    const updateDisplayMode = () => setDisplayMode(readDisplayMode());

    mediaQueries.forEach(mediaQuery => {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', updateDisplayMode);
      } else {
        mediaQuery.addListener(updateDisplayMode);
      }
    });

    window.addEventListener('focus', updateDisplayMode);
    window.addEventListener('pageshow', updateDisplayMode);

    return () => {
      mediaQueries.forEach(mediaQuery => {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', updateDisplayMode);
        } else {
          mediaQuery.removeListener(updateDisplayMode);
        }
      });
      window.removeEventListener('focus', updateDisplayMode);
      window.removeEventListener('pageshow', updateDisplayMode);
    };
  }, []);

  return useMemo(() => ({
    displayMode,
    isBrowserMode: displayMode === 'browser',
    isStandalone: displayMode !== 'browser',
  }), [displayMode]);
}
