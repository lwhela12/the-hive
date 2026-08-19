import DailyIframe, { type DailyCall } from '@daily-co/daily-js';
import { supabase } from './supabase';

/**
 * The call that does not hang up when you walk away from the deck.
 *
 * Nat, 2026-08-19, after the first Production HIVE: *"I go in and out of the
 * meeting helper a lot... we were in the meeting helper, and then we were on
 * the research page, and then we were on the meeting helper, and then I opened
 * up the board, and then I went back... we need to make sure that if we have
 * the record button on, that it stays on."*
 *
 * It used to do the opposite. `DeckVideo` created the Daily frame inside its
 * own tree and its unmount cleanup called `leave()` and `destroy()`, so every
 * time she opened a board the room hung up and the transcript closed itself.
 * The meeting kept going; the recording of it did not.
 *
 * So the call does not live in the screen any more. The iframe is parented to
 * one fixed layer on `document.body` that React never owns and nothing ever
 * unmounts:
 *
 * - **Docked** — the deck is open, so the layer is moved to sit exactly over
 *   the panel's placeholder and looks like it is in the page.
 * - **Parked** — she has gone to a board, so the layer shrinks to a corner
 *   tile that says it is still recording and offers the way back.
 *
 * Either way the same iframe stays joined the whole evening. An iframe reloads
 * if you move it in the DOM, which is exactly what re-parenting it into each
 * new screen would do, so it is never moved — only measured and repositioned.
 *
 * Hanging up is a decision now, never a side effect of navigation, and the
 * transcript is kept at that moment and no other.
 */

export type CallState = 'idle' | 'opening' | 'live' | 'error';

export type DeckCallSnapshot = {
  state: CallState;
  problem: string | null;
  note: string | null;
  people: number;
  /** Which HIVE is on the call, so another HIVE's deck knows it is not this one. */
  communityId: string | null;
  transcribing: boolean;
};

type Theme = { colors: Record<string, string> } | undefined;

const PARKED_WIDTH = 248;
const PARKED_VIDEO_HEIGHT = 150;
const PARKED_CHROME_HEIGHT = 34;
const PARKED_MARGIN = 16;

let host: HTMLDivElement | null = null;
let chrome: HTMLDivElement | null = null;
let chromeLabel: HTMLSpanElement | null = null;
let mount: HTMLDivElement | null = null;
let frame: DailyCall | null = null;

let lines: string[] = [];
let isOwner = false;
let wantsTranscript = false;
let docked: HTMLElement | null = null;
let followRaf = 0;
let lastRect = '';
let onReturn: (() => void) | null = null;

let snapshot: DeckCallSnapshot = {
  state: 'idle',
  problem: null,
  note: null,
  people: 0,
  communityId: null,
  transcribing: false,
};

const listeners = new Set<(snapshot: DeckCallSnapshot) => void>();

function publish(patch: Partial<DeckCallSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener(snapshot));
}

export function subscribe(listener: (snapshot: DeckCallSnapshot) => void) {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot() {
  return snapshot;
}

/** Where "Back to the meeting" goes. The deck registers it; the layer calls it. */
export function setReturnHandler(handler: (() => void) | null) {
  onReturn = handler;
}

/**
 * Keep what has been said so far and start a clean page.
 *
 * Called when the call really ends — never when a screen unmounts, which is
 * the whole point of this file.
 */
async function keepTranscript() {
  const kept = lines;
  lines = [];
  const communityId = snapshot.communityId;
  publish({ transcribing: false });
  if (!kept.length || !communityId) return;
  try {
    await supabase.functions.invoke('save-transcript', {
      body: { community_id: communityId, transcript: kept.join('\n') },
    });
    publish({ note: 'Transcript saved to this meeting.' });
  } catch {
    publish({ note: 'The transcript could not be saved.' });
  }
}

function buildLayer() {
  if (host) return;

  host = document.createElement('div');
  host.setAttribute('data-hive-call', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    display: 'none',
    overflow: 'hidden',
    borderRadius: '14px',
    zIndex: '1200',
    boxSizing: 'border-box',
    flexDirection: 'column',
  } as CSSStyleDeclaration);

  // The parked tile's own bar. Plain DOM on purpose: this layer outlives every
  // React tree in the app, so nothing about it can depend on one being mounted.
  chrome = document.createElement('div');
  Object.assign(chrome.style, {
    display: 'none',
    alignItems: 'center',
    gap: '8px',
    height: `${PARKED_CHROME_HEIGHT}px`,
    padding: '0 10px',
    background: '#1c1a17',
    color: '#ffffff',
    font: '600 12px/1 Lato, system-ui, sans-serif',
    flex: '0 0 auto',
  } as CSSStyleDeclaration);

  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    background: '#e5484d',
    flex: '0 0 auto',
  } as CSSStyleDeclaration);

  chromeLabel = document.createElement('span');
  chromeLabel.textContent = 'Still on the call';
  Object.assign(chromeLabel.style, { flex: '1 1 auto', whiteSpace: 'nowrap' } as CSSStyleDeclaration);

  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Back';
  Object.assign(back.style, {
    font: '700 12px/1 Lato, system-ui, sans-serif',
    color: '#1c1a17',
    background: '#f2c14e',
    border: 'none',
    borderRadius: '999px',
    padding: '5px 10px',
    cursor: 'pointer',
    flex: '0 0 auto',
  } as CSSStyleDeclaration);
  back.onclick = () => onReturn?.();

  const hangUp = document.createElement('button');
  hangUp.type = 'button';
  hangUp.textContent = '✕';
  hangUp.title = 'Leave the call and keep the transcript';
  Object.assign(hangUp.style, {
    font: '700 13px/1 Lato, system-ui, sans-serif',
    color: '#ffffff',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    flex: '0 0 auto',
    padding: '4px',
  } as CSSStyleDeclaration);
  hangUp.onclick = () => {
    void leave();
  };

  chrome.append(dot, chromeLabel, back, hangUp);

  mount = document.createElement('div');
  Object.assign(mount.style, { flex: '1 1 auto', minHeight: '0' } as CSSStyleDeclaration);

  host.append(chrome, mount);
  document.body.appendChild(host);
}

/** Sit exactly over the placeholder the deck drew for us. */
function follow() {
  followRaf = 0;
  if (!host || !docked) return;
  const rect = docked.getBoundingClientRect();
  const key = `${rect.top}|${rect.left}|${rect.width}|${rect.height}`;
  if (key !== lastRect) {
    lastRect = key;
    Object.assign(host.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    } as CSSStyleDeclaration);
  }
  followRaf = requestAnimationFrame(follow);
}

function applyPlacement() {
  if (!host || !chrome) return;

  if (snapshot.state !== 'live') {
    host.style.display = 'none';
    if (followRaf) cancelAnimationFrame(followRaf);
    followRaf = 0;
    return;
  }

  host.style.display = 'flex';

  if (docked) {
    chrome.style.display = 'none';
    host.style.boxShadow = 'none';
    lastRect = '';
    if (!followRaf) followRaf = requestAnimationFrame(follow);
    return;
  }

  // Parked. The tile is the only thing on screen that says the room is still
  // being written down, so it does not get to be subtle.
  if (followRaf) cancelAnimationFrame(followRaf);
  followRaf = 0;
  chrome.style.display = 'flex';
  if (chromeLabel) {
    chromeLabel.textContent = snapshot.transcribing ? 'Still recording' : 'Still on the call';
  }
  Object.assign(host.style, {
    top: 'auto',
    left: 'auto',
    right: `${PARKED_MARGIN}px`,
    bottom: `${PARKED_MARGIN}px`,
    width: `${PARKED_WIDTH}px`,
    height: `${PARKED_VIDEO_HEIGHT + PARKED_CHROME_HEIGHT}px`,
    boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
  } as CSSStyleDeclaration);
}

/**
 * The deck is on screen: dock the layer over `placeholder`.
 * Called with `null` when the deck goes away, which parks it instead of
 * hanging up.
 */
export function dock(placeholder: HTMLElement | null) {
  buildLayer();
  docked = placeholder;
  if (docked) {
    host!.style.right = 'auto';
    host!.style.bottom = 'auto';
  }
  applyPlacement();
}

export function setTranscripts(on: boolean) {
  wantsTranscript = on;
  if (snapshot.state !== 'live' || !frame || !isOwner) return;
  if (on && !snapshot.transcribing) {
    try {
      frame.startTranscription();
    } catch {
      publish({ note: 'Daily would not start transcribing — the rest of the call is fine.' });
    }
  } else if (!on && snapshot.transcribing) {
    try {
      frame.stopTranscription();
    } catch {
      /* the stop event will not arrive; leaving still keeps the lines */
    }
    void keepTranscript();
  }
}

export async function join(options: { communityId: string; theme: Theme; transcriptsOn: boolean }) {
  const { communityId, theme, transcriptsOn } = options;
  if (!communityId || snapshot.state === 'opening' || snapshot.state === 'live') return;

  buildLayer();
  wantsTranscript = transcriptsOn;
  publish({ state: 'opening', problem: null, communityId });

  try {
    const { data, error } = await supabase.functions.invoke('daily-room', {
      body: { community_id: communityId },
    });
    if (error) throw new Error(error.message);
    const { url, token, isOwner: owner } = (data ?? {}) as {
      url?: string;
      token?: string;
      isOwner?: boolean;
    };
    if (!url) throw new Error('No room came back.');
    isOwner = !!owner;

    if (!frame) {
      // Daily allows exactly one call instance per page, and a first attempt
      // that threw part-way can leave one behind we never got a handle on.
      const stray = DailyIframe.getCallInstance?.();
      if (stray) await stray.destroy().catch(() => {});
      mount!.replaceChildren?.();

      frame = DailyIframe.createFrame(mount!, {
        showLeaveButton: true,
        showFullscreenButton: true,
        iframeStyle: { width: '100%', height: '100%', border: '0' },
        ...(theme ? { theme } : {}),
      });

      const countPeople = () => {
        const who = frame?.participants?.() ?? {};
        publish({ people: Math.max(1, Object.keys(who).length) });
      };
      frame.on('joined-meeting', countPeople);
      frame.on('participant-joined', countPeople);
      frame.on('participant-left', countPeople);

      // Daily's own leave button is a decision, so it hangs up for real.
      frame.on('left-meeting', () => {
        publish({ state: 'idle', people: 0 });
        applyPlacement();
        void keepTranscript();
      });
      frame.on('error', (event) => {
        publish({ state: 'error', problem: event?.errorMsg ?? 'The video dropped.' });
        applyPlacement();
        void keepTranscript();
      });

      frame.on('transcription-message', (event) => {
        if (!event?.text?.trim()) return;
        const who = frame?.participants?.() ?? {};
        const speaker = Object.values(who).find(
          (participant: any) => participant?.session_id === event.participantId
        ) as { user_name?: string } | undefined;
        lines.push(`${speaker?.user_name?.trim() || 'Someone'}: ${event.text.trim()}`);
      });
      frame.on('transcription-started', () => {
        publish({ transcribing: true, note: null });
        applyPlacement();
      });
      frame.on('transcription-stopped', () => publish({ transcribing: false }));
      frame.on('transcription-error', () => {
        publish({
          transcribing: false,
          note: 'Daily would not start transcribing — the rest of the call is fine.',
        });
      });
    }

    await frame.join({ url, token });
    publish({ state: 'live' });
    applyPlacement();

    // Only an owner may start it, and only if this HIVE has said yes. Daily
    // runs one transcription per room and ignores every other request.
    if (wantsTranscript && isOwner) {
      try {
        frame.startTranscription();
      } catch {
        publish({ note: 'Daily would not start transcribing — the rest of the call is fine.' });
      }
    }
  } catch (err) {
    publish({
      state: 'error',
      problem: err instanceof Error ? err.message : 'Could not open the video room.',
    });
    applyPlacement();
  }
}

/** Hang up on purpose. The only path that throws the transcript over the wall. */
export async function leave() {
  const call = frame;
  publish({ state: 'idle', people: 0 });
  applyPlacement();
  await keepTranscript();
  if (call) await call.leave().catch(() => {});
}
