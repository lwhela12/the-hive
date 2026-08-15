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

/**
 * Daily's theme will only take plain hex. The deck's palette is not all hex —
 * every HIVE except OG derives its deep ink as `rgb(...)` and its soft border
 * as `rgba(...)` from that HIVE's accent — and handing those over got Nat
 * *"property 'theme': unsupported theme configuration"* instead of a call.
 *
 * Alpha is flattened onto the paper the panel sits on rather than dropped, so a
 * half-strength gold border still reads as the soft line it is.
 */
function toHex(color: string, over = '#fffdf5'): string | null {
  const value = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const [r, g, b] = value.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(',').map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return null;
  const alpha = parts.length > 3 && Number.isFinite(parts[3]) ? Math.min(1, Math.max(0, parts[3])) : 1;
  const base = alpha === 1 ? null : toHex(over);
  const ground = base
    ? [1, 3, 5].map((start) => parseInt(base.slice(start, start + 2), 16))
    : [255, 255, 255];
  const channels = parts.slice(0, 3).map((part, index) => {
    const flattened = Math.round(part * alpha + ground[index] * (1 - alpha));
    return Math.min(255, Math.max(0, flattened)).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

/** Every colour or none — a half-applied theme is worse than Daily's own. */
function deckTheme(accent: string, accentDeep: string, cardColor: string, softBorder: string) {
  const colors = {
    accent: toHex(accent),
    accentText: '#ffffff',
    background: toHex(cardColor),
    backgroundAccent: toHex(cardColor),
    baseText: toHex(accentDeep, cardColor),
    border: toHex(softBorder, cardColor),
    mainAreaBg: '#1c1a17',
    mainAreaBgAccent: toHex(accent),
    mainAreaText: '#ffffff',
    supportiveText: toHex(accentDeep, cardColor),
  };
  return Object.values(colors).every(Boolean)
    ? { colors: colors as Record<string, string> }
    : undefined;
}

export function DeckVideo({
  communityId,
  accent,
  accentDeep,
  cardColor,
  softBorder,
  fontSize,
  onLiveChange,
}: DeckVideoProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<DailyCall | null>(null);
  const [state, setState] = useState<State>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  // The deck decides how much room to give this panel, so it has to be told
  // when there is actually a call in it.
  const liveRef = useRef(onLiveChange);
  liveRef.current = onLiveChange;
  useEffect(() => {
    liveRef.current?.(state === 'live');
  }, [state]);

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
        // Daily allows exactly one call instance per page. A first attempt that
        // threw part-way — an unsupported theme, say — can leave one behind
        // that we never got a handle on, and every retry after it would fail
        // with "duplicate DailyIframe instances" instead of the real reason.
        const theme = deckTheme(accent, accentDeep, cardColor, softBorder);
        const stray = DailyIframe.getCallInstance?.();
        if (stray) await stray.destroy().catch(() => {});
        parent.replaceChildren?.();

        frame = DailyIframe.createFrame(parent, {
          showLeaveButton: true,
          showFullscreenButton: true,
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: '0',
            borderRadius: '14px',
          },
          // Spread rather than `theme: undefined` — Daily reads the key being
          // present as a theme it then has to make sense of.
          ...(theme ? { theme } : {}),
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
        flex: 1,
        minHeight: 0,
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
