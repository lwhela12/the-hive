import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { sendReachEmail, genericLetter, deepLink, hiveIsMeetingNow, templateIsApproved } from '../_shared/reachMail.ts';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';
import { waitingForCheckIn, reminderKey, type CheckInMeeting } from '../_shared/checkInSession.ts';
import { deliverCheckIn } from '../_shared/checkInDelivery.ts';
import { MONTHLY_CHECK_IN_PATTERN, PRE_MEETING_CHECK_IN_PATTERN, END_OF_MONTH_CHECK_IN_PATTERN } from '../_shared/checkInPatterns.ts';
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
 * Legacy email/approval/resend paths are retired. This remains owner-manual;
 * no canonical scheduler is enabled by this implementation.
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
  return END_OF_MONTH_CHECK_IN_PATTERN.test(title)
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

  if (survey.community_id || ![MONTHLY_CHECK_IN_PATTERN, PRE_MEETING_CHECK_IN_PATTERN, END_OF_MONTH_CHECK_IN_PATTERN].some(pattern => pattern.test(survey.title ?? ''))) {
    return errorResponse('Only a shared Before we meet or End of the month check-in can use this sender.', 409);
  }
  const shape = shapeOf(survey.title ?? '');
  // Gate the whole operation BEFORE recipient claims or app notifications, not
  // merely the downstream email channel. A dry run must not advertise a send
  // that the owner has not approved either. The shared mail door checks again.
  if (!(await templateIsApproved(admin, shape.kind))) {
    return errorResponse('This email template is not approved. Review it in The emails we send first. Nothing sent or claimed.', 409);
  }

  /**
   * WHO IT REACHES.
   *
   * A survey belonging to a HIVE reaches that HIVE. A survey belonging to none
   * is one of the two merged check-ins, and the two do NOT reach the same room:
   *
   *   End of the month   everybody, in every HIVE, once however many they are
   *                      in. It counts to the end of the calendar month, so it
   *                      is the same question for all of them on the same day.
   *
   *   Before we meet     the members of whichever HIVE meets TOMORROW, minus
   *                      anyone who has already answered that HIVE's part.
   *
   * ## Why tomorrow, and why per-HIVE
   *
   * Nat, 2026-09-04: *"a 'you have a meeting tomorrow, dont forget to fill out
   * your check in before the meeting starts' kind of email goes out the day
   * before a meeting ... If someone, like [a member], who is in all 3, got an
   * email on monday to check in, he could just do his check in for all 3. But
   * if he only did Tech hive, then he'd get another reminder on wed for [the
   * next one]. If he did [both] on monday, then he wouldnt get another reminder
   * until the following tues."*
   *
   * So the letter is tied to ONE meeting, and the check-in behind it covers
   * every HIVE the reader is in. Answering a HIVE's section is what stops that
   * HIVE's reminder — which is why "answered" is counted per HIVE here and not
   * per survey. One merged check-in holds one row per HIVE (migration 229), so
   * the question "has this person done Tech yet" has an honest answer even
   * though Tech shares a survey with everybody else.
   *
   * ## The letter never names another HIVE
   *
   * The first version of this gathered every meeting in the next seven days and
   * wrote them into the letter — *"Tech HIVE, Tuesday · Production HIVE,
   * Thursday"* — and sent it to all eleven people. Nat: *"Production HIVE is
   * lord voldemort, we cant have that just out and about for people to see."*
   * Naming it outside itself is one leak; naming the DAY it meets is a second,
   * and the fact that a meeting happened at all is a fact about that HIVE (see
   * migration 224). Tying the letter to one meeting removes the temptation:
   * everyone who receives it is already inside the HIVE it is about.
   */
  const PACIFIC_TZ = 'America/Los_Angeles';
  const pacificDate = (at: Date) =>
    at.toLocaleDateString('en-CA', { timeZone: PACIFIC_TZ }); // YYYY-MM-DD

  /** The HIVEs meeting tomorrow. Empty for anything that is not a pre-meeting. */
  let meetingTomorrow: { id: string; name: string }[] = [];
  let dueMeetings: CheckInMeeting[] = [];
  if (shape.kind === 'checkIn') {
    const tomorrow = pacificDate(new Date(Date.now() + 86400000));
    const { data: soon, error: meetingError } = await admin
      .from('events')
      .select('id, event_date, community_id, community:communities!community_id(name)')
      .eq('event_type', 'meeting')
      .eq('status', 'scheduled')
      .eq('event_date', tomorrow);
    if (meetingError) return errorResponse('Could not read upcoming meetings.', 503);
    dueMeetings = (soon ?? []).filter((event: CheckInMeeting) => !survey.community_id || event.community_id === survey.community_id) as CheckInMeeting[];
    const seen = new Set<string>();
    for (const row of (soon ?? []).filter((event: CheckInMeeting) => !survey.community_id || event.community_id === survey.community_id) as {
      community_id: string; community?: { name?: string } | null;
    }[]) {
      if (seen.has(row.community_id)) continue;
      seen.add(row.community_id);
      meetingTomorrow.push({ id: row.community_id, name: row.community?.name ?? 'your HIVE' });
    }
    if (!meetingTomorrow.length) {
      // Said plainly rather than reporting that it reached nobody, which is the
      // same answer wearing a disguise.
      const { data: next } = await admin
        .from('events')
        .select('event_date')
        .eq('event_type', 'meeting').eq('status', 'scheduled')
        .gte('event_date', pacificDate(new Date()))
        .order('event_date', { ascending: true }).limit(1);
      const when = (next ?? [])[0]?.event_date;
      return errorResponse(
        when
          ? `No HIVE meets tomorrow. This goes out the day before a meeting, and the next one is ${when}.`
          : 'No HIVE meets tomorrow, and none has a meeting on the books.',
        409,
      );
    }
  }

  /**
   * The people, and who among them has already done their part.
   *
   * For a merged pre-meeting this is asked per HIVE — a member of two HIVEs who
   * answered one of them is done for that one and still waiting on the other.
   */
  const scopeIds = survey.community_id
    ? [survey.community_id]
    : meetingTomorrow.map((h) => h.id);

  const membershipQuery = admin
    .from('community_memberships')
    .select('user_id, community_id');
  const { data: memberRows, error: membershipError } = scopeIds.length
    ? await membershipQuery.in('community_id', scopeIds)
    : await membershipQuery;
  if (membershipError) return errorResponse('Could not read memberships.', 503);
  const memberships = (memberRows ?? []) as { user_id: string; community_id: string }[];
  const everyone = [...new Set(memberships.map((r) => r.user_id))];

  const { data: answeredRows, error: completionError } = await admin
    .from('check_in_completions')
    .select('user_id, community_id, occurrence')
    .eq('survey_id', survey.id);
  if (completionError) return errorResponse('Could not verify completed check-ins. Nothing sent.', 503);
  const day = pacificDate(new Date());
  const pending = waitingForCheckIn(memberships, dueMeetings, answeredRows ?? [], day.slice(0, 7));
  const { data: prior, error: receiptError } = await admin.from('check_in_reminder_receipts')
    .select('dedupe_key').in('dedupe_key', pending.map(id => reminderKey(shape.kind, id, day)));
  if (receiptError) return errorResponse('Could not verify reminder receipts. Nothing sent.', 503);
  const claimed = new Set((prior ?? []).map((r: { dedupe_key: string }) => r.dedupe_key));
  const waiting = pending.filter(id => !claimed.has(reminderKey(shape.kind, id, day)));
  const answeredAnywhere = new Set(everyone.filter(id => !pending.includes(id)));

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
      // get an email". This one is read by an owner, inside Admin, so it may
      // name the HIVE meeting tomorrow; the LETTER below may not.
      hive: survey.community_id
        ? hiveName
        : meetingTomorrow.length
          ? meetingTomorrow.map((h) => h.name).join(' and ')
          : 'every HIVE',
      members: everyone.length,
      answered: answeredAnywhere.size,
      already_claimed: pending.length - waiting.length,
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
  // Each recipient's letter opens an unanswered meeting in their own HIVE.
  // Preserve the shared once-per-day claim and all completion receipts.
  const meetingFor = (userId: string) => dueMeetings
    .filter(event => memberships.some(m => m.user_id === userId && m.community_id === event.community_id))
    .filter(event => !(answeredRows ?? []).some(row => row.user_id === userId
      && row.community_id === event.community_id && row.occurrence === `meeting:${event.id}`))
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.id.localeCompare(b.id))[0];
  const sourceFor = (userId: string) => shape.kind === 'checkIn' ? meetingFor(userId)?.community_id ?? null : null;
  const hrefFor = (userId: string) => shape.kind === 'checkIn'
    ? `https://app.the-hive.app/beforewemeet?meeting=${encodeURIComponent(meetingFor(userId)?.id ?? '')}`
    : deepLink('/endofmonth');
  const delivery = await deliverCheckIn(admin, waiting, shape.kind, day,
    userId => {
      const hiveId = sourceFor(userId);
      if (shape.kind === 'checkIn' && !hiveId) return Promise.resolve({ sent: false, reason: 'No eligible meeting' });
      return sendReachEmail(admin, userId, shape.kind, genericLetter(shape.kind, {
        buttonLabel: 'Open the check-in', href: hrefFor(userId), hiveId: hiveId,
      }));
    },
    (userId, emailed) => ({
      user_id: userId, community_id: sourceFor(userId), notification_type: 'general',
      title: `Your ${shape.name} check-in is open`,
      content: 'Tap to fill it in.', email_sent: emailed,
      metadata: { reminder_survey_id: survey.id, check_in_opened_by: auth.userId,
        meeting_id: meetingFor(userId)?.id ?? null, url: hrefFor(userId) },
    }),
  );
  return jsonResponse({
    survey_id: survey.id,
    check_in: shape.name,
    reached: delivery.notified,
    already_claimed: pending.length - waiting.length,
    ...delivery,
  });
});
