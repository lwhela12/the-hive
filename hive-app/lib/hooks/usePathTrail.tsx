import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

type Entry = { id: symbol; crumbs: Crumb[] };

type TrailContext = {
  entries: Entry[];
  contribute: (id: symbol, crumbs: Crumb[] | null) => void;
};

const Ctx = createContext<TrailContext>({ entries: [], contribute: () => {} });

export function PathTrailProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);

  const contribute = useMemo(() => (id: symbol, crumbs: Crumb[] | null) => {
    setEntries((current) => {
      if (crumbs === null) {
        const without = current.filter((e) => e.id !== id);
        return without.length === current.length ? current : without;
      }
      const at = current.findIndex((e) => e.id === id);
      if (at === -1) return [...current, { id, crumbs }];
      const next = current.slice();
      next[at] = { id, crumbs };
      return next;
    });
  }, []);

  const value = useMemo<TrailContext>(() => ({ entries, contribute }), [entries, contribute]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Everything below the page name, in the order you walked into it. */
export function usePathTrail(): Crumb[] {
  return useContext(Ctx).entries.flatMap((e) => e.crumbs);
}

/**
 * Add your step to the path along the bottom.
 *
 * Pass the crumbs this screen is responsible for, and an empty list when it is
 * at its own top level. The comparison is on the labels, so handing over a
 * fresh array of the same names on every render costs nothing.
 */
export function useDeepTrail(crumbs: Crumb[]) {
  const { contribute } = useContext(Ctx);
  const id = useRef<symbol>(Symbol('trail'));
  const signature = crumbs.map((c) => c.label).join(' › ');

  // The crumbs carry onPress handlers, which are new functions on every render
  // and so cannot be compared. The labels are what gets drawn; if those are
  // unchanged there is nothing to redraw, and the handlers close over current
  // state either way.
  const latest = useRef(crumbs);
  latest.current = crumbs;

  useEffect(() => {
    const me = id.current;
    contribute(me, latest.current);
    return () => contribute(me, null);
  }, [signature, contribute]);
}
