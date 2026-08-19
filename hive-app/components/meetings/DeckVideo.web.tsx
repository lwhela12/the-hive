import { useCallback, useEffect, useRef, useState } from 'react';
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
  transcriptsOn,
  canToggleTranscripts,
  onToggleTranscripts,
  compact = false,
}: DeckVideoProps) {
  const router = useRouter();
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

  // Dock the layer over this panel while the deck is open; park it in the
  // corner when the deck goes away. Unmounting is a move, never a hang-up.
  useEffect(() => {
    deckCall.dock(mountRef.current);
    return () => deckCall.dock(null);
  }, [state]);

  // "Back" on the parked tile has to land somewhere, and the deck is the only
  // screen that knows where it lives.
  useEffect(() => {
    deckCall.setReturnHandler(() => router.push('/meeting-helper'));
    return () => deckCall.setReturnHandler(null);
  }, [router]);

  // Throwing the switch during a call takes effect during that call: on starts
  // writing from here, off stops and keeps what there is so far.
  useEffect(() => {
    if (!mine) return;
    deckCall.setTranscripts(transcriptsOn);
  }, [transcriptsOn, state, mine]);

  const join = useCallback(() => {
    if (!communityId) return;
    void deckCall.join({
      communityId,
      theme: deckTheme(accent, accentDeep, cardColor, softBorder),
      transcriptsOn,
    });
  }, [communityId, accent, accentDeep, cardColor, softBorder, transcriptsOn]);

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
   * Record the room.
   *
   * The switch above is the video call's transcription and needs somebody on
   * the call for there to be anything to transcribe. This is the other case,
   * and it is the one a HIVE night in a dining room actually is — Nat, after
   * Production met around Charlee's table and kept nothing (2026-08-19):
   * *"if everyone's in the same room, then I just hit the record button on my
   * meeting helper."* One microphone, this laptop's, no call required.
   *
   * It keeps running when she leaves the deck for a board, because the
   * recording lives in `lib/roomRecorder` rather than in this panel.
   */
  const taping = tape.recording || tape.uploading || tape.unsaved;
  const recordLabel = tape.uploading
    ? 'Saving…'
    : tape.unsaved
      ? 'Retry save'
      : tape.recording
        ? `Stop · ${roomRecorder.clockFace(tape.seconds)}`
        : 'Record the room';

  const recordButton = (
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
      title="Record this room from this laptop's microphone — it keeps going if you leave the deck"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: idleCompact ? 'auto' : '100%',
        flex: '0 0 auto',
        alignSelf: idleCompact ? undefined : 'stretch',
        minWidth: 0,
        fontFamily: 'Lato_700Bold, Lato, sans-serif',
        fontSize: fontSize * (compact ? 0.8 : 0.9),
        color: tape.recording ? '#ffffff' : accentDeep,
        backgroundColor: tape.recording ? '#c8321f' : 'transparent',
        border: `1px solid ${tape.recording ? '#c8321f' : softBorder}`,
        borderRadius: 999,
        padding: compact ? '4px 11px' : '7px 14px',
        marginBottom: idleCompact ? 0 : compact ? 5 : 8,
        cursor: communityId && !tape.uploading ? 'pointer' : 'default',
        opacity: communityId ? 1 : 0.6,
        textAlign: 'left',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          flex: '0 0 auto',
          borderRadius: tape.recording ? 3 : 999,
          backgroundColor: tape.recording ? '#ffffff' : '#c8321f',
        }}
      />
      {recordLabel}
    </button>
  );

  const tapeNote = tape.problem || (taping ? null : tape.note) ? (
    <div
      style={{
        marginBottom: 8,
        fontFamily: 'Lato_400Regular, Lato, sans-serif',
        fontSize: fontSize * 0.8,
        lineHeight: 1.35,
        color: accentDeep,
      }}
    >
      {tape.problem ?? tape.note}
    </div>
  ) : null;

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
            {transcriptSwitch}
            {recordButton}
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
          {tapeNote}
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
          {recordButton}
          {tapeNote}
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
      {/* Where the call SITS, not where it lives. `lib/deckCall` measures this
          box every frame and moves its own fixed layer over it, so the video
          reads as part of the panel while surviving this panel's unmount. */}
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

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
