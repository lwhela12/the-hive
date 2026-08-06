import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/hooks/useAuth';
import { SpaceGlobe } from './SpaceGlobe';

/**
 * The world, behind whatever page you are standing on at HIVE-Wide.
 *
 * The globe used to live on the HIVE-Wide landing page and nowhere else, so
 * Members, Boards, Messages, The Buzz and App Feedback were flat black —
 * technically "space", but an empty room rather than a place. Nat, 2026-08-03:
 * "lets make sure we can see him on every tab."
 *
 * It answers `wholeHive` itself, the same way AppHeader answers it, so a screen
 * mounts one component and never has to know the rule. Inside a HIVE it renders
 * nothing at all — no canvas, no animation frame, no cost.
 *
 * Mount it as the FIRST child of a screen's root view and leave the scrolling
 * content transparent; it fills the parent absolutely and does not take touches.
 */

/**
 * One sky at a time.
 *
 * The backdrop fills its parent edge to edge, so a second one stacked on the
 * first is an identical picture painted twice — two canvases, two animation
 * loops, double the drawing for a screen that looks exactly the same. Boards
 * has had two of them side by side since 2026-08-06 (`board.tsx`, the pair at
 * the top of the wide layout), which made the slowest HIVE-Wide screen the one
 * doing the most work.
 *
 * Every backdrop takes a ticket on mount and the earliest one holds the sky.
 * When it leaves, the next in line picks it up, so removing a duplicate at the
 * call site later changes nothing.
 */
const queue: symbol[] = [];
const watchers = new Set<() => void>();

export function SpaceBackdrop() {
  const { wholeHive } = useAuth();

  const ticket = useRef<symbol | null>(null);
  if (ticket.current === null) ticket.current = Symbol('space-backdrop');
  const id = ticket.current;

  // Starts true so a lone backdrop paints on its very first frame; a duplicate
  // corrects itself the moment the effects run.
  const [holding, setHolding] = useState(true);

  useEffect(() => {
    if (!wholeHive) return;
    const check = () => setHolding(queue[0] === id);
    watchers.add(check);
    queue.push(id);
    watchers.forEach((w) => w());
    return () => {
      const at = queue.indexOf(id);
      if (at >= 0) queue.splice(at, 1);
      watchers.delete(check);
      watchers.forEach((w) => w());
    };
  }, [wholeHive, id]);

  if (!wholeHive || !holding) return null;
  return <SpaceGlobe />;
}
