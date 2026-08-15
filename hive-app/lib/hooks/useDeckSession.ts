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
  /** True when the presenter is you. */
  isMine: boolean;
};

type Row = {
  community_id: string;
  presenter_id: string;
  slide_key: string;
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
  startPresenting: (slideKey: string) => Promise<void>;
  /** Put the deck down. Everyone keeps the slide they are on. */
  stopPresenting: () => Promise<void>;
  /** Presenter only — tell the room where you just moved to. */
  publishSlide: (slideKey: string) => void;
  /** Stop being pulled along; you are looking around on your own now. */
  lookAround: () => void;
  /** Snap back to the presenter's slide and start following again. */
  catchUp: () => void;
  /** True once the first read has come back, so the UI can hold its tongue. */
  ready: boolean;
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
      isMine: !!viewerId && row.presenter_id === viewerId,
    };
  }, []);

  const readSession = useCallback(async () => {
    if (!communityId) return null;
    const { data } = await supabase
      .from('deck_sessions')
      .select('community_id, presenter_id, slide_key, presenter:profiles!deck_sessions_presenter_id_fkey(name)')
      .eq('community_id', communityId)
      .maybeSingle();
    return (data as Row | null) ?? null;
  }, [communityId]);

  useEffect(() => {
    if (!communityId) {
      setSession(null);
      setReady(true);
      return;
    }

    let cancelled = false;

    const apply = (row: Row | null, { moveMe }: { moveMe: boolean }) => {
      if (cancelled) return;
      const next = toSession(row, myIdRef.current);
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

    // Land on the room's slide when you open the deck mid-meeting.
    readSession().then((row) => {
      apply(row, { moveMe: true });
      if (!cancelled) setReady(true);
    });

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
            apply(null, { moveMe: false });
            return;
          }
          // The change event carries the row but not the presenter's name, and
          // a name is what the pill says — so re-read rather than guess.
          const row = await readSession();
          apply(row, { moveMe: true });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [communityId, readSession, toSession]);

  const startPresenting = useCallback(
    async (slideKey: string) => {
      if (!communityId || !myId) return;
      // Whoever presses Present takes the wheel — one row per HIVE, so this is
      // an upsert, and the previous presenter's deck starts following theirs.
      await supabase.from('deck_sessions').upsert(
        {
          community_id: communityId,
          presenter_id: myId,
          slide_key: slideKey,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'community_id' }
      );
      setWandered(false);
      const row = await readSession();
      setSession(toSession(row, myId));
    },
    [communityId, myId, readSession, toSession]
  );

  const stopPresenting = useCallback(async () => {
    if (!communityId) return;
    await supabase.from('deck_sessions').delete().eq('community_id', communityId);
    setSession(null);
    setWandered(false);
  }, [communityId]);

  // Every click writes a row. A meeting is a few dozen clicks, so this stays a
  // handful of tiny writes — but they must not overtake each other, or a fast
  // double-tap can leave the room a slide behind. Latest write wins.
  const seqRef = useRef(0);
  const publishSlide = useCallback(
    (slideKey: string) => {
      if (!communityId || !myId) return;
      const seq = ++seqRef.current;
      setSession((current) => (current && current.isMine ? { ...current, slideKey } : current));
      supabase
        .from('deck_sessions')
        .update({ slide_key: slideKey, updated_at: new Date().toISOString() })
        .eq('community_id', communityId)
        .eq('presenter_id', myId)
        .then(() => {
          if (seq !== seqRef.current) return;
        });
    },
    [communityId, myId]
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
    lookAround,
    catchUp,
    ready,
  };
}
