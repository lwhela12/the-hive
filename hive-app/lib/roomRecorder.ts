import { supabase } from './supabase';

/**
 * The room's own recording — one microphone, and it keeps going when you leave
 * the screen.
 *
 * Nat, 2026-08-19, the morning after Production met around Charlee's dining
 * table with nothing written down: *"I definitely, definitely think 100% of the
 * time we always want transcriptions, because you just never know."* And one
 * microphone rather than everybody's: *"if we had everyone toggle on their mics
 * to record different speakers, the feedback would be crazy. So I think we just
 * want the one, I'll just toggle on the recording."*
 *
 * This is deliberately NOT the video call's transcription (`lib/deckCall`).
 * That one needs somebody to join a call and labels every line with the name of
 * the microphone it came from, which is worth having when everyone is on their
 * own device. A HIVE in one room is one microphone either way, so this path
 * skips the call entirely: the presenting laptop records, AssemblyAI splits it
 * into Speaker A / Speaker B / Speaker C afterwards, and the whole thing lands
 * on the same meeting Wrap-Up seals.
 *
 * Like the call, it lives at module scope and not in a screen, because the
 * reason it exists is that Nat walks away from the deck constantly mid-meeting:
 * *"we need to make sure that if we have the record button on, that it stays
 * on."* Nothing here is unmounted by navigation. The only things that stop it
 * are the stop button and closing the tab — and the tab asks first.
 */

export type RecorderSnapshot = {
  recording: boolean;
  /** Seconds of audio so far, for the timer on the button. */
  seconds: number;
  uploading: boolean;
  /** An upload that failed with the audio still in hand, waiting on Retry. */
  unsaved: boolean;
  note: string | null;
  problem: string | null;
  communityId: string | null;
};

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let ticker: ReturnType<typeof setInterval> | null = null;
let wakeLock: any = null;
let pill: HTMLDivElement | null = null;
let pillTime: HTMLSpanElement | null = null;

let pending: Blob | null = null;

let snapshot: RecorderSnapshot = {
  recording: false,
  seconds: 0,
  uploading: false,
  unsaved: false,
  note: null,
  problem: null,
  communityId: null,
};

const listeners = new Set<(snapshot: RecorderSnapshot) => void>();

function publish(patch: Partial<RecorderSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener(snapshot));
  paintPill();
}

export function subscribe(listener: (snapshot: RecorderSnapshot) => void) {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot() {
  return snapshot;
}

export function clockFace(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/**
 * The one thing on screen that says the room is being recorded.
 *
 * Plain DOM, attached to the document, for the same reason the call's tile is:
 * every React tree in the app unmounts as Nat moves between the deck, the
 * boards and the research, and a recording indicator that goes with them is
 * not an indicator.
 */
function paintPill() {
  if (typeof document === 'undefined') return;

  if (!snapshot.recording && !snapshot.uploading && !snapshot.unsaved) {
    pill?.remove();
    pill = null;
    pillTime = null;
    return;
  }

  if (!pill) {
    pill = document.createElement('div');
    Object.assign(pill.style, {
      position: 'fixed',
      left: '16px',
      bottom: '16px',
      zIndex: '1300',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '7px 13px',
      borderRadius: '999px',
      background: '#1c1a17',
      color: '#ffffff',
      font: '700 12px/1 Lato, system-ui, sans-serif',
      boxShadow: '0 8px 22px rgba(0,0,0,0.28)',
    } as CSSStyleDeclaration);

    const dot = document.createElement('span');
    Object.assign(dot.style, {
      width: '9px',
      height: '9px',
      borderRadius: '999px',
      background: '#e5484d',
      flex: '0 0 auto',
    } as CSSStyleDeclaration);

    const label = document.createElement('span');
    label.textContent = 'Recording the room';

    pillTime = document.createElement('span');
    Object.assign(pillTime.style, { opacity: '0.75', fontVariantNumeric: 'tabular-nums' } as CSSStyleDeclaration);

    pill.append(dot, label, pillTime);
    document.body.appendChild(pill);
  }

  if (pillTime) {
    pillTime.textContent = snapshot.unsaved
      ? 'not saved yet'
      : snapshot.uploading
        ? 'saving…'
        : clockFace(snapshot.seconds);
  }
}

/** A refresh mid-meeting would throw the recording away, so it has to ask. */
function guardUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = '';
}

export async function start(communityId: string) {
  if (snapshot.recording || snapshot.uploading || !communityId) return;
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    publish({ problem: 'This browser will not let the page reach a microphone.' });
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    publish({ problem: 'The microphone was blocked. Allow it in the browser and start again.' });
    return;
  }

  chunks = [];
  // Speech at 32 kbps: a two-hour HIVE lands around 29 MB rather than 200.
  const options: MediaRecorderOptions = { audioBitsPerSecond: 32000 };
  if (MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')) {
    options.mimeType = 'audio/webm;codecs=opus';
  }
  recorder = new MediaRecorder(stream, options);
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  // A chunk a second, so a browser that dies mid-meeting has lost a second of
  // audio rather than the whole evening sitting in one unwritten buffer.
  recorder.start(1000);

  publish({ recording: true, seconds: 0, unsaved: false, note: null, problem: null, communityId });
  ticker = setInterval(() => publish({ seconds: snapshot.seconds + 1 }), 1000);
  window.addEventListener('beforeunload', guardUnload);

  try {
    wakeLock = await (navigator as any).wakeLock?.request('screen');
  } catch {
    /* the laptop may sleep; the recording is still running until it does */
  }
}

export async function stop() {
  const active = recorder;
  const communityId = snapshot.communityId;
  if (!active || !snapshot.recording) return;

  if (ticker) clearInterval(ticker);
  ticker = null;
  window.removeEventListener('beforeunload', guardUnload);

  const finished = new Promise<void>((resolve) => {
    active.onstop = () => resolve();
  });
  active.stop();
  await finished;

  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  recorder = null;
  try {
    await wakeLock?.release();
  } catch { /* nothing to release */ }
  wakeLock = null;

  const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
  chunks = [];
  publish({ recording: false });

  if (!blob.size || !communityId) {
    publish({ problem: 'That recording came back empty — nothing was saved.' });
    return;
  }

  pending = blob;
  await save();
}

/**
 * Put the audio where it belongs.
 *
 * The blob is held until this succeeds. An upload that fails on a bad hotel
 * wifi must not be the moment two hours of a HIVE meeting stops existing, so
 * the failure leaves the recording in hand and says Retry rather than throwing
 * it away and offering advice about a Stop button that has already been
 * pressed.
 */
async function save() {
  const blob = pending;
  const communityId = snapshot.communityId;
  if (!blob || !communityId || snapshot.uploading) return;

  publish({ uploading: true, unsaved: false, problem: null, note: 'Saving the recording…' });
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `${communityId}/room/${stamp}.webm`;
    const { error: uploadError } = await supabase.storage
      .from('meeting-recordings')
      .upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.functions.invoke('save-recording', {
      body: { community_id: communityId, storage_path: path },
    });
    if (error) throw error;

    pending = null;
    publish({
      uploading: false,
      unsaved: false,
      note: (data as { transcribing?: boolean } | null)?.transcribing
        ? 'Recording saved. The transcript lands in Meeting Summaries in a few minutes.'
        : 'Recording saved to this meeting. Transcribing it did not start — it can be run again from the summary.',
    });
  } catch (error) {
    console.error('Could not save the room recording:', error);
    publish({
      uploading: false,
      unsaved: true,
      note: null,
      problem: 'The recording did not upload — it is still here. Stay on this page and tap Retry.',
    });
  }
}

/** The way back from a failed upload. The audio never left. */
export async function retry() {
  await save();
}
