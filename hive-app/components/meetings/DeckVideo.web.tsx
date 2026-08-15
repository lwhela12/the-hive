import { useCallback, useEffect, useRef, useState } from 'react';
import DailyIframe, { type DailyCall } from '@daily-co/daily-js';
import { supabase } from '../../lib/supabase';
import type { DeckVideoProps } from './DeckVideo';

/**
 * The meeting's faces, sitting next to the meeting's deck.
 *
 * Nat, 2026-08-15, on how a HIVE night has actually had to work: a laptop on a
 * stand at one end of the table for the deck, a second laptop under the frame
 * TV so its camera sees the whole table, Nick joining from Washington on a
 * machine nobody is sitting at — *"then no one's sitting by that computer so
 * the meeting aid doesn't, I don't know, it's just always very confusing."*
 *
 * One room per HIVE, opened by the `daily-room` edge function (which is the
 * only place the Daily key lives). Daily Prebuilt brings its own camera and mic
 * pickers, mute buttons, participant grid and screen share, so the deck does
 * not have to grow a second set of any of them.
 *
 * **The frame is created once and never re-created.** Tearing the iframe down
 * and building it again drops the call, so joining, leaving and re-joining all
 * happen inside the same frame, and the frame only goes away when you leave the
 * deck entirely.
 */

type State = 'idle' | 'opening' | 'live' | 'error';

export function DeckVideo({
  communityId,
  accent,
  accentDeep,
  cardColor,
  softBorder,
  height,
  fontSize,
}: DeckVideoProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<DailyCall | null>(null);
  const [state, setState] = useState<State>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  // Leaving the deck mid-call should hang up rather than leave a ghost of you
  // in the room with everybody looking at it.
  useEffect(() => {
    return () => {
      const frame = frameRef.current;
      frameRef.current = null;
      if (frame) {
        frame.leave().catch(() => {});
        frame.destroy().catch(() => {});
      }
    };
  }, []);

  const join = useCallback(async () => {
    if (!communityId || state === 'opening' || state === 'live') return;
    setProblem(null);
    setState('opening');
    try {
      const { data, error } = await supabase.functions.invoke('daily-room', {
        body: { community_id: communityId },
      });
      if (error) throw new Error(error.message);
      const { url, token } = (data ?? {}) as { url?: string; token?: string };
      if (!url) throw new Error('No room came back.');

      const parent = mountRef.current;
      if (!parent) throw new Error('Nowhere to put the video.');

      // Reuse the frame across a leave-then-rejoin; only build one the first
      // time, because building a second one in the same parent throws.
      let frame = frameRef.current;
      if (!frame) {
        frame = DailyIframe.createFrame(parent, {
          showLeaveButton: true,
          showFullscreenButton: true,
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: '0',
            borderRadius: '14px',
          },
          theme: {
            colors: {
              accent,
              accentText: '#ffffff',
              background: cardColor,
              backgroundAccent: cardColor,
              baseText: accentDeep,
              border: softBorder,
              mainAreaBg: '#1c1a17',
              mainAreaBgAccent: accent,
              mainAreaText: '#ffffff',
              supportiveText: accentDeep,
            },
          },
        });
        frameRef.current = frame;
        // The leave button is Daily's own, so the panel has to hear about it
        // from the frame rather than from a button of ours.
        frame.on('left-meeting', () => setState('idle'));
        frame.on('error', (event) => {
          setProblem(event?.errorMsg ?? 'The video dropped.');
          setState('error');
        });
      }

      await frame.join({ url, token });
      setState('live');
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not open the video room.');
      setState('error');
    }
  }, [communityId, state, accent, accentDeep, cardColor, softBorder]);

  const label =
    state === 'opening' ? 'Opening the room…' : state === 'error' ? 'Try again' : 'Join the video';

  return (
    <div
      style={{
        height,
        borderRadius: 14,
        border: `1px solid ${softBorder}`,
        backgroundColor: cardColor,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* The frame's home. It is always in the tree, so the call survives every
          re-render of the deck around it, and it only shows once we are live. */}
      <div
        ref={mountRef}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: state === 'live' ? 1 : 0,
          pointerEvents: state === 'live' ? 'auto' : 'none',
        }}
      />

      {state !== 'live' && (
        <div style={{ textAlign: 'center', padding: '0 14px', zIndex: 1 }}>
          <button
            type="button"
            onClick={join}
            disabled={state === 'opening' || !communityId}
            style={{
              fontFamily: 'Lato_700Bold, Lato, sans-serif',
              fontSize,
              color: '#fff',
              backgroundColor: accent,
              border: 'none',
              borderRadius: 999,
              padding: '9px 18px',
              cursor: state === 'opening' ? 'default' : 'pointer',
              opacity: state === 'opening' ? 0.7 : 1,
            }}
          >
            {label}
          </button>
          {problem && (
            <div
              style={{
                marginTop: 8,
                fontFamily: 'Lato_400Regular, Lato, sans-serif',
                fontSize: fontSize * 0.85,
                lineHeight: 1.35,
                color: accentDeep,
              }}
            >
              {problem}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
