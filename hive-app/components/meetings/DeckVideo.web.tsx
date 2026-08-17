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
  transcriptsOn,
  canToggleTranscripts,
  onToggleTranscripts,
  compact = false,
}: DeckVideoProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<DailyCall | null>(null);
  const [state, setState] = useState<State>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  /**
   * What has been said, in order, with the name of the microphone it came from.
   *
   * Daily transcribes each participant's OWN audio track, which is the whole
   * reason this is worth having for Tech HIVE and not for OG's dining room:
   * everyone on their own device gets their own name on every line, and a room
   * sharing one laptop is one microphone and therefore one name for the table.
   */
  const linesRef = useRef<string[]>([]);
  const transcribingRef = useRef(false);
  const isOwnerRef = useRef(false);
  const communityRef = useRef(communityId);
  communityRef.current = communityId;
  const wantsTranscriptRef = useRef(transcriptsOn);
  wantsTranscriptRef.current = transcriptsOn;
  const [transcriptNote, setTranscriptNote] = useState<string | null>(null);

  /** Hand the evening over to `save-transcript`, then start a clean page. */
  const keepTranscript = useCallback(async () => {
    const lines = linesRef.current;
    linesRef.current = [];
    transcribingRef.current = false;
    if (!lines.length || !communityRef.current) return;
    try {
      await supabase.functions.invoke('save-transcript', {
        body: { community_id: communityRef.current, transcript: lines.join('\n') },
      });
      setTranscriptNote('Transcript saved to this meeting.');
    } catch {
      setTranscriptNote('The transcript could not be saved.');
    }
  }, []);

  // The deck decides how much room to give this panel, so it has to be told
  // when there is actually a call in it.
  const liveRef = useRef(onLiveChange);
  liveRef.current = onLiveChange;
  useEffect(() => {
    liveRef.current?.(state === 'live');
  }, [state]);

  // Leaving the deck mid-call should hang up rather than leave a ghost of you
  // in the room with everybody looking at it — and whatever was said before you
  // went is kept rather than thrown away.
  useEffect(() => {
    return () => {
      const frame = frameRef.current;
      frameRef.current = null;
      void keepTranscript();
      if (frame) {
        frame.leave().catch(() => {});
        frame.destroy().catch(() => {});
      }
    };
  }, [keepTranscript]);

  // Throwing the switch during a call takes effect during that call: turning it
  // on starts writing from here, turning it off stops and keeps what there is
  // so far. Nobody has to leave and come back for the setting to mean anything.
  useEffect(() => {
    const frame = frameRef.current;
    if (state !== 'live' || !frame || !isOwnerRef.current) return;
    if (transcriptsOn && !transcribingRef.current) {
      try {
        frame.startTranscription();
      } catch {
        setTranscriptNote('Daily would not start transcribing — the rest of the call is fine.');
      }
    } else if (!transcriptsOn && transcribingRef.current) {
      try {
        frame.stopTranscription();
      } catch {
        /* the stop event will not arrive; the leave path still keeps the lines */
      }
      void keepTranscript();
    }
  }, [transcriptsOn, state, keepTranscript]);

  const join = useCallback(async () => {
    if (!communityId || state === 'opening' || state === 'live') return;
    setProblem(null);
    setState('opening');
    try {
      const { data, error } = await supabase.functions.invoke('daily-room', {
        body: { community_id: communityId },
      });
      if (error) throw new Error(error.message);
      const { url, token, isOwner } = (data ?? {}) as {
        url?: string;
        token?: string;
        isOwner?: boolean;
      };
      if (!url) throw new Error('No room came back.');
      isOwnerRef.current = !!isOwner;

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
        frame.on('left-meeting', () => {
          setState('idle');
          void keepTranscript();
        });
        frame.on('error', (event) => {
          setProblem(event?.errorMsg ?? 'The video dropped.');
          setState('error');
          void keepTranscript();
        });

        // Every finished line, with the speaker's own name in front of it.
        // `participants()` is asked at the moment the line lands rather than
        // cached, so somebody who joins mid-meeting is still named.
        frame.on('transcription-message', (event) => {
          if (!event?.text?.trim()) return;
          const who = frame!.participants?.() ?? {};
          const speaker = Object.values(who).find(
            (participant: any) => participant?.session_id === event.participantId
          ) as { user_name?: string } | undefined;
          const name = speaker?.user_name?.trim() || 'Someone';
          linesRef.current.push(`${name}: ${event.text.trim()}`);
        });
        frame.on('transcription-started', () => {
          transcribingRef.current = true;
          setTranscriptNote(null);
        });
        frame.on('transcription-stopped', () => {
          transcribingRef.current = false;
        });
        frame.on('transcription-error', () => {
          transcribingRef.current = false;
          setTranscriptNote('Daily would not start transcribing — the rest of the call is fine.');
        });
      }

      await frame.join({ url, token });
      setState('live');

      // Only an owner may start it, and only if this HIVE has said yes. A
      // member joining a HIVE that transcribes does not start a second one —
      // Daily runs one transcription per room and ignores the rest.
      if (wantsTranscriptRef.current && isOwnerRef.current) {
        try {
          frame.startTranscription();
        } catch {
          setTranscriptNote('Daily would not start transcribing — the rest of the call is fine.');
        }
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not open the video room.');
      setState('error');
    }
  }, [communityId, state, accent, accentDeep, cardColor, softBorder]);

  const label =
    state === 'opening' ? 'Opening the room…' : state === 'error' ? 'Try again' : 'Join the video';

  /**
   * Compact and nobody on the call yet. Declared up here because the switch
   * below is sized from it, and it was being sized from `compact` alone —
   * which is true on a phone whether or not anybody is on the call.
   */
  const idleCompact = compact && state !== 'live';

  /**
   * The transcript switch, sitting on top of the video panel.
   *
   * Nat asked for it here and nowhere else, 2026-08-15: *"as long as there's a
   * big, obvious toggle in the meeting helper, where the people join with the
   * video, that would be freaking awesome."* It says which way it is set even
   * to people who cannot change it, because everyone in the call deserves to
   * know whether the room is being written down.
   */
  const transcriptSwitch = (
    <button
      type="button"
      onClick={canToggleTranscripts ? () => onToggleTranscripts(!transcriptsOn) : undefined}
      disabled={!canToggleTranscripts}
      aria-pressed={transcriptsOn}
      title={
        canToggleTranscripts
          ? 'Whether this HIVE writes its meetings down'
          : 'Only a HIVE admin can change this'
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        // Only the idle ROW shares its main axis with anything. Once the call
        // is live the panel is a column again — and `flex: 1 1 auto` on a
        // column grows DOWNWARD, which turned this into a switch the height of
        // a playing card sitting on top of the video (Nat, 2026-08-17:
        // "it still looks sensationally bad in these 2 views on my phone").
        // Keyed on idleCompact now, never on `compact` alone.
        width: idleCompact ? 'auto' : '100%',
        flex: idleCompact ? '1 1 auto' : '0 0 auto',
        alignSelf: idleCompact ? undefined : 'stretch',
        minWidth: 0,
        fontFamily: 'Lato_700Bold, Lato, sans-serif',
        // A phone spends this space on the faces, not on a label.
        fontSize: fontSize * (compact ? 0.8 : 0.9),
        color: transcriptsOn ? '#ffffff' : accentDeep,
        backgroundColor: transcriptsOn ? accent : 'transparent',
        border: `1px solid ${transcriptsOn ? accent : softBorder}`,
        borderRadius: 999,
        padding: compact ? '4px 11px' : '7px 14px',
        marginBottom: idleCompact ? 0 : compact ? 5 : 8,
        cursor: canToggleTranscripts ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          height: 16,
          flex: '0 0 auto',
          borderRadius: 999,
          backgroundColor: transcriptsOn ? '#ffffff' : softBorder,
          position: 'relative',
          display: 'inline-block',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: transcriptsOn ? 16 : 2,
            width: 12,
            height: 12,
            borderRadius: 999,
            backgroundColor: transcriptsOn ? accent : '#ffffff',
            transition: 'left 120ms ease',
          }}
        />
      </span>
      {transcriptsOn ? 'Writing this meeting down' : 'Transcript off'}
    </button>
  );

  /**
   * Compact and nobody on the call yet: the switch and the way in share a row,
   * and the card below collapses to nothing instead of sitting there empty.
   *
   * **It collapses. It is never removed.** An earlier version of this returned
   * a different tree entirely and left `mountRef` unrendered — so `join()` hit
   * *"Nowhere to put the video"* and the button turned to "Try again" with no
   * reason given (Nat, 2026-08-17, on her phone: *"this 'join video' button
   * doesnt work"*). The mount point has to be in the DOM BEFORE anyone presses
   * join, because that is when Daily is handed it. One tree, one mount, always.
   */

  /**
   * Whatever went wrong, said where it happened.
   *
   * The compact row had no room for this and so said nothing at all: a button
   * reading "Try again" and not one word about what to try again FROM. A dead
   * end with no reason is worse than a dead end.
   */
  const problemLine = problem ? (
    <div
      style={{
        marginTop: 6,
        fontFamily: 'Lato_400Regular, Lato, sans-serif',
        fontSize: fontSize * 0.8,
        lineHeight: 1.3,
        color: accentDeep,
      }}
    >
      {problem}
    </div>
  ) : null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {idleCompact ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {transcriptSwitch}
            <button
              type="button"
              onClick={join}
              disabled={state === 'opening' || !communityId}
              style={{
                flex: '0 0 auto',
                fontFamily: 'Lato_700Bold, Lato, sans-serif',
                fontSize: fontSize * 0.9,
                color: '#fff',
                backgroundColor: accent,
                border: 'none',
                borderRadius: 999,
                padding: '8px 16px',
                whiteSpace: 'nowrap',
                cursor: state === 'opening' ? 'default' : 'pointer',
                opacity: state === 'opening' ? 0.7 : 1,
              }}
            >
              {state === 'opening' ? 'Opening…' : state === 'error' ? 'Try again' : 'Join video'}
            </button>
          </div>
          {problemLine}
          {transcriptNote ? (
            <div
              style={{
                marginTop: 6,
                fontFamily: 'Lato_400Regular, Lato, sans-serif',
                fontSize: fontSize * 0.8,
                lineHeight: 1.3,
                color: accentDeep,
              }}
            >
              {transcriptNote}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {transcriptSwitch}
          {transcriptNote && (
            <div
              style={{
                fontFamily: 'Lato_400Regular, Lato, sans-serif',
                fontSize: fontSize * 0.8,
                lineHeight: 1.35,
                color: accentDeep,
                marginBottom: 8,
              }}
            >
              {transcriptNote}
            </div>
          )}
        </>
      )}

      <div
        style={{
          // Collapsed rather than gone — see the note above the return.
          flex: idleCompact ? '0 0 0px' : 1,
          width: idleCompact ? 0 : undefined,
          minHeight: 0,
          borderRadius: 14,
          border: idleCompact ? 'none' : `1px solid ${softBorder}`,
          backgroundColor: idleCompact ? 'transparent' : cardColor,
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

      {state !== 'live' && !idleCompact && (
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
    </div>
  );
}
