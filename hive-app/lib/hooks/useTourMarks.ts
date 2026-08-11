import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';

/**
 * The welcome tour's start signal, and the record that it happened once.
 *
 * Nat, 2026-08-11: "lets make an onboarding wizard for each HIVE. It links to
 * your first welcome email & its skippable & never comes back."
 *
 * Two rules live here, and they are deliberately strict:
 *
 * 1. **The tour starts ONLY when a join says so.** Both accept paths — the
 *    email link (app/join.tsx) and the in-app invitation card
 *    (components/ui/PendingInviteDoor.tsx) — call `startHiveTour()` the moment
 *    the membership is real. Nothing else ever starts it. The alternative —
 *    "no tour_marks row yet? show the tour" — would greet every existing
 *    member of every HIVE with a walkthrough of an app they already live in,
 *    which is noise, not a welcome. Absence of a mark means "never toured",
 *    and for everyone who joined before the tour existed that is the correct,
 *    permanent answer.
 *
 * 2. **Any exit writes the mark, and the mark is forever.** Finishing and
 *    skipping both insert a row into `tour_marks` (migration 167) — different
 *    `outcome`, same effect: this HIVE never shows this member the tour again,
 *    on any device. The row lives in the database rather than localStorage
 *    because "never comes back" has to survive a new browser, a phone, and a
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
  outcome: TourOutcome;
};

// `tour_marks` is in types/index.ts's Database map (added 2026-08-11, same
// session the table was born), so the client reaches it directly.
const tourMarksTable = () => supabase.from('tour_marks');

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

  // A tour that has been ASKED for, before the once-only check has answered.
  const [candidateId, setCandidateId] = useState<string | null>(null);
  // The tour that is actually allowed on screen.
  const [tourCommunityId, setTourCommunityId] = useState<string | null>(null);

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

  // The once-only check. A candidate only becomes the live tour if the
  // database has no mark for this member and this HIVE. On any doubt — the
  // check itself failing included — no tour: a member who never sees it loses
  // five sentences, a member who sees it twice loses trust in "never comes
  // back".
  useEffect(() => {
    if (!candidateId || !userId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await tourMarksTable()
        .select('community_id')
        .eq('user_id', userId)
        .eq('community_id', candidateId)
        .maybeSingle();

      if (cancelled) return;
      setCandidateId(null);
      if (error) {
        console.warn('[Tour] Could not check the tour mark, so no tour:', error.message);
        return;
      }
      if (!data) setTourCommunityId(candidateId);
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
          outcome,
        };
        const { error } = await tourMarksTable().insert(mark);
        // 23505 is "row already there" — a second device won the race, and the
        // answer it wrote is the same answer: never again. Anything else is
        // worth a line in the console, and nothing more: the tour only ever
        // starts from an explicit join, so a lost write cannot bring it back.
        if (error && error.code !== '23505') {
          console.warn('[Tour] Could not write the tour mark:', error.message);
        }
      })();
    },
    [tourCommunityId, userId]
  );

  const finishTour = useCallback(() => closeTour('finished'), [closeTour]);
  const skipTour = useCallback(() => closeTour('skipped'), [closeTour]);

  return { tourCommunityId, finishTour, skipTour };
}
