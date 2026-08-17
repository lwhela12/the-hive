/**
 * The library door.
 *
 * One way in for something outside the app to file what it learned into a HIVE
 * board — Hermes, after a Le Mis Tech call or a Density call, with the bits
 * worth keeping.
 *
 * Nat, 2026-08-17, on what Tech HIVE is FOR: *"OG hive is more about social
 * connection and personal goals ... production hive is the project management,
 * we're all working towards the same goal ... Tech hive is different. It's
 * people who are interested in tech, tech developments, coding, software,
 * podcasts, building apps — where we can share information."* And the member
 * who makes the case: *"my brother-in-law wants to be in the tech hive, but he
 * can't make the meetings."* A library is what serves him. A meeting record is
 * not.
 *
 * **The shape a library page has**, which is the shape Nat already built on the
 * Agentic Coding Principles board without calling it that:
 *
 *   - the THREAD is a topic — "Which model is good at what"
 *   - its top post is the CURRENT ANSWER, rewritten as it learns
 *   - each reply is a DATED ENTRY that says where it came from
 *
 * So the page is always true today, and you can still see which call taught it
 * what. `summary` rewrites the top; `entry` appends underneath. A caller that
 * sends both has updated the library in one move.
 *
 * Kelly's weekly call deliberately stays OUTSIDE HIVE — he records it for the
 * Le Mis Tech podcast — which is exactly why this door exists. The recording
 * never comes near the app; only what was worth writing down does.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

type Body = {
  /** A community slug ('tech', 'default', 'show') or its id. */
  community?: string;
  /** The board, by name (case-insensitive, partial) or id. Must already exist. */
  board?: string;
  /** The topic thread's title. Created on first use. */
  topic?: string;
  /** What was learned. Appended as a dated entry under the topic. */
  entry?: string;
  /** Where it came from — "LMT call, 14 Aug". Printed with the entry. */
  source?: string;
  /** The topic's current answer, rewritten. Replaces the top post when given. */
  summary?: string;
  /** Read instead of write: returns the top post and recent entries. */
  read?: boolean;
  /** Read mode with no `topic`: lists the topics on that board. */
  list?: boolean;
};

/**
 * A board this door will not touch, whatever it is asked.
 *
 * The newsletter's rows are the seven published issues of The Buzz and nothing
 * else, and Nat has been unambiguous that a newsletter is not a board you post
 * to. Nothing automatic gets to write there.
 */
const OFF_LIMITS = new Set(['newsletter']);

function todayPacific(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  let body: Body = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Body;
  } catch { /* an empty body is a listing request */ }

  /**
   * Two ways in, and only two — the same door policy `check-in-reminder` has.
   * Hermes calls with the service key from Nat's Mac; Nat or Lucas can call it
   * signed in. Anything else is refused without saying what is behind it,
   * because a stranger who could write here could put words on a board under
   * Nat's name.
   */
  const authHeader = req.headers.get('Authorization') ?? '';
  const calledByService = !!serviceKey && authHeader === `Bearer ${serviceKey}`;
  if (!calledByService) {
    const refusal = 'The library is written to by its own keepers.';
    const auth = await verifySupabaseJwt(authHeader);
    if (isAuthError(auth)) return errorResponse(refusal, 403);
    if (!(await isOwner(admin, auth.userId))) return errorResponse(refusal, 403);
  }

  const communityKey = (body.community ?? '').trim();
  if (!communityKey) return errorResponse('Which HIVE? Pass `community` as a slug or an id.', 400);

  // Slug or id, so a caller can say "tech" and mean it.
  const looksLikeId = /^[0-9a-f-]{36}$/i.test(communityKey);
  const { data: communityRow } = await admin
    .from('communities')
    .select('id, name, slug')
    .eq(looksLikeId ? 'id' : 'slug', communityKey)
    .maybeSingle();
  const community = communityRow as { id: string; name: string; slug: string } | null;
  if (!community) return errorResponse(`No HIVE called "${communityKey}".`, 404);

  const boardKey = (body.board ?? '').trim();
  if (!boardKey) return errorResponse('Which board? Pass `board` as a name or an id.', 400);

  const { data: boardRows } = await admin
    .from('board_categories')
    .select('id, name, topic_kind, status')
    .eq('community_id', community.id);
  const boards = (boardRows ?? []) as {
    id: string; name: string; topic_kind?: string | null; status?: string | null;
  }[];
  const board =
    boards.find((b) => b.id === boardKey)
    ?? boards.find((b) => b.name.toLowerCase() === boardKey.toLowerCase())
    ?? boards.find((b) => b.name.toLowerCase().includes(boardKey.toLowerCase()));

  if (!board) {
    // Naming what IS there beats "not found" — a caller that guessed the board
    // name can correct itself without a person in the loop.
    return errorResponse(
      `No board matching "${boardKey}" in ${community.name}. It has: ${boards.map((b) => b.name).join(', ') || 'no boards'}.`,
      404,
    );
  }
  if (OFF_LIMITS.has(board.topic_kind ?? '')) {
    return errorResponse(`"${board.name}" is not a board anything writes to.`, 403);
  }

  const topic = (body.topic ?? '').trim();

  /* ------------------------------------------------------------ reading ---- */

  if (body.list || (body.read && !topic)) {
    const { data: topics } = await admin
      .from('board_posts')
      .select('id, title, content, created_at, last_reply_at')
      .eq('category_id', board.id)
      .is('archived_at', null)
      .order('created_at', { ascending: true });
    return jsonResponse({
      hive: community.name,
      board: board.name,
      topics: ((topics ?? []) as any[]).map((t) => ({
        title: t.title,
        summary: String(t.content ?? '').slice(0, 400),
        last_entry: t.last_reply_at ?? t.created_at,
      })),
    });
  }

  if (!topic) return errorResponse('Which topic? Pass `topic` as the thread title.', 400);

  const { data: found } = await admin
    .from('board_posts')
    .select('id, title, content')
    .eq('category_id', board.id)
    .ilike('title', topic)
    .is('archived_at', null)
    .limit(1);
  let thread = ((found ?? []) as { id: string; title: string; content: string }[])[0] ?? null;

  if (body.read) {
    if (!thread) return errorResponse(`No topic called "${topic}" on ${board.name} yet.`, 404);
    const { data: entries } = await admin
      .from('board_replies')
      .select('content, created_at')
      .eq('post_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(30);
    return jsonResponse({
      hive: community.name,
      board: board.name,
      topic: thread.title,
      // The current answer, so a caller can rewrite it rather than guess at it.
      summary: thread.content,
      entries: ((entries ?? []) as any[]).map((e) => ({ text: e.content, at: e.created_at })),
    });
  }

  /* ------------------------------------------------------------ writing ---- */

  const entry = (body.entry ?? '').trim();
  const summary = (body.summary ?? '').trim();
  if (!entry && !summary) {
    return errorResponse('Nothing to file — pass `entry`, `summary`, or both.', 400);
  }

  /**
   * Whose name goes on it.
   *
   * Everything here is written on Nat's behalf, so it carries her name rather
   * than appearing from nobody — the same choice the check-in cron makes when
   * it opens a thread. An owner who is a member of THIS HIVE, preferring Nat.
   */
  const { data: adminRows } = await admin
    .from('community_memberships')
    .select('user_id, user:profiles!user_id(name, is_owner)')
    .eq('community_id', community.id);
  const members = (adminRows ?? []) as {
    user_id: string; user?: { name?: string | null; is_owner?: boolean | null } | null;
  }[];
  const owners = members.filter((m) => m.user?.is_owner);
  const authorId = (owners.find((m) => /^nat\b/i.test(m.user?.name ?? '')) ?? owners[0])?.user_id;
  if (!authorId) {
    return errorResponse(`Nobody in ${community.name} can be written for — no owner is a member.`, 409);
  }

  let created = false;
  if (!thread) {
    const { data: made, error } = await admin
      .from('board_posts')
      .insert({
        community_id: community.id,
        category_id: board.id,
        author_id: authorId,
        title: topic,
        // A brand-new topic opens with whatever answer we have. Without a
        // summary it opens honestly empty rather than inventing one.
        content: summary || 'Being written. The entries below are what it is built from.',
        // A standing reference page, which is what an anchored thread is for —
        // it sorts to the bottom of the board and stops competing with
        // conversation for the top.
        is_anchored: true,
      })
      .select('id, title, content')
      .single();
    if (error || !made) return errorResponse(`Could not open that topic: ${error?.message}`, 500);
    thread = made as { id: string; title: string; content: string };
    created = true;
  } else if (summary) {
    const { error } = await admin
      .from('board_posts')
      .update({ content: summary })
      .eq('id', thread.id);
    if (error) return errorResponse(`Could not update that topic: ${error.message}`, 500);
  }

  let entryPosted = false;
  if (entry) {
    // The source line first, so an entry always says where it came from before
    // it says anything else. That is the whole difference between a library and
    // a pile of assertions.
    const stamp = (body.source ?? '').trim() || todayPacific();
    const { error } = await admin.from('board_replies').insert({
      community_id: community.id,
      post_id: thread.id,
      author_id: authorId,
      content: `**${stamp}**\n\n${entry}`,
    });
    if (error) return errorResponse(`Could not file that entry: ${error.message}`, 500);
    entryPosted = true;
  }

  return jsonResponse({
    hive: community.name,
    board: board.name,
    topic: thread.title,
    topic_created: created,
    summary_updated: !!summary,
    entry_filed: entryPosted,
  });
});
