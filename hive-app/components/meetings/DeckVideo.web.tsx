import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as deckCall from '../../lib/deckCall';
import * as roomRecorder from '../../lib/roomRecorder';
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
 * **The frame is created once and never re-created, and it does not live in
 * this component.** It lives in `lib/deckCall`, on a fixed layer attached to
 * the document, because this panel unmounts every time Nat opens a board
 * mid-meeting and the call used to hang up with it (2026-08-19). What is drawn
 * here is a placeholder; the layer is moved to sit exactly over it, and parks
 * itself in the corner when the deck goes away.
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
  onPeopleChange,
  compact = false,
}: DeckVideoProps) {
  const router = useRouter();
  // Not `mounted` — FOCUSED.
  //
  // Expo Router's tabs keep a screen mounted after you leave it, which is what
  // makes coming back instant and what made the first version of this wrong:
  // the unmount that was supposed to park the call never ran, so the video sat
  // docked at its last measured position, floating over the middle of the
  // Boards page (Nat, 2026-08-19, with a screenshot: *"it didn't go to the
  // bottom right"*). Focus is the thing that actually changes when she walks
  // away from the deck.
  const focused = useIsFocused();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [call, setCall] = useState<deckCall.DeckCallSnapshot>(deckCall.getSnapshot);
  const [tape, setTape] = useState<roomRecorder.RecorderSnapshot>(roomRecorder.getSnapshot);

  // The call is somebody else's HIVE if it is live on another community, and
  // this deck must not claim it, dock it, or offer to leave it.
  const mine = !call.communityId || call.communityId === communityId;
  const state = mine ? call.state : 'idle';
  const problem = mine ? call.problem : null;
  const transcriptNote = mine ? call.note : null;

  // The deck decides how much room to give this panel, so it has to be told
  // when there is actually a call in it.
  const liveRef = useRef(onLiveChange);
  liveRef.current = onLiveChange;
  const peopleRef = useRef(onPeopleChange);
  peopleRef.current = onPeopleChange;

  useEffect(() => deckCall.subscribe(setCall), []);
  useEffect(() => roomRecorder.subscribe(setTape), []);

  useEffect(() => {
    liveRef.current?.(state === 'live');
  }, [state]);

  useEffect(() => {
    peopleRef.current?.(mine ? call.people : 0);
  }, [call.people, mine]);

  // Dock the layer over this panel while the deck is the screen you are on;
  // park it in the corner the moment it is not. Leaving is a move, never a
  // hang-up.
  useEffect(() => {
    deckCall.dock(focused ? mountRef.current : null);
    return () => deckCall.dock(null);
  }, [state, focused]);

  // "Back" on the parked tile has to land somewhere, and the deck is the only
  // screen that knows where it lives.
  useEffect(() => {
    deckCall.setReturnHandler(() => router.push('/meeting-helper'));
    return () => deckCall.setReturnHandler(null);
  }, [router]);

  const join = useCallback(() => {
    if (!communityId) return;
    void deckCall.join({
      communityId,
      theme: deckTheme(accent, accentDeep, cardColor, softBorder),
    });
  }, [communityId, accent, accentDeep, cardColor, softBorder]);

  const label =
    state === 'opening' ? 'Opening the room…' : state === 'error' ? 'Try again' : 'Join the video';

  /** Nobody on the call. The panel is a choice, not an empty video box. */
  const idle = state !== 'live';
  /** A phone, idle: the two ways in share a row rather than stacking. */
  const idleCompact = compact && idle;

  const taping = tape.recording || tape.uploading || tape.unsaved;

  /**
   * Two ways to keep a meeting, and they are lettered.
   *
   * There were three controls here on the morning of 2026-08-19 — a transcript
   * switch, a record button and a join button — and Nat could not tell them
   * apart: *"I wouldn't know which one to do, or if I hadn't done it a while,
   * I might get confused."* Making the call always transcribe got it to two,
   * and two was still not enough, because both of them named a THING rather
   * than a choice: *"'record the room' kind of looks like it could be a video,
   * and then 'join the video' ... and then it has that 'either way the meeting
   * gets written down' and that's a lot of text."*
   *
   * So they are A and B under one heading, which is what she asked for in the
   * same breath: *"option A is video and transcribe, option B is just
   * transcriptions."* The letters carry the "these are alternatives" that a
   * sentence underneath was carrying badly, and the heading carries the "both
   * of these keep the meeting" — so the explaining line is gone.
   */
  const heading = (
    <div
      style={{
        fontFamily: 'Lato_700Bold, Lato, sans-serif',
        fontSize: fontSize * 0.72,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: accentDeep,
        opacity: 0.75,
        marginBottom: 6,
      }}
    >
      Keep this meeting
    </div>
  );

  const optionStyle = (chosen: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: idleCompact ? ('auto' as const) : ('100%' as const),
    flex: '0 0 auto',
    minWidth: 0,
    fontFamily: 'Lato_700Bold, Lato, sans-serif',
    fontSize: fontSize * (compact ? 0.8 : 0.9),
    color: chosen ? '#ffffff' : accentDeep,
    backgroundColor: chosen ? accent : 'transparent',
    border: `1px solid ${chosen ? accent : softBorder}`,
    borderRadius: 999,
    padding: compact ? '5px 12px' : '8px 14px',
    marginBottom: idleCompact ? 0 : 6,
    textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const,
  });

  const letter = (mark: string, chosen: boolean) => (
    <span
      aria-hidden
      style={{
        flex: '0 0 auto',
        width: 18,
        height: 18,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fontSize * 0.72,
        color: chosen ? accent : '#ffffff',
        backgroundColor: chosen ? '#ffffff' : accentDeep,
      }}
    >
      {mark}
    </span>
  );

  const optionA = (
    <button
      type="button"
      onClick={join}
      disabled={state === 'opening' || !communityId || taping}
      title="Open the video room. A call is always written down."
      style={{
        ...optionStyle(false),
        cursor: state === 'opening' || taping ? 'default' : 'pointer',
        opacity: communityId && !taping ? 1 : 0.5,
      }}
    >
      {letter('A', false)}
      {state === 'opening' ? 'Opening…' : state === 'error' ? 'Try again' : 'Video + transcript'}
    </button>
  );

  const optionB = (
    <button
      type="button"
      onClick={() => {
        if (tape.uploading) return;
        if (tape.unsaved) return void roomRecorder.retry();
        if (tape.recording) return void roomRecorder.stop();
        if (communityId) void roomRecorder.start(communityId);
      }}
      disabled={!communityId || tape.uploading}
      aria-pressed={tape.recording}
      title="Record this room from this laptop's microphone. No video, and it keeps going if you leave the deck."
      style={{
        ...optionStyle(tape.recording),
        backgroundColor: tape.recording ? '#c8321f' : 'transparent',
        borderColor: tape.recording ? '#c8321f' : softBorder,
        cursor: communityId && !tape.uploading ? 'pointer' : 'default',
        opacity: communityId ? 1 : 0.5,
      }}
    >
      {tape.recording ? (
        <span
          aria-hidden
          style={{ flex: '0 0 auto', width: 12, height: 12, borderRadius: 3, backgroundColor: '#ffffff' }}
        />
      ) : (
        letter('B', false)
      )}
      {tape.uploading
        ? 'Saving…'
        : tape.unsaved
          ? 'Retry save'
          : tape.recording
            ? `Stop · ${roomRecorder.clockFace(tape.seconds)}`
            : 'Transcript only'}
    </button>
  );

  /** Whatever went wrong, said where it happened rather than as "Try again". */
  const line = (text: string) => (
    <div
      style={{
        marginTop: 4,
        marginBottom: 6,
        fontFamily: 'Lato_400Regular, Lato, sans-serif',
        fontSize: fontSize * 0.8,
        lineHeight: 1.35,
        color: accentDeep,
      }}
    >
      {text}
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* B is on its own once it is running: offering "video + transcript" mid
          recording reads like a second thing to press, and it is not. */}
      {idle && !taping ? (
        <>
          {!idleCompact && heading}
          <div
            style={{
              display: 'flex',
              flexDirection: idleCompact ? 'row' : 'column',
              alignItems: idleCompact ? 'center' : 'stretch',
              gap: idleCompact ? 8 : 0,
              minWidth: 0,
              flexWrap: 'wrap',
            }}
          >
            {optionA}
            {optionB}
          </div>
        </>
      ) : (
        // Live, or taping: only the control that means anything now.
        !idle ? null : optionB
      )}

      {problem ? line(problem) : null}
      {tape.problem ? line(tape.problem) : null}
      {!taping && tape.note ? line(tape.note) : null}
      {transcriptNote ? line(transcriptNote) : null}

      <div
        style={{
          // Collapsed rather than gone.
          //
          // **It collapses. It is never removed.** An earlier version returned
          // a different tree entirely and left `mountRef` unrendered — so
          // `join()` hit *"Nowhere to put the video"* and the button turned to
          // "Try again" with no reason given (Nat, 2026-08-17, on her phone:
          // *"this 'join video' button doesnt work"*). The mount point has to
          // be in the DOM BEFORE anyone presses join. One tree, one mount.
          //
          // It collapses whenever there is no call now, not only on a phone —
          // idle on a laptop it was a tall empty card with a button floating in
          // the middle of it, which is most of the panel spent saying nothing.
          flex: idle ? '0 0 0px' : 1,
          width: idle ? 0 : undefined,
          minHeight: 0,
          borderRadius: 14,
          border: idle ? 'none' : `1px solid ${softBorder}`,
          backgroundColor: idle ? 'transparent' : cardColor,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Where the call SITS, not where it lives. `lib/deckCall` measures this
            box every frame and moves its own fixed layer over it, so the video
            reads as part of the panel while surviving this panel's unmount. */}
        <div ref={mountRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}
