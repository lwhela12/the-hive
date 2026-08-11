import { useIsFocused } from '@react-navigation/native';
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
 * One sky at a time — by asking who is actually on screen, not who mounted first.
 *
 * This used to hand out a ticket on MOUNT and only take it back on UNMOUNT, on
 * the theory that leaving a HIVE-Wide screen means leaving its component. It
 * doesn't: `app/(app)/_layout.tsx` puts every screen inside a `Tabs` navigator,
 * and React Navigation's tab screens stay mounted once you've opened them —
 * just hidden — so switching back to one doesn't lose its scroll position or
 * re-run its data fetch. That is also exactly why the ticket broke: it only
 * ever got handed to whichever HIVE-Wide screen was opened FIRST in a session,
 * and nothing ever gave it back, because nothing ever actually unmounted.
 * Every screen opened after that asked the queue for the sky and was told no,
 * forever — even while it was the one actually in front. That is why Members,
 * Boards, The Buzz and Messages went solid black (found 2026-08-11) while Home
 * and Admin, which never asked the queue at all and just always draw their own
 * copy of the globe, kept working.
 *
 * `useIsFocused` — the same check `SpaceGlobe` already uses to stop scheduling
 * its shooting star the moment a screen isn't the one in front — answers the
 * real question directly: React Navigation only ever calls one screen in a
 * navigator "focused" at a time, so gating on focus instead of mount order
 * gives "one sky at a time" for free, with no ticket to hand back and nothing
 * that can get stuck holding it.
 */
export function SpaceBackdrop() {
  const { wholeHive } = useAuth();
  const focused = useIsFocused();

  if (!wholeHive || !focused) return null;
  return <SpaceGlobe />;
}
