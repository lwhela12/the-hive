import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { sendReachEmail, deepLink, hiveIsMeetingNow } from '../_shared/reachMail.ts';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { hiveMark } from '../_shared/hiveMark.ts';

/**
 * "THIS CHECK-IN IS OPEN." Nat presses send, in the app, on a survey she has
 * just read.
 *
 * Nat, 2026-09-04: *"instead of going to my email and then previewing the email
 * and then going back into the app and previewing the survey, I want everything
 * to just happen in the app. I want to look at the survey in the app and then I
 * want to tag people in the app. And then I want fewer, fewer steps."*
 *
 * ## Why this exists beside `check-in-reminder` rather than inside it
 *
 * `check-in-reminder` writes a LETTER. It builds the month's meeting details,
 * the note off the meeting row, the season variants, the greeting — and because
 * a machine wrote all that, a person had to read it before it went. That is the
 * whole reason the 6am preview and the `/approve/<hold>` door exist, and they
 * were right while the machine was doing the writing.
 *
 * Nat's fix is to stop the machine writing. She reads the SURVEY, in the app,
 * where she was going to be anyway — and what goes out is this: four lines that
 * say which check-in is open, how long it takes, and one button. There is
 * nothing in it for her to tweak, so there is nothing for her to proofread, so
 * the 6am mail has no job left.
 *
 * The old path is untouched. It keeps Saturday's Tech check-in working while
 * this one is walked; it retires once she has pressed this button for real.
 *
 * ## The rules this door keeps
 *
 * - **Only an owner may open one.** Same bar as the approval screen it replaces.
 * - **Only people who have not answered.** Nobody is nudged about a form they
 *   have already filled in.
 * - **Every member's own switch decides**, through `sendReachEmail` — Nat never
 *   chooses on somebody's behalf. `email_meeting_checkin_enabled` for a
 *   before-we-meet, `email_midpoint_checkin_enabled` for an end-of-the-month.
 * - **Not while that HIVE is meeting.** The door holds it (`hiveIsMeetingNow`).
 *   Asked here too, up front, so the reply says so rather than reporting that
 *   it reached nobody.
 * - **It says how many, before it sends.** `dry_run: true` answers with the
 *   count and sends nothing, so the button in the app can carry the number.
 *   Nobody presses send on "everyone" without seeing what everyone means.
 */

interface OpenCheckInPayload {
  survey_id: string;
  /** Answer with who would get it and send nothing. */
  dry_run?: boolean;
}

/** How the two check-ins are told apart, in the same words the app uses. */
function shapeOf(title: string): { kind: 'checkIn' | 'monthCheckIn'; name: string } {
  // "End of the month" belongs to the calendar and to everybody; anything else
  // that opens is the one that rides a meeting. The two names were settled on
  // 2026-09-02 and a third must never be invented — see PROJECT.md.
  return /end of the month|halfway|midpoint/i.test(title)
    ? { kind: 'monthCheckIn', name: 'End of the month' }
    : { kind: 'checkIn', name: 'Before we meet' };
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  let body: OpenCheckInPayload;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad body');
    body = parsed as OpenCheckInPayload;
  } catch {
    return errorResponse('Send a survey_id.', 400);
  }
  if (!body.survey_id) return errorResponse('Send a survey_id.', 400);

  // The same refusal whether they never signed in or signed in and are not an
  // owner — a refusal should not teach you what is behind it.
  const refusal = 'Only an owner can open a check-in.';
  const auth = await verifySupabaseJwt(req.headers.get('Authorization'));
  if (isAuthError(auth)) return errorResponse(refusal, 403);
  if (!(await isOwner(admin, auth.userId))) return errorResponse(refusal, 403);

  const { data: surveyRow } = await admin
    .from('surveys')
    .select('id, title, due_date, is_active, community_id')
    .eq('id', body.survey_id)
    .maybeSingle();
  const survey = surveyRow as {
    id: string; title: string; due_date: string | null;
    is_active: boolean; community_id: string | null;
  } | null;
  if (!survey) return errorResponse('That check-in could not be found.', 404);
  if (!survey.is_active) return errorResponse('That check-in is closed.', 409);

  const shape = shapeOf(survey.title ?? '');

  /**
   * WHO IT REACHES.
   *
   * A survey belonging to a HIVE reaches that HIVE. One belonging to no HIVE is
   * the single HIVE-Wide "End of the month" (migration 225) and reaches every
   * member of every HIVE, each person once however many HIVEs they are in.
   */
  const membershipQuery = admin.from('community_memberships').select('user_id');
  const { data: memberRows } = survey.community_id
    ? await membershipQuery.eq('community_id', survey.community_id)
    : await membershipQuery;
  const everyone = [...new Set((memberRows ?? []).map((r: { user_id: string }) => r.user_id))];

  const { data: answeredRows } = await admin
    .from('survey_responses')
    .select('user_id')
    .eq('survey_id', survey.id);
  const answered = new Set((answeredRows ?? []).map((r: { user_id: string }) => r.user_id));

  const waiting = everyone.filter((userId) => !answered.has(userId));

  let hiveName = 'HIVE';
  let hiveSlug: string | null = null;
  let hiveAccent: string | null = null;
  if (survey.community_id) {
    const { data: hive } = await admin
      .from('communities')
      .select('name, slug, accent_color')
      .eq('id', survey.community_id)
      .maybeSingle();
    const row = hive as { name?: string; slug?: string; accent_color?: string } | null;
    hiveName = row?.name ?? hiveName;
    hiveSlug = row?.slug ?? null;
    hiveAccent = row?.accent_color ?? null;
  }

  const meetingNow = await hiveIsMeetingNow(admin, survey.community_id);

  // Say how many, before anything goes. This is what the button reads.
  if (body.dry_run) {
    return jsonResponse({
      survey_id: survey.id,
      check_in: shape.name,
      // A NAME, not a sentence — the app puts this inside "16 people in ___
      // get an email", and "everybody, whichever HIVEs they are in" turned
      // that into nonsense the first time it was read on screen.
      hive: survey.community_id ? hiveName : 'every HIVE',
      members: everyone.length,
      answered: answered.size,
      would_reach: waiting.length,
      meeting_now: meetingNow,
    });
  }

  if (meetingNow) {
    return errorResponse(`${hiveName} is in its meeting right now — nothing sends during one.`, 409);
  }

  /**
   * The letter. Four lines, and it is the same four every month.
   *
   * Nat's own diagnosis of why the old one needed proofreading: *"a lot of the
   * times I'm reviewing, I'm tweaking the email, do this, do this, do this. And
   * so that's just a lame step."* A letter with nothing in it to tweak is a
   * letter with nothing to review.
   */
  const mark = hiveMark(hiveSlug, hiveAccent);
  const path = survey.community_id ? '/monthly-tuneup' : '/endofmonth';
  const href = deepLink(path, survey.community_id);
  const takes = shape.kind === 'monthCheckIn' ? 'about two minutes' : 'a few minutes';

  const sent = await Promise.all(
    waiting.map((userId) => sendReachEmail(admin, userId, shape.kind, {
      subject: `${hiveName} · ${shape.name} is open`,
      hiveName,
      hiveSlug,
      hiveAccent,
      hiveId: survey.community_id,
      heading: `${shape.name} is open`,
      where: survey.community_id ? hiveName : 'Every HIVE',
      said: `It takes ${takes}, and what you write goes straight into the room.`,
      buttonLabel: 'Open the check-in',
      href,
    })),
  );
  const emailed = sent.filter((r) => r.sent).length;

  /**
   * And the same thing in the app, for everyone — including the people whose
   * email switch is off. Turning the mail off is not asking to be left out of
   * the HIVE, so the in-app row goes to all of them.
   */
  if (waiting.length) {
    const { error: notifyError } = await admin.from('notifications').insert(
      waiting.map((userId) => ({
        user_id: userId,
        community_id: survey.community_id,
        notification_type: 'general',
        title: `${mark.emoji} ${shape.name} is open`,
        content: `${hiveName} — it takes ${takes}. Tap to fill it in.`,
        email_sent: false,
        metadata: {
          reminder_survey_id: survey.id,
          check_in_opened_by: auth.userId,
        },
      })),
    );
    // A row that fails to write must not make the letters look unsent.
    if (notifyError) console.error('[open-check-in] notification insert:', notifyError.message);
  }

  console.log(
    `[open-check-in] ${hiveName} · ${shape.name}: ${waiting.length} waiting, ${emailed} emailed`,
  );

  return jsonResponse({
    survey_id: survey.id,
    check_in: shape.name,
    reached: waiting.length,
    emailed,
    quiet: waiting.length - emailed,
  });
});
