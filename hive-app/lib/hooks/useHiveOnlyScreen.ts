import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from './useAuth';

/**
 * A screen that only means something inside ONE HIVE, refusing to be drawn
 * while the app thinks you are standing above them all.
 *
 * The rail already hides these at HIVE-Wide (`atWholeHive: 'hidden'` in
 * lib/navigation.ts), which is why this went unnoticed: you cannot NAVIGATE to
 * one from up there. But `wholeHive` persists for the tab's lifetime, so a
 * reload — or a first sign-in, where `initialRouteName` falls back to the `hive`
 * tab because there is no remembered one — lands you on a HIVE's page with the
 * app still in HIVE-Wide mode.
 *
 * Nat hit exactly that on a brand-new account (2026-08-04): the header read
 * "HIVE-WIDE / Tech HIVE", the page was cream, and every panel tab was
 * invisible. Nothing was broken in isolation — `AppHeader`, `HeaderTabs` and
 * `pageSkin` all read `wholeHive` themselves and dressed for space, while the
 * screen itself referenced `wholeHive` nowhere and painted a HIVE. Both halves
 * were doing as they were told; nobody was refereeing.
 *
 * So the referee lives here, once. A screen calls it and can then assume it is
 * inside a HIVE for the whole of its render.
 */
export function useHiveOnlyScreen() {
  const { wholeHive } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (wholeHive) router.replace('/hive-wide' as never);
  }, [wholeHive, router]);

  return wholeHive;
}
