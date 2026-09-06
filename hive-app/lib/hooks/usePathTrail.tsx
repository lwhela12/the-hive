import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import type { Crumb } from '../../components/ui/Breadcrumbs';

/**
 * The part of "where am I" that only the screen knows.
 *
 * The strip along the bottom can work out most of the path on its own — which
 * HIVE you are in and which page you are on, because the route says so. What it
 * cannot know is that you are inside HIVE Approved reading Favorite Healthcare.
 * Those two names live in the boards screen's own state and nowhere else.
 *
 * So a screen with depth calls `useDeepTrail([...])`. It clears itself when you
 * leave, which is the whole reason this is a hook rather than a value passed
 * down: nobody has to remember to tidy up, and the path cannot be left pointing
 * at a board you closed ten minutes ago.
 *
 * ## Contributions STACK — they do not replace each other
 *
 * The first version had whoever spoke last own the whole trail, and it was
 * wrong the moment it met the screen it was built for: the boards list
 * contributes "HIVE Approved", the thread view contributes "Favorite
 * Healthcare", and the second simply erased the first. The board vanished from
 * the path exactly when you had gone deepest into it.
 *
 * Each caller owns one segment of the path, held in mount order — a parent
 * mounts before its child, so the order is the nesting — and the footer joins
 * them up. Any depth works, and no screen has to know what is above it.
 */

type Entry = {
  id: symbol;
  crumbs: Crumb[];
  /**
   * Which screen said this, so the strip can ignore everybody else.
   *
   * Expo Router's tabs keep a screen MOUNTED when you leave it — that is what
   * makes coming back instant — so a screen's cleanup never runs and it never
   * takes its crumb back. The path along the bottom said "July Newsletter" on
   * Members, on Boards, on App Feedback, on Admin.
   *
   * The first fix tagged each contribution with `usePathname()` and filtered by
   * it, which failed for a reason worth writing down: **`usePathname` is
   * global.** It reports where the APP is, not where the screen is, so every
   * mounted screen saw the value change on every navigation, re-ran its effect,
   * and re-filed its crumb under whatever page you had just opened. The trail
   * was still wrong, and now the whole app re-rendered on every hop — which is
   * exactly when Nat said "its loading so slow & is really janky on the scrolls
   * everywhere".
   *
   * Focus is the signal. A screen contributes while it is the one you are
   * looking at and withdraws the moment it is not, so there is one contributor
   * at a time and navigating costs one small state change instead of a storm.
   */
  pathname: string;
  /**
   * What the PAGE crumb should do instead of navigating.
   *
   * The page crumb ("Boards") normally just goes to its own route — which does
   * nothing when you are already standing on it. Boards keeps the open board
   * and the open thread in its own state while the route stays `/board`, so
   * tapping "Boards" from inside a thread moved you nowhere. Nat, 2026-08-06:
   * "if i was all the way inside that thread & i wanted to go back to boards,
   * that woudl be cool." A screen that holds its own depth says here how to
   * shed it.
   */
  onPagePress?: () => void;
};

type TrailContext = {
  entries: Entry[];
  contribute: (
    id: symbol,
    crumbs: Crumb[] | null,
    pathname: string,
    onPagePress?: () => void
  ) => void;
  /** Set by the focused screen, read by the footer's page crumb. */
  onPagePress?: () => void;
};

const Ctx = createContext<TrailContext>({ entries: [], contribute: () => {} });

export function PathTrailProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);

  const contribute = useMemo(() => (
    id: symbol,
    crumbs: Crumb[] | null,
    pathname: string,
    onPagePress?: () => void
  ) => {
    setEntries((current) => {
      if (crumbs === null) {
        const without = current.filter((e) => e.id !== id);
        return without.length === current.length ? current : without;
      }
      const at = current.findIndex((e) => e.id === id);
      if (at === -1) return [...current, { id, crumbs, pathname, onPagePress }];
      const next = current.slice();
      next[at] = { id, crumbs, pathname, onPagePress };
      return next;
    });
  }, []);

  const value = useMemo<TrailContext>(
    () => ({ entries, contribute, onPagePress: entries.find((e) => e.onPagePress)?.onPagePress }),
    [entries, contribute]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Everything below the page name, in the order you walked into it — from the
 * page you are actually on, and nobody else.
 */
/** What the page crumb should do, when the focused screen has an opinion. */
export function usePagePress(): (() => void) | undefined {
  return useContext(Ctx).onPagePress;
}

export function usePathTrail(): Crumb[] {
  // Only the focused screen is ever in here now, so there is nothing to filter.
  return useContext(Ctx).entries.flatMap((e) => e.crumbs);
}

/**
 * Add your step to the path along the bottom.
 *
 * Pass the crumbs this screen is responsible for, and an empty list when it is
 * at its own top level. The comparison is on the labels, so handing over a
 * fresh array of the same names on every render costs nothing.
 */
export function useDeepTrail(crumbs: Crumb[], onPagePress?: () => void) {
  const { contribute } = useContext(Ctx);
  const focused = useIsFocused();
  // The route this screen belongs to, captured once. `usePathname` is global,
  // so reading it later would hand back wherever the app has since gone.
  const ownPath = useRef<string | null>(null);
  const nowPath = usePathname();
  if (ownPath.current === null) ownPath.current = nowPath;

  const id = useRef<symbol>(Symbol('trail'));
  const signature = crumbs
    .map((c) => `${c.label}:${c.onPress ? 'back' : 'here'}`)
    .join(' › ');
  const pagePressShape = onPagePress ? 'back' : 'here';

  // The crumbs carry onPress handlers, which are new functions on every render
  // and so cannot be compared directly. Keep the current values in refs and
  // give the trail stable forwarding handlers. The signature still records
  // whether each step is a door: opening a thread can turn its board name from
  // the current location into "Back to that board" without changing the label.
  const latest = useRef(crumbs);
  latest.current = crumbs;
  // Same reason as the crumb handlers: a new function every render, closing
  // over current state, so it is held in a ref rather than compared.
  const latestPagePress = useRef(onPagePress);
  latestPagePress.current = onPagePress;

  useEffect(() => {
    const me = id.current;
    const mine = ownPath.current ?? '';
    if (!focused) {
      contribute(me, null, mine);
      return;
    }
    const liveCrumbs = latest.current.map((crumb, index) => ({
      ...crumb,
      onPress: crumb.onPress
        ? () => latest.current[index]?.onPress?.()
        : undefined,
    }));
    const livePagePress = latestPagePress.current
      ? () => latestPagePress.current?.()
      : undefined;
    contribute(me, liveCrumbs, mine, livePagePress);
    return () => contribute(me, null, mine);
  }, [signature, pagePressShape, contribute, focused]);
}
