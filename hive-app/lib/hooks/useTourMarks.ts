import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { membershipStillNeedsTour } from '../tourPolicy';
import { useAuth } from './useAuth';

/**
 * The welcome tour's start signal, and the record that it happened once.
 *
 * Nat, 2026-08-11: "lets make an onboarding wizard for each HIVE. It links to
 * your first welcome email & its skippable & never comes back."
 *
 * Two rules live here, and they are deliberately strict:
 *
 * 1. **Every membership created after the tour launched gets one.** Both
 *    accept paths still call `startHiveTour()` for an immediate hand-off, but
 *    the signed-in shell also recovers any new membership whose tour has not
 *    been finished or skipped. That database-backed recovery is the rule; the
 *    in-memory signal is only the fast path. Existing members from before the
 *    tour launched stay undisturbed.
 *
 * 2. **Any exit marks this membership cycle complete.** Finishing and
 *    skipping both upsert `tour_marks` (migration 167) — different `outcome`,
 *    same effect: this HIVE does not show this member the tour again while that
 *    membership remains current. If a membership is later removed and a fresh
 *    invitation creates a newer one, the old mark predates it and no longer
 *    suppresses the new welcome. The row lives in the database rather than
 *    localStorage so the promise survives a new browser, a phone, and a
 *    cleared cache.
 *
 * The start signal itself is a module-level variable plus a listener — the
 * same shape as `markJustJoinedHive` in app/_layout.tsx, for the same reason:
 * the join screen fires it before the signed-in shell (and the bar inside it)
 * has mounted, so the value has to wait somewhere that is not React state.
 * When the accept happens INSIDE the app (the invitation card on HIVE-Wide)
 * the bar is already mounted, so the listener hands the id over immediately.
 */

export type TourOutcome = 'finished' | 'skipped';

/** One row in tour_marks, as migration 167 shaped it. */
type TourMarkRow = {
  user_id: string;
  community_id: string;
  completed_at: string;
  outcome: TourOutcome;
};

// `tour_marks` is in types/index.ts's Database map (added 2026-08-11, same
// session the table was born), so the client reaches it directly.
const tourMarksTable = () => supabase.from('tour_marks');

/**
 * Existing members must never be retro-toured. This is the instant the tour
 * shipped (commit dfbfd33 / migration 167); memberships created from here on
 * are the product's "new member" boundary.
 */
const TOUR_LAUNCHED_AT = '2026-08-11T22:55:21.000Z';

type MembershipTourState = {
  community_id: string;
  created_at: string;
};

type CompletedTourState = {
  community_id: string;
  completed_at: string;
};

/** A tour asked for before the bar mounted, waiting to be picked up. */
let pendingTourCommunityId: string | null = null;
/** The mounted bar's ear, when there is one. */
let announceTour: ((communityId: string) => void) | null = null;

/**
 * Called by both accept paths the moment somebody genuinely joins a HIVE.
 * This is the ONLY way a tour ever starts — see the note at the top.
 */
export function startHiveTour(communityId: string): void {
  if (announceTour) {
    announceTour(communityId);
  } else {
    pendingTourCommunityId = communityId;
  }
}

/**
 * The tour's state, for the one bar that draws it.
 *
 * `tourCommunityId` is null for almost everybody almost always. It only holds
 * a HIVE id after a fresh join AND a confirmed absence of that HIVE's
 * tour_marks row — the double check means a member who joins the same HIVE
 * again on a second device (or re-walks an old invite link) is not toured
 * twice.
 */
export function useTourMarks(): {
  tourCommunityId: string | null;
  finishTour: () => void;
  skipTour: () => void;
} {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  // A tour that has been ASKED for, before the membership-cycle check answers.
  const [candidateId, setCandidateId] = useState<string | null>(null);
  // The tour that is actually allowed on screen.
  const [tourCommunityId, setTourCommunityId] = useState<string | null>(null);
  // After one tour closes, look for another outstanding new membership.
  const [discoveryTick, setDiscoveryTick] = useState(0);

  // Listen for startHiveTour(), and collect any signal that fired before this
  // hook existed — the email-link join happens outside the signed-in shell,
  // so its signal always arrives early.
  useEffect(() => {
    announceTour = setCandidateId;
    if (pendingTourCommunityId) {
      setCandidateId(pendingTourCommunityId);
      pendingTourCommunityId = null;
    }
    return () => {
      announceTour = null;
    };
  }, []);

  // Recover the rule from durable data, not from the hand-off signal. The
  // original implementation relied only on a module variable surviving the
  // join -> signed-in-shell transition. Real joins proved that transition can
  // remount/reload the bundle, losing the signal and dumping the member on
  // Home. Every post-launch membership without a completion from its own
  // membership cycle becomes a candidate here, in every HIVE and on every
  // device. Pre-launch memberships are excluded at the query boundary.
  useEffect(() => {
    if (!userId || candidateId || tourCommunityId) return;
    let cancelled = false;

    (async () => {
      const [{ data: membershipRows, error: membershipError }, { data: markRows, error: markError }] =
        await Promise.all([
          supabase
            .from('community_memberships')
            .select('community_id, created_at')
            .eq('user_id', userId)
            .gte('created_at', TOUR_LAUNCHED_AT)
            .order('created_at', { ascending: true }),
          tourMarksTable()
            .select('community_id, completed_at')
            .eq('user_id', userId),
        ]);

      if (cancelled) return;
      if (membershipError || markError) {
        console.warn(
          '[Tour] Could not recover an outstanding welcome tour:',
          membershipError?.message || markError?.message,
        );
        return;
      }

      const marksByCommunity = new Map(
        ((markRows ?? []) as CompletedTourState[]).map((mark) => [mark.community_id, mark.completed_at]),
      );
      const outstanding = ((membershipRows ?? []) as MembershipTourState[]).find((membership) =>
        membershipStillNeedsTour(
          membership.created_at,
          marksByCommunity.get(membership.community_id),
        ),
      );

      if (outstanding) setCandidateId((current) => current ?? outstanding.community_id);
    })();

    return () => {
      cancelled = true;
    };
  }, [candidateId, discoveryTick, tourCommunityId, userId]);

  // Validate an immediate start signal against the current membership cycle.
  // An older mark from a removed membership must not suppress a fresh invite;
  // a mark written after the current membership began keeps "never comes back"
  // true on every device.
  useEffect(() => {
    if (!candidateId || !userId) return;
    let cancelled = false;

    (async () => {
      const [{ data: membership, error: membershipError }, { data: mark, error: markError }] =
        await Promise.all([
          supabase
            .from('community_memberships')
            .select('created_at')
            .eq('user_id', userId)
            .eq('community_id', candidateId)
            .maybeSingle(),
          tourMarksTable()
            .select('completed_at')
            .eq('user_id', userId)
            .eq('community_id', candidateId)
            .maybeSingle(),
        ]);

      if (cancelled) return;
      setCandidateId(null);
      if (membershipError || markError) {
        console.warn(
          '[Tour] Could not check the current membership tour:',
          membershipError?.message || markError?.message,
        );
        return;
      }
      if (
        membership &&
        new Date(membership.created_at).getTime() >= new Date(TOUR_LAUNCHED_AT).getTime() &&
        membershipStillNeedsTour(membership.created_at, mark?.completed_at)
      ) {
        setTourCommunityId(candidateId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [candidateId, userId]);

  // Every exit writes the mark. The bar comes down immediately rather than
  // waiting on the network — the write is the memory, not the dismissal.
  const closeTour = useCallback(
    (outcome: TourOutcome) => {
      if (!tourCommunityId || !userId) return;
      const communityId = tourCommunityId;
      setTourCommunityId(null);

      void (async () => {
        const mark: TourMarkRow = {
          user_id: userId,
          community_id: communityId,
          completed_at: new Date().toISOString(),
          outcome,
        };
        const { error } = await tourMarksTable().upsert(mark, {
          onConflict: 'user_id,community_id',
        });
        if (error) {
          console.warn('[Tour] Could not write the tour mark:', error.message);
          return;
        }
        // One person may have joined more than one HIVE since their last visit.
        // Only after this durable write lands do we look for the next one.
        setDiscoveryTick((current) => current + 1);
      })();
    },
    [tourCommunityId, userId]
  );

  const finishTour = useCallback(() => closeTour('finished'), [closeTour]);
  const skipTour = useCallback(() => closeTour('skipped'), [closeTour]);

  return { tourCommunityId, finishTour, skipTour };
}
