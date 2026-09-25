import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { getFirstName } from './useArrivalBoard';

/**
 * The Meeting Helper, shared.
 *
 * Nat, 2026-08-15: *"if I'm leading the meeting ... when I click next, it goes
 * next for everyone ... if we're all in there together, then you can either
 * watch up on the TV or if we're like at a restaurant or something, you can
 * follow along on your phone because it'll click along as I click along."*
 *
 * One row in `deck_sessions` per HIVE says who is driving and which slide the
 * room is on (migration 182). This hook is the two sides of that row:
 *
 * - the presenter writes their slide to it on every move
 * - everyone else's deck reads it and lands on the same slide
 *
 * **Following is a soft leash.** A follower who taps the dots or presses Back
 * stops following and goes where they wanted — with a pill offering to catch
 * back up. Nobody's screen gets yanked out from under their thumb.
 */

export type DeckSession = {
  presenterId: string;
  presenterName: string;
  slideKey: string;
  /**
   * The presenter's controls for the slide they are on, keyed by slide key
   * (migration 237). A slide with dials on it reads its own key and mirrors
   * them; every other slide ignores this entirely.
   */
  slideState: Record<string, unknown> | null;
  /** True when the presenter is you. */
  isMine: boolean;
};

type Row = {
  community_id: string;
  presenter_id: string;
  slide_key: string;
  slide_state: Record<string, unknown> | null;
  presenter?: { name: string | null } | null;
};

export type UseDeckSession = {
  /** The live session for this HIVE, or null when nobody is presenting. */
  session: DeckSession | null;
  /** You are the one driving. */
  isPresenting: boolean;
  /**
   * Somebody else is driving and your deck is moving with theirs. False while
   * you look around on your own, and false when nobody is presenting at all.
   */
  isFollowing: boolean;
  /** Someone else is presenting and you have wandered off their slide. */
  hasWanderedOff: boolean;
  /** Start driving this HIVE's deck from the slide you are on. */
  startPresenting: (slideKey: string, state?: Record<string, unknown>) => Promise<void>;
  /** Put the deck down. Everyone keeps the slide they are on. */
  stopPresenting: () => Promise<void>;
  /** Presenter only — tell the room where you just moved to. */
  publishSlide: (slideKey: string, state?: Record<string, unknown>) => void;
  /**
   * Presenter only — tell the room where your dials are now. Debounced, because
   * a slider drag is a hundred events and the room only needs the last one.
   */
  publishSlideState: (slideKey: string, state: Record<string, unknown>) => void;
  /** Stop being pulled along; you are looking around on your own now. */
  lookAround: () => void;
  /** Snap back to the presenter's slide and start following again. */
  catchUp: () => void;
  /** True once the first read has come back, so the UI can hold its tongue. */
  ready: boolean;
  /** The presenter's last room write failed; their own screen may be ahead. */
  syncError: boolean;
};

export function useDeckSession(
  communityId: string | null,
  myId: string | null,
  /** Called when the room moves and you are following. */
  onRoomMoved: (slideKey: string) => void
): UseDeckSession {
  const [session, setSession] = useState<DeckSession | null>(null);
  const [ready, setReady] = useState(false);
  const [wandered, setWandered] = useState(false);
  const [syncError, setSyncError] = useState(false);

  // `onRoomMoved` is a fresh closure every render; the subscription must not
  // tear down and rebuild every time the deck re-renders, so it reads the
  // latest callback through a ref instead of depending on it.
  const movedRef = useRef(onRoomMoved);
  movedRef.current = onRoomMoved;

  const wanderedRef = useRef(wandered);
  wanderedRef.current = wandered;

  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  const toSession = useCallback((row: Row | null, viewerId: string | null): DeckSession | null => {
    if (!row) return null;
    const name = row.presenter?.name ?? '';
    return {
      presenterId: row.presenter_id,
      presenterName: name ? getFirstName(name) : 'Whoever has the deck',
      slideKey: row.slide_key,
      slideState: (row.slide_state as Record<string, unknown> | null) ?? null,
      isMine: !!viewerId && row.presenter_id === viewerId,
    };
  }, []);

  const readSession = useCallback(async () => {
    if (!communityId) return null;
    const { data, error } = await supabase
      .from('deck_sessions')
      .select('community_id, presenter_id, slide_key, slide_state, presenter:profiles!deck_sessions_presenter_id_fkey(name)')
      .eq('community_id', communityId)
      .maybeSingle();
    if (error) {
      console.warn('Could not refresh the room deck', error);
      return undefined;
    }
    return (data as Row | null) ?? null;
  }, [communityId]);

  useEffect(() => {
    if (!communityId) {
      setSession(null);
      setReady(true);
      return;
    }

    let cancelled = false;
    let readSequence = 0;
    let pollCount = 0;
    let roomIsActive = false;

    const apply = (row: Row | null, { moveMe }: { moveMe: boolean }) => {
      if (cancelled) return;
      const next = toSession(row, myIdRef.current);
      roomIsActive = !!next;
      setSession(next);
      // The presenter's own screen is the source of the slide, so it never
      // takes one back from the row it just wrote.
      if (moveMe && next && !next.isMine && !wanderedRef.current) {
        movedRef.current(next.slideKey);
      }
      // Nobody is presenting any more — there is nothing left to have wandered
      // away from.
      if (!next) setWandered(false);
    };

    const refreshRoom = async () => {
      const sequence = ++readSequence;
      const row = await readSession();
      if (sequence !== readSequence) return;
      if (row !== undefined) apply(row, { moveMe: true });
      if (!cancelled) setReady(true);
    };

    // Land on the room's slide when you open the deck mid-meeting.
    void refreshRoom();

    const channel = supabase
      .channel(`deck-session:${communityId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deck_sessions',
          filter: `community_id=eq.${communityId}`,
        },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            ++readSequence;
            apply(null, { moveMe: false });
            return;
          }
          // The change event carries the row but not the presenter's name, and
          // a name is what the pill says — so re-read rather than guess.
          await refreshRoom();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refreshRoom();
      });

    // Realtime can miss an update while a TV browser tab sleeps or reconnects.
    // An active room checks again quickly; an idle deck checks less often so it
    // can still discover a new presenter after a missed INSERT.
    const poll = setInterval(() => {
      if (roomIsActive || ++pollCount % 4 === 0) void refreshRoom();
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [communityId, readSession, toSession]);

  const startPresenting = useCallback(
    async (slideKey: string, state?: Record<string, unknown>) => {
      if (!communityId || !myId) return;
      // Whoever presses Present takes the wheel — one row per HIVE, so this is
      // an upsert, and the previous presenter's deck starts following theirs.
      const { error } = await supabase.from('deck_sessions').upsert(
        {
          community_id: communityId,
          presenter_id: myId,
          slide_key: slideKey,
          slide_state: state ? { [slideKey]: state } : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'community_id' }
      );
      if (error) {
        console.warn('Could not present this deck to the room', error);
        setSyncError(true);
        return;
      }
      setSyncError(false);
      setWandered(false);
      const row = await readSession();
      if (row !== undefined) setSession(toSession(row, myId));
    },
    [communityId, myId, readSession, toSession]
  );

  const stopPresenting = useCallback(async () => {
    if (!communityId) return;
    const { error } = await supabase.from('deck_sessions').delete().eq('community_id', communityId);
    if (error) {
      console.warn('Could not end the room deck', error);
      setSyncError(true);
      return;
    }
    setSyncError(false);
    setSession(null);
    setWandered(false);
  }, [communityId]);

  // Keep writes in tap order. A fast card-open, option change, and next-slide
  // sequence must reach the room in that order even when requests take longer.
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const queueUpdate = useCallback((patch: Record<string, unknown>) => {
    if (!communityId || !myId) return;
    writeQueue.current = writeQueue.current.then(async () => {
      const { error } = await supabase
        .from('deck_sessions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('community_id', communityId)
        .eq('presenter_id', myId);
      if (error) {
        console.warn('Could not share this slide change with the room', error);
        setSyncError(true);
      } else {
        setSyncError(false);
      }
    }).catch((error) => {
      console.warn('Could not share this slide change with the room', error);
      setSyncError(true);
    });
  }, [communityId, myId]);

  // Coalesce a quick run of taps into the latest visible choice.
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingState = useRef<Record<string, unknown> | null>(null);
  const publishSlideState = useCallback(
    (slideKey: string, state: Record<string, unknown>) => {
      if (!communityId || !myId) return;
      pendingState.current = { [slideKey]: state };
      setSession((current) =>
        current && current.isMine ? { ...current, slideState: pendingState.current } : current
      );
      if (stateTimer.current) return;
      stateTimer.current = setTimeout(() => {
        const payload = pendingState.current;
        stateTimer.current = null;
        if (!payload) return;
        queueUpdate({ slide_state: payload });
      }, 100);
    },
    [communityId, myId, queueUpdate]
  );

  useEffect(() => () => {
    if (stateTimer.current) clearTimeout(stateTimer.current);
  }, []);

  const publishSlide = useCallback(
    (slideKey: string, state?: Record<string, unknown>) => {
      if (!communityId || !myId) return;
      if (stateTimer.current) clearTimeout(stateTimer.current);
      stateTimer.current = null;
      pendingState.current = null;
      const slideState = state ? { [slideKey]: state } : null;
      setSession((current) =>
        current && current.isMine ? { ...current, slideKey, slideState } : current
      );
      queueUpdate({ slide_key: slideKey, slide_state: slideState });
    },
    [communityId, myId, queueUpdate]
  );

  const lookAround = useCallback(() => setWandered(true), []);

  const catchUp = useCallback(() => {
    setWandered(false);
    if (session && !session.isMine) movedRef.current(session.slideKey);
  }, [session]);

  const isPresenting = !!session?.isMine;
  const someoneElseIsPresenting = !!session && !session.isMine;

  return {
    session,
    isPresenting,
    isFollowing: someoneElseIsPresenting && !wandered,
    hasWanderedOff: someoneElseIsPresenting && wandered,
    startPresenting,
    stopPresenting,
    publishSlide,
    publishSlideState,
    lookAround,
    catchUp,
    ready,
    syncError,
  };
}
