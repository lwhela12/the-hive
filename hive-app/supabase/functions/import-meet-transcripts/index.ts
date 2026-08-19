/**
 * The Meet transcripts come home.
 *
 * Nat and Lucas, 2026-08-19: **Tech HIVE meets on Google Meet.** Everybody in
 * Tech is remote on their own machine, Meet is free where the in-app video is
 * metered, and the Library pipeline was already built on Meet transcripts. Nat,
 * on the last manual step left in that chain: *"let's have an auto import from
 * that, that'd be great."*
 *
 * Before this, a Meet transcript was a Google Doc sitting in Drive waiting for
 * somebody to notice it, open it, copy it, and paste it into HIVE. This function
 * is that person.
 *
 * ============================================================================
 * TWO THINGS MUST BE TRUE BEFORE THIS CAN READ ANYTHING (both verified missing
 * on 2026-08-19, both need a person)
 * ============================================================================
 *
 * 1. **The HIVE Google token needs permission to read Drive.**
 *    `scripts/get-google-token.js` asks for `calendar.events` and nothing else.
 *    Add `https://www.googleapis.com/auth/drive.readonly` to its SCOPES, run it
 *    again with consent forced, and store the new `HIVE_GOOGLE_REFRESH_TOKEN`.
 *
 * 2. **The transcripts folder has to be shared with the HIVE Google account.**
 *    They live in `Default Folder for Meeting Recordings`
 *    (`1iuPeidhXAMzLWNxc3L2nCxjYR9at_qzh`), which is owned by
 *    **natwalstead@gmail.com** — Nat's personal account, not the account whose
 *    refresh token this app holds. Until Nat shares that folder read-only with
 *    the HIVE account, the folder does not exist as far as this function is
 *    concerned.
 *
 * These two failures look nothing alike in a log — one is a 403 from the API,
 * the other is a folder id that simply is not there — so each is reported in its
 * own words below rather than as "Drive said no".
 *
 * ## Where the documents actually are (Drive, checked 2026-08-19)
 *
 * Not in the recordings folder itself. Each meeting gets its own subfolder named
 * `YYYY-MM-DD — <event title>`, and the five artifacts sit inside it:
 *
 *     2026-08-13 — Le Mis Tech Podcast Call — Outline
 *     2026-08-13 — Le Mis Tech Podcast Call — Chat
 *     2026-08-13 — Le Mis Tech Podcast Call — Recording
 *     2026-08-13 — Le Mis Tech Podcast Call — Notes by Gemini
 *     2026-08-13 — Le Mis Tech Podcast Call — Transcript (Google Meet)
 *
 * So this looks one level down: the subfolders of the recordings folder, then
 * the documents in those. With no folder configured it searches the whole Drive
 * by name instead, which also works and is slower.
 *
 * ## The three name shapes
 *
 * 1. The common one today, after a Hermes automation renames them:
 *    `2026-08-13 — Le Mis Tech Podcast Call — Transcript (Google Meet)`
 * 2. Google Meet's own, untouched:
 *    `Hive Meeting - 2026/06/10 17:40 PDT - Transcript`
 * 3. An ad-hoc Meet with no calendar event behind it, named after the meeting
 *    code: `kwj-uivt-gti (2025-11-26 16:43 GMT-8) - Chat Transcript`
 *
 * The first two are read. The third is **skipped and says so**: a meeting code
 * is not a title, there is no calendar event to match it against, and there is
 * no honest way to guess whose conversation it was.
 *
 * "Notes by Gemini" is a different artifact from a transcript and goes through
 * its own door, `import-meeting-notes`. So do Recording, Outline and Chat.
 *
 * ## Which HIVE does this transcript belong to? — the conservative ladder
 *
 * Filing a transcript against the wrong HIVE puts one community's private
 * conversation inside another one. There is no undo for that in anybody's
 * memory, so this function would rather do nothing.
 *
 * Two signals are trusted, in order:
 *
 *   1. **The name says a HIVE by name** — "Tech HIVE", "OG HIVE", "Production
 *    HIVE". The HIVE's own word has to be sitting next to the word HIVE.
 *    A bare "tech" is not a signal, and the real Drive proves why: the most
 *    recent transcript in there is `Le Mis Tech Podcast Call`, which is Kelly's
 *    podcast and has nothing to do with Tech HIVE. Naming two HIVEs is not a
 *    signal either, it is a coin toss, so that skips.
 *   2. **The title is a scheduled meeting's title** — an `events` row with
 *    `event_type = 'meeting'` within a day either side. `schedule-meeting`
 *    writes the calendar event, Meet names the folder and the document after it,
 *    so this is the same string coming back around.
 *
 * **The date on its own is deliberately NOT a signal.** Nat is on Google Meet
 * all week for work that has nothing to do with a HIVE — Density calls, Le Mis
 * Tech, client calls. "Only one HIVE met that day, so this must be theirs" would
 * quietly file a client call into Tech HIVE. A day is a coincidence; a name is
 * an answer.
 *
 * When neither signal lands, the document is skipped with its reason in the
 * reply, and an owner can file it by hand with one call (see `document_id` +
 * `community` in the body). A skipped document is looked at again on every run,
 * so adding the missing meeting to the calendar is enough to make it import
 * itself next time.
 *
 * This mostly earns its keep on future Tech HIVE meetings. Nat's whole Drive
 * holds exactly one native Meet transcript from the last two months, so there is
 * almost nothing to backfill — hence a modest default window that `days` widens
 * on request.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

/**
 * How far back to look when nobody says. Two weeks covers a missed cron, a
 * holiday, and a meeting that ran late — and there is no backlog to sweep up,
 * so a longer default would only be work nobody asked for. `days` widens it.
 */
const DEFAULT_LOOKBACK_DAYS = 14;
/** One run's ceiling, so a wide `days` cannot time out mid-import. */
const MAX_DOCUMENTS_PER_RUN = 25;
/** How many per-meeting subfolders one Drive query may name at once. */
const PARENTS_PER_QUERY = 30;

/**
 * `Default Folder for Meeting Recordings` in Nat's Drive. Set it as a secret
 * rather than hard-coding it, so the day the folder moves is a secret change and
 * not a deploy. Leave it unset to search the whole Drive by name.
 */
const TRANSCRIPT_FOLDER_ID = Deno.env.get('MEET_TRANSCRIPTS_FOLDER_ID') ?? '';

const PACIFIC_TZ = 'America/Los_Angeles';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOC_MIME = 'application/vnd.google-apps.document';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

type Body = {
  /** How many days back to look in Drive. Defaults to 14. */
  days?: number;
  /** Look at everything but write nothing — the reply says what WOULD happen. */
  dry_run?: boolean;
  /** Owner only: file this one document, named by its Drive id. */
  document_id?: string;
  /** Owner only, with `document_id`: file it into this HIVE (slug or id), signal or no signal. */
  community?: string;
};

type CommunityRow = { id: string; name: string; slug: string };

type DriveFile = {
  id: string;
  name: string;
  createdTime?: string;
  webViewLink?: string;
};

type Verdict =
  | { ok: true; community: CommunityRow; matchedBy: string; meetingDate: string }
  | { ok: false; why: string };

/* ---------------------------------------------------------------- Google ---- */

/**
 * The HIVE's own Google account, exchanged for an hour's access.
 *
 * Same three secrets and the same call `schedule-meeting`, `update-meeting` and
 * `delete-meeting` already make — one credential for Google across the whole
 * app, so there is one thing to re-mint if it ever expires rather than four.
 */
async function getGoogleAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get('HIVE_GOOGLE_REFRESH_TOKEN');
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing Google credentials in environment');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Google token: ${await response.text()}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

/**
 * Google's refusals, told apart.
 *
 * A missing permission and a folder that was never shared are two different jobs
 * for two different people, and they read identically in a log unless somebody
 * writes them down separately. So: a 401 or 403 is the scope, a 404 is the
 * sharing, and everything else says what Google actually said.
 */
function driveFailure(status: number, detail: string): Error {
  if (status === 401 || status === 403) {
    return new Error(
      'Google would not let the HIVE account read Drive. Two things do this, and it is '
      + 'almost always the first: (1) the HIVE Google token is missing the drive.readonly '
      + 'permission — add it to scripts/get-google-token.js, run the script again with '
      + 'consent forced, and store the new HIVE_GOOGLE_REFRESH_TOKEN; or (2) the token has '
      + `the permission and the folder is shared with someone else. Google said: ${detail}`,
    );
  }
  if (status === 404) {
    return new Error(
      'Google could not find that folder or document. The recordings folder is owned by '
      + 'natwalstead@gmail.com, so the HIVE Google account cannot see it until Nat shares '
      + `it read-only with that account. Google said: ${detail}`,
    );
  }
  return new Error(`Drive returned ${status}: ${detail}`);
}

async function driveGet(accessToken: string, url: URL): Promise<Response> {
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw driveFailure(response.status, await response.text());
  return response;
}

function driveListUrl(query: string): URL {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id,name,createdTime,webViewLink)');
  url.searchParams.set('orderBy', 'createdTime desc');
  url.searchParams.set('pageSize', '200');
  // A meeting hosted from a shared drive files its artifacts there. Asking for
  // both costs nothing and stops a silent empty result.
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  return url;
}

/** One file or folder's metadata. Returns null when it is not there to be seen. */
async function getDriveItem(accessToken: string, id: string): Promise<DriveFile | null> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`);
  url.searchParams.set('fields', 'id,name,createdTime,webViewLink');
  url.searchParams.set('supportsAllDrives', 'true');
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw driveFailure(response.status, await response.text());
  return await response.json() as DriveFile;
}

/**
 * The per-meeting subfolders — `2026-08-13 — Le Mis Tech Podcast Call` and its
 * siblings. A folder is made when the meeting's artifacts are saved, so its
 * created time is the meeting's. Two days of slack on the near edge, because a
 * call that runs past midnight saves on the following day.
 */
async function listMeetingFolders(
  accessToken: string,
  parentId: string,
  sinceIso: string,
): Promise<DriveFile[]> {
  const query = [
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
    `'${parentId}' in parents`,
    `createdTime > '${sinceIso}'`,
  ].join(' and ');
  const response = await driveGet(accessToken, driveListUrl(query));
  const data = await response.json() as { files?: DriveFile[] };
  return data.files ?? [];
}

/**
 * The Google Docs that look like transcripts.
 *
 * `name contains 'Transcript'` catches both live name shapes — the renamed
 * `… — Transcript (Google Meet)` and Meet's own `… - Transcript`. What comes
 * back is sieved again in code, because Drive's `contains` is generous and the
 * other four artifacts share the folder.
 */
async function listTranscriptDocs(
  accessToken: string,
  sinceIso: string,
  parentIds: string[] | null,
): Promise<DriveFile[]> {
  const base = [
    `mimeType = '${DOC_MIME}'`,
    'trashed = false',
    "name contains 'Transcript'",
    `createdTime > '${sinceIso}'`,
  ];

  // No folder configured: the whole Drive, by name.
  if (!parentIds) {
    const response = await driveGet(accessToken, driveListUrl(base.join(' and ')));
    const data = await response.json() as { files?: DriveFile[] };
    return data.files ?? [];
  }
  if (parentIds.length === 0) return [];

  // Drive takes one query string, so a long parent list is asked in batches.
  const found = new Map<string, DriveFile>();
  for (let index = 0; index < parentIds.length; index += PARENTS_PER_QUERY) {
    const batch = parentIds.slice(index, index + PARENTS_PER_QUERY);
    const parents = batch.map((id) => `'${id}' in parents`).join(' or ');
    const response = await driveGet(accessToken, driveListUrl([...base, `(${parents})`].join(' and ')));
    const data = await response.json() as { files?: DriveFile[] };
    for (const file of data.files ?? []) found.set(file.id, file);
  }
  return [...found.values()];
}

/** The words themselves. Drive exports a Google Doc as plain text for us. */
async function readDocText(accessToken: string, documentId: string): Promise<string> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}/export`);
  url.searchParams.set('mimeType', 'text/plain');
  url.searchParams.set('supportsAllDrives', 'true');
  const response = await driveGet(accessToken, url);
  return await response.text();
}

/* --------------------------------------------------------- reading a name ---- */

/**
 * Is this the spoken transcript, or one of its four housemates?
 *
 * `Notes by Gemini` is the meeting's summary and has its own door
 * (`import-meeting-notes`). `Chat` is what people typed in the sidebar, which is
 * a different record of a different thing — and Meet writes it as "Chat
 * Transcript" on an ad-hoc call, which is exactly the sort of near-miss that
 * fills a meeting record with the wrong words.
 */
function isSpokenTranscript(name: string): boolean {
  if (!/transcript/i.test(name)) return false;
  if (/notes\s+by\s+gemini/i.test(name)) return false;
  if (/chat\s+transcript/i.test(name)) return false;
  if (/\b(recording|outline)\b/i.test(name)) return false;
  return true;
}

function pacificDate(instant: Date): string {
  // en-CA formats as YYYY-MM-DD, which is what `meetings.date` holds.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function shiftDate(isoDate: string, days: number): string {
  const shifted = new Date(`${isoDate}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * When the meeting was.
 *
 * Both name shapes carry the date — `2026-08-13 — …` in front, or
 * `… - 2026/06/10 17:40 PDT - …` in the middle — and that is the date in the
 * room's own clock, which beats the file's created time. A call that runs past
 * midnight gets a Drive timestamp on the wrong day; the name still says the
 * right one.
 */
function transcriptDate(file: DriveFile): string {
  const fromName = file.name.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (fromName) return `${fromName[1]}-${fromName[2]}-${fromName[3]}`;
  const created = file.createdTime ? new Date(file.createdTime) : new Date();
  return pacificDate(Number.isNaN(created.getTime()) ? new Date() : created);
}

/** Lower case, punctuation flattened to single spaces — for comparing two titles. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** A date stamp standing on its own: `2026-08-13`, `2026/06/10 17:40 PDT`. */
function isDateSegment(segment: string): boolean {
  return /^\d{4}[-/]\d{2}[-/]\d{2}([\sT].*)?$/.test(segment.trim());
}

/** One of Meet's five artifact words, with or without a parenthetical after it. */
function isArtifactSegment(segment: string): boolean {
  return /^(transcript|chat|chat transcript|recording|outline|notes by gemini)\b/i
    .test(segment.trim().replace(/\s*\([^)]*\)\s*$/, ''));
}

/**
 * A Google Meet code — `kwj-uivt-gti`. Three letters, four, three. It is what
 * Meet falls back to when a call had no calendar event behind it, which is
 * precisely the case this function cannot place.
 */
function isMeetingCode(segment: string): boolean {
  return /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(segment.trim().replace(/\s*\([^)]*\)\s*$/, '').trim());
}

/**
 * The calendar event's title, dug out of either name shape.
 *
 * Both are the same idea with the pieces in a different order — a date, a title,
 * an artifact, separated by a spaced dash. Split on the dash, throw away the
 * segments that are a date or an artifact, and the title is what is left. That
 * reads `2026-08-13 — Le Mis Tech Podcast Call — Transcript (Google Meet)` and
 * `Hive Meeting - 2026/06/10 17:40 PDT - Transcript` with one rule instead of
 * two, and a third shape nobody has thought of yet has a fair chance too.
 *
 * The meeting code is returned separately because it is not a title, and the
 * caller needs to be able to say so.
 */
function readName(name: string): { title: string; meetingCode: string | null } {
  const segments = name.split(/\s+[—–-]\s+/).map((part) => part.trim()).filter(Boolean);
  const kept = segments.filter((s) => !isDateSegment(s) && !isArtifactSegment(s));

  const code = kept.find((s) => isMeetingCode(s));
  if (code) return { title: '', meetingCode: code.replace(/\s*\([^)]*\)\s*$/, '').trim() };

  // The trailing "(2025-11-26 16:43 GMT-8)" that Meet's own naming puts after a
  // title belongs to the clock, not the title.
  const title = kept.map((s) => s.replace(/\s*\([^)]*\)\s*$/, '')).join(' ').trim();
  return { title: normalise(title), meetingCode: null };
}

/**
 * The words that distinguish one HIVE from another, with the word HIVE itself
 * thrown away — every HIVE has it, so it identifies none of them. OG HIVE keeps
 * "og"; Tech HIVE keeps "tech"; Production HIVE keeps "production" and answers
 * to its slug "show" as well. OG's slug is `default`, which means nothing to a
 * person naming a meeting, so it is not a signal.
 */
function hiveWords(community: CommunityRow): string[] {
  const words = new Set<string>();
  for (const word of normalise(community.name).split(' ')) {
    if (word.length >= 2 && word !== 'hive' && word !== 'h') words.add(word);
  }
  const slug = normalise(community.slug);
  if (slug.length >= 2 && slug !== 'default' && slug !== 'hive') words.add(slug);
  return [...words];
}

/**
 * Does this name say a HIVE, or does it merely contain one of its words?
 *
 * The HIVE's word has to be sitting next to the word HIVE — "Tech HIVE", "HIVE
 * Tech". A bare "tech" is not a signal and the real Drive is the proof: the most
 * recent transcript in it is `Le Mis Tech Podcast Call`, which is Kelly's
 * podcast, recorded outside HIVE on purpose. "Show" is worse — it is an ordinary
 * English word that turns up in half the meeting titles anybody writes.
 *
 * The cost of being this strict is a HIVE meeting titled loosely falls through
 * to the calendar-event signal below, or is skipped and named in the reply. The
 * cost of being loose is a podcast recording inside Tech HIVE's meeting record.
 */
function nameNamesHive(docName: string, community: CommunityRow): boolean {
  const haystack = ` ${normalise(docName)} `;
  return hiveWords(community).some(
    (word) => haystack.includes(` ${word} hive `) || haystack.includes(` hive ${word} `),
  );
}

/* ------------------------------------------------------------------ run ---- */

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body: Body = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Body;
  } catch { /* an empty body is a plain "go and look" */ }

  /**
   * Two ways in, and only two — the same door `check-in-reminder` and `library`
   * have. The cron calls with the service key, which nothing outside the backend
   * holds. Nat and Lucas can run it by hand while signed in.
   *
   * A service-role function that never reads the Authorization header is a hole,
   * not a design: this one reads Drive and writes into any HIVE, so an open door
   * would let a stranger pull a private conversation into a community.
   */
  const authHeader = req.headers.get('Authorization') ?? '';
  const calledByCron = !!serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`;
  let callerIsOwner = false;
  if (!calledByCron) {
    // One refusal for every road in, so a stranger learns nothing from which
    // wording came back.
    const refusal = 'The Meet transcript import runs on its own schedule.';
    const auth = await verifySupabaseJwt(authHeader);
    if (isAuthError(auth)) return errorResponse(refusal, 403);
    if (!(await isOwner(admin, auth.userId))) return errorResponse(refusal, 403);
    callerIsOwner = true;
  }

  const dryRun = body.dry_run === true;

  try {
    const accessToken = await getGoogleAccessToken();

    const { data: communityRows } = await admin
      .from('communities')
      .select('id, name, slug');
    const communities = (communityRows ?? []) as CommunityRow[];
    if (communities.length === 0) return errorResponse('There are no HIVEs to file anything into.', 409);

    /* ---- an owner filing one document by hand, for a skip they looked at ---- */

    let forcedCommunity: CommunityRow | null = null;
    if (body.community) {
      if (!callerIsOwner) {
        return errorResponse('Naming the HIVE for a transcript is an owner’s call.', 403);
      }
      if (!body.document_id) {
        return errorResponse('Pass `document_id` alongside `community` — naming a HIVE files one document.', 400);
      }
      const key = body.community.trim();
      forcedCommunity = communities.find((c) => c.id === key || c.slug === key) ?? null;
      if (!forcedCommunity) return errorResponse(`No HIVE called "${key}".`, 404);
    }

    /* ------------------------------------------------- what Drive is holding ---- */

    const days = Number.isFinite(body.days) && (body.days as number) > 0
      ? Math.min(Math.floor(body.days as number), 365)
      : DEFAULT_LOOKBACK_DAYS;
    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

    let files: DriveFile[];
    let folderCount: number | null = null;

    if (body.document_id) {
      const one = await getDriveItem(accessToken, body.document_id.trim());
      if (!one) {
        return errorResponse(
          `Drive has no document the HIVE account can see with the id "${body.document_id}". `
          + 'If it is in Nat\'s Default Folder for Meeting Recordings, that folder has to be '
          + 'shared read-only with the HIVE Google account first.',
          404,
        );
      }
      files = [one];
    } else if (TRANSCRIPT_FOLDER_ID) {
      // Ask for the folder itself first. A folder that was never shared comes
      // back as nothing here, where it can be said plainly — a listing query
      // against an invisible parent just returns an empty result and looks like
      // a quiet week.
      const root = await getDriveItem(accessToken, TRANSCRIPT_FOLDER_ID);
      if (!root) {
        return errorResponse(
          `The HIVE Google account cannot see the folder ${TRANSCRIPT_FOLDER_ID}. `
          + 'Default Folder for Meeting Recordings belongs to natwalstead@gmail.com and has to '
          + 'be shared read-only with the HIVE Google account before anything can be imported.',
          403,
        );
      }
      // Meetings put their artifacts in a subfolder of their own, so the parents
      // to search are those subfolders. The folder itself is included in case a
      // transcript is ever saved loose at the top.
      const folderSince = new Date(Date.now() - (days + 2) * 86_400_000).toISOString();
      const folders = await listMeetingFolders(accessToken, TRANSCRIPT_FOLDER_ID, folderSince);
      folderCount = folders.length;
      files = await listTranscriptDocs(
        accessToken,
        sinceIso,
        [TRANSCRIPT_FOLDER_ID, ...folders.map((f) => f.id)],
      );
    } else {
      files = await listTranscriptDocs(accessToken, sinceIso, null);
    }

    if (!body.document_id) files = files.filter((f) => isSpokenTranscript(f.name));
    // Newest first, so a capped run brings in the meeting that just happened
    // rather than one from a fortnight ago.
    files.sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? ''));

    const capped = files.slice(0, MAX_DOCUMENTS_PER_RUN);

    /* ------------------------------------------------- what is already filed ---- */

    const { data: seenRows } = await admin
      .from('meet_transcript_imports')
      .select('document_id')
      .in('document_id', capped.map((f) => f.id));
    const alreadyFiled = new Set(((seenRows ?? []) as { document_id: string }[]).map((r) => r.document_id));

    const pending = capped.filter((f) => !alreadyFiled.has(f.id));

    /* ------- the scheduled meetings anywhere near the documents we are holding ---- */

    const dates = pending.map((f) => transcriptDate(f)).sort();
    let meetingEvents: { community_id: string; title: string; event_date: string }[] = [];
    if (dates.length > 0) {
      const { data: eventRows } = await admin
        .from('events')
        .select('community_id, title, event_date')
        .eq('event_type', 'meeting')
        .gte('event_date', shiftDate(dates[0], -1))
        .lte('event_date', shiftDate(dates[dates.length - 1], 1));
      meetingEvents = (eventRows ?? []) as typeof meetingEvents;
    }

    /** The ladder in the header comment, applied to one document. */
    function decide(file: DriveFile): Verdict {
      const docDate = transcriptDate(file);
      const { title, meetingCode } = readName(file.name);

      if (forcedCommunity) {
        return { ok: true, community: forcedCommunity, matchedBy: 'named by an owner', meetingDate: docDate };
      }

      if (meetingCode) {
        return {
          ok: false,
          why: `"${file.name}" is named after a Google Meet code (${meetingCode}), which means the call had no `
            + 'calendar event behind it. There is nothing to match it to, so it was left alone. '
            + 'An owner can file it by hand with its document id and a HIVE.',
        };
      }

      // 1. The name says a HIVE by name.
      const named = communities.filter((c) => nameNamesHive(file.name, c));
      if (named.length === 1) {
        return { ok: true, community: named[0], matchedBy: 'the document name', meetingDate: docDate };
      }
      if (named.length > 1) {
        return {
          ok: false,
          why: `"${file.name}" names more than one HIVE (${named.map((c) => c.name).join(', ')}), so there is no telling whose it is.`,
        };
      }

      // 2. The title is a scheduled meeting's title, within a day either side.
      if (title.length >= 5) {
        const nearby = meetingEvents.filter((event) => {
          if (event.event_date < shiftDate(docDate, -1) || event.event_date > shiftDate(docDate, 1)) return false;
          const eventTitle = normalise(event.title ?? '');
          if (eventTitle.length < 5) return false;
          return title.includes(eventTitle) || eventTitle.includes(title);
        });
        const hives = [...new Set(nearby.map((e) => e.community_id))];
        if (hives.length === 1) {
          const community = communities.find((c) => c.id === hives[0]);
          if (community) {
            // The event's own date is the meeting's date. Prefer it over the
            // document's, which is only ever a reading of the clock.
            const eventDate = nearby[0].event_date?.slice(0, 10) || docDate;
            return { ok: true, community, matchedBy: 'a scheduled meeting with the same name', meetingDate: eventDate };
          }
        }
        if (hives.length > 1) {
          return { ok: false, why: `"${file.name}" matches a scheduled meeting in more than one HIVE, so it was left alone.` };
        }
      }

      return {
        ok: false,
        why: `"${file.name}" does not name a HIVE and matches no scheduled meeting around ${docDate}. `
          + 'Put the HIVE in the meeting name, or file it by hand with its document id and a HIVE.',
      };
    }

    /* ---------------------------------------------------------------- filing ---- */

    const imported: Record<string, unknown>[] = [];
    const skipped: Record<string, unknown>[] = [];

    for (const file of pending) {
      const verdict = decide(file);
      if (!verdict.ok) {
        skipped.push({ document: file.name, document_id: file.id, why: verdict.why });
        continue;
      }

      const text = (await readDocText(accessToken, file.id)).trim();
      if (!text) {
        skipped.push({ document: file.name, document_id: file.id, why: 'The document is empty.' });
        continue;
      }

      if (dryRun) {
        imported.push({
          document: file.name,
          hive: verdict.community.name,
          meeting_date: verdict.meetingDate,
          matched_by: verdict.matchedBy,
          characters: text.length,
          would_import: true,
        });
        continue;
      }

      /**
       * Find-or-create, copied deliberately from `save-transcript`: the rows for
       * that HIVE on that date, oldest first, preferring one that already holds a
       * transcript. `seal-meeting` looks for the same row with the same
       * preference, so the night's words and the night's notes end up on one
       * record whichever of the two happens first.
       */
      const { data: existingRows } = await admin
        .from('meetings')
        .select('id, transcript_raw')
        .eq('community_id', verdict.community.id)
        .eq('date', verdict.meetingDate)
        .order('created_at', { ascending: true });
      const rows = (existingRows ?? []) as { id: string; transcript_raw: string | null }[];
      const existing = rows.find((row) => row.transcript_raw) ?? rows[0] ?? null;

      // Every imported block says where it came from. A HIVE that meets twice in
      // a day, or a Meet call that stopped and restarted, adds to the record
      // rather than writing over what was already said.
      const block = `— from Google Meet: ${file.name} —\n\n${text}`;

      let meetingId: string;
      let appended = false;
      if (existing) {
        const previous = (existing.transcript_raw ?? '').trim();
        appended = !!previous;
        const { error } = await admin
          .from('meetings')
          .update({ transcript_raw: previous ? `${previous}\n\n${block}` : block })
          .eq('id', existing.id);
        if (error) throw error;
        meetingId = existing.id;
      } else {
        const { data: inserted, error } = await admin
          .from('meetings')
          .insert({
            date: verdict.meetingDate,
            community_id: verdict.community.id,
            transcript_raw: block,
            transcript_attributed: '',
            processing_status: 'complete',
          })
          .select('id')
          .single();
        if (error || !inserted) throw error ?? new Error('Could not open a meeting record.');
        meetingId = (inserted as { id: string }).id;
      }

      /**
       * The receipt, written last on purpose. If anything above fell over, the
       * document stays unfiled and the next run tries it again — better a second
       * attempt than a transcript that is remembered as imported and is not
       * anywhere.
       */
      const { error: ledgerError } = await admin
        .from('meet_transcript_imports')
        .insert({
          document_id: file.id,
          document_name: file.name,
          document_url: file.webViewLink ?? null,
          document_created_at: file.createdTime ?? null,
          community_id: verdict.community.id,
          meeting_id: meetingId,
          meeting_date: verdict.meetingDate,
          matched_by: verdict.matchedBy,
          character_count: text.length,
        });
      // A duplicate here means two runs overlapped and the other one won. The
      // transcript is filed either way, so this is worth a line in the log and
      // nothing more.
      if (ledgerError) console.error('Could not write the import receipt:', ledgerError);

      imported.push({
        document: file.name,
        hive: verdict.community.name,
        meeting_id: meetingId,
        meeting_date: verdict.meetingDate,
        matched_by: verdict.matchedBy,
        characters: text.length,
        appended_to_existing: appended,
      });
    }

    const summary = imported.length === 0 && skipped.length === 0
      ? 'Nothing new in Drive.'
      : `${dryRun ? 'Would bring in' : 'Brought in'} ${imported.length} transcript${imported.length === 1 ? '' : 's'}`
        + `${skipped.length ? `, left ${skipped.length} alone` : ''}.`;

    return jsonResponse({
      summary,
      dry_run: dryRun,
      days_searched: days,
      meeting_folders_searched: folderCount,
      looked_at: capped.length,
      already_imported: alreadyFiled.size,
      more_waiting: Math.max(files.length - capped.length, 0),
      imported,
      skipped,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Could not bring the Meet transcripts in.',
      500,
    );
  }
});
