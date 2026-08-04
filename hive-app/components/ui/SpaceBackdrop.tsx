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
export function SpaceBackdrop() {
  const { wholeHive } = useAuth();
  if (!wholeHive) return null;
  return <SpaceGlobe />;
}
