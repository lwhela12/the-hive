/**
 * Schedule Meeting Edge Function
 *
 * Creates a calendar event with Google Meet link, sends calendar invites to
 * selected attendees, and stores it in the database.
 * Only an admin of the HIVE being scheduled for may call this (owners too).
 *
 * POST /functions/v1/schedule-meeting
 * Body: { title, description?, date, time, duration?, endTime?, communityId, attendeeIds? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError, isCommunityAdmin } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

// Was 150 (2.5 hours) — kept in step with ScheduleMeetingModal.tsx's default,
// which changed to 120 (2 hours) on 2026-08-25.
const DEFAULT_MEETING_DURATION_MINUTES = 120;

/**
 * The single answer to every "no" this function gives about a HIVE, whether the
 * caller is in a different HIVE, is in this one but doesn't run it, or made the
 * id up entirely. Added 2026-08-03: three tailored messages would let anyone
 * with a login map out HIVEs they aren't in just by reading which refusal came
 * back, so all three roads end here.
 */
const SCHEDULING_REFUSED = 'Scheduling a meeting here is up to this HIVE’s admins.';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface GoogleCalendarEvent {
  id: string;
  htmlLink: string;
  summary: string;
  /** Google's own shortcut to the Meet link, when the event has one. */
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType: string;
      uri: string;
    }>;
  };
}

interface ScheduleMeetingRequest {
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration?: number; // minutes, defaults to 150 for HIVE meetings
  /**
   * When the meeting finishes, given straight rather than worked out from
   * `duration` — Nat: "i couldnt add window, like 5-7, i could only put in
   * 5pm" (migration 202). When given, it decides the calendar invite's end
   * and the stored `end_time` instead of `duration`. Absent, everything
   * behaves exactly as it always has.
   */
  endTime?: string; // HH:MM
  communityId: string;
  attendeeIds?: string[]; // User IDs to invite
  timezone?: string; // User's timezone, e.g., 'America/Los_Angeles'
  location?: string; // Physical address for in-person meetings
}

/** 'HH:MM' to minutes past midnight, or null if it isn't a time. */
function timeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

interface Attendee {
  email: string;
}

/**
 * Exchange refresh token for access token
 */
async function getAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get('HIVE_GOOGLE_REFRESH_TOKEN');
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials in environment');
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
    const error = await response.text();
    throw new Error(`Failed to refresh Google token: ${error}`);
  }

  const data: GoogleTokenResponse = await response.json();
  return data.access_token;
}

/**
 * Create a Google Calendar event with Meet link and attendees
 */
async function createCalendarEvent(
  accessToken: string,
  params: {
    title: string;
    description?: string;
    startDateTime: string;
    endDateTime: string;
    timeZone: string;
    attendees?: Attendee[];
    location?: string;
    /** Does this HIVE meet on Meet? `communities.meets_on_google_meet`. */
    onGoogleMeet?: boolean;
  }
): Promise<GoogleCalendarEvent> {
  const { title, description, startDateTime, endDateTime, timeZone, attendees, location, onGoogleMeet } = params;

  // A Meet link only where the HIVE actually meets on Meet.
  //
  // Nat, 2026-08-15, when the meeting moved into the app: *"we need to make
  // sure that the Google Meet buttons are gone off of everywhere ... all paths
  // lead to the same campfire."* True of a room. OG sits around her table with
  // the deck on the TV and Production sits around Charlee's with five laptops
  // open, and a second front door there is an empty Meet with nobody in it.
  //
  // Tech HIVE is not a room — everybody is remote on their own machine, Meet is
  // where they already live, and the in-app call is metered where Meet is free
  // (Nat and Lucas, 2026-08-19). So the choice is the HIVE's, on its own row,
  // for the same reason transcripts are (migration 183).
  //
  // And it is what makes the transcript exist somewhere the app can reach:
  // Meet saves one into the HOST's Drive, the host is the HIVE Google account
  // that creates these invitations, so `import-meet-transcripts` finds it
  // without anybody sharing a personal folder.
  const requestBody: Record<string, unknown> = {
    summary: title,
    description: [description, '', `Join in HIVE: ${MEETING_HOME}`].filter(Boolean).join('\n'),
    start: { dateTime: startDateTime, timeZone },
    end: { dateTime: endDateTime, timeZone },
  };

  if (onGoogleMeet) {
    // `requestId` only has to be unique per request; Google returns the same
    // conference for a repeat of the same id rather than making a second one.
    requestBody.conferenceData = {
      createRequest: {
        requestId: `hive-${startDateTime}-${Math.round(Date.now() / 1000)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  // Add location if provided (for in-person meetings)
  if (location) {
    requestBody.location = location;
  }

  // Add attendees if provided
  if (attendees && attendees.length > 0) {
    requestBody.attendees = attendees;
    // Send email notifications to attendees
    requestBody.sendUpdates = 'all';
  }

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('sendUpdates', 'all'); // Ensure invites are sent
  // Google ignores conferenceData entirely without this, and says nothing
  // about having done so — the event comes back looking fine, with no link.
  if (onGoogleMeet) url.searchParams.set('conferenceDataVersion', '1');

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create calendar event: ${error}`);
  }

  return response.json();
}

/**
 * Where a HIVE meeting actually happens, for the calendar invite to point at.
 * The deck is the room: it carries the video panel and the slides together.
 */
const MEETING_HOME = `${Deno.env.get('EXPO_PUBLIC_APP_URL') || 'https://app.the-hive.app'}/meeting-helper`;

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only allow POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  // Verify JWT
  const authHeader = req.headers.get('Authorization');
  const auth = await verifySupabaseJwt(authHeader);

  if (isAuthError(auth)) {
    return errorResponse(auth.error, auth.status);
  }

  const { userId, token } = auth;

  try {
    // Parse request body
    const body: ScheduleMeetingRequest = await req.json();
    const {
      title,
      description,
      date,
      time,
      duration = DEFAULT_MEETING_DURATION_MINUTES,
      endTime,
      communityId,
      attendeeIds,
      timezone,
      location
    } = body;

    // Validate required fields
    if (!title || !date || !time || !communityId) {
      return errorResponse('Missing required fields: title, date, time, communityId', 400);
    }

    // The date, the time and the length go straight to Google and then straight
    // to the database, and both of those are far fussier than this function was.
    //
    // Checked here, added 2026-08-03, because of the order things happen in
    // below: the invites leave before the meeting is written down. A time of
    // "half nine" quietly became "NaN:NaN" and a length that wasn't a number did
    // the same, and Google was the first thing to notice — but a date Postgres
    // wouldn't accept got noticed AFTER the invites had landed, leaving a meeting
    // in people's inboxes that the HIVE has no record of and nobody can edit.
    // All three are pennies to check now and expensive to discover later.
    const [startHour, startMinute] = String(time).split(':').map(Number);
    const dateLooksRight = /^\d{4}-\d{2}-\d{2}$/.test(String(date));
    const timeLooksRight =
      /^\d{1,2}:\d{2}$/.test(String(time)) &&
      startHour >= 0 && startHour <= 23 &&
      startMinute >= 0 && startMinute <= 59;

    if (!dateLooksRight || !timeLooksRight) {
      return errorResponse('Please give the date as YYYY-MM-DD and the time as HH:MM.', 400);
    }

    // Same check for the end, when one was given — a window needs both ends
    // in order, or a meeting reads as ending before it starts.
    let endMinutes: number | null = null;
    if (endTime) {
      endMinutes = timeToMinutes(String(endTime));
      if (endMinutes === null) {
        return errorResponse('Please give the end time as HH:MM.', 400);
      }
      if (endMinutes <= startHour * 60 + startMinute) {
        return errorResponse('End time must be after the start time.', 400);
      }
    }

    // A day is the ceiling because anything longer belongs on the calendar as a
    // multi-day event with an end date, not as a meeting that runs off the end
    // of the clock arithmetic further down.
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24 * 60) {
      return errorResponse(
        'A meeting can run anywhere from a minute to a full day — please pick a length in that range.',
        400
      );
    }

    // Everything past this point spends the HIVE's own Google account: it drops a
    // calendar invite into people's inboxes carrying a title, description and
    // location the caller chose. Until 2026-08-03 the only question asked was
    // "are you signed in?", and the HIVE was whichever id arrived in the body, so
    // a member of any HIVE could mail the members of a HIVE they'd never joined.
    // The service-role key below ignores row-level security, so this check is the
    // whole of the door.
    //
    // Admin, not merely member, because sending mail from the HIVE's address is
    // an act of running the place. Nat and Lucas pass on sight (isCommunityAdmin
    // waves owners through), which is the one case where someone who isn't a
    // member of this HIVE may schedule for it.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!(await isCommunityAdmin(supabaseAdmin, userId, communityId))) {
      return errorResponse(SCHEDULING_REFUSED, 403);
    }

    // Use the user's timezone, fallback to Eastern if not provided
    const timeZone = timezone || 'America/New_York';

    // Google wants two digits on the hour — "9:00" is a time a person would type
    // and a time Google refuses. Padding it here means a single missing zero
    // can't cost the meeting. (2026-08-03)
    const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMinute
      .toString()
      .padStart(2, '0')}`;
    const startDateTime = `${date}T${startTimeStr}:00`;

    // The end the caller actually gave us wins over the guessed duration —
    // Nat: "i couldnt add window, like 5-7, i could only put in 5pm." An
    // explicit end time stays on the same calendar day as the start; anyone
    // scheduling something that runs past midnight is asking for a multi-day
    // event with an end DATE, not a meeting end time.
    let endDateStr = date;
    let endTimeStr: string;
    if (endTime && endMinutes !== null) {
      const [endHour, endMinute] = String(endTime).split(':').map(Number);
      endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00`;
    } else {
      // Calculate end time from the start we already checked above, rather than
      // splitting the string a second time — one reading of the clock, so the
      // value that was vetted is the value that gets used.
      const totalMinutes = startHour * 60 + startMinute + duration;
      const durationEndHours = Math.floor(totalMinutes / 60) % 24;
      const durationEndMinutes = totalMinutes % 60;
      endTimeStr = `${durationEndHours.toString().padStart(2, '0')}:${durationEndMinutes.toString().padStart(2, '0')}:00`;

      // Handle day rollover if meeting goes past midnight
      if (totalMinutes >= 24 * 60) {
        const dateObj = new Date(`${date}T12:00:00`); // Use noon to avoid DST issues
        dateObj.setDate(dateObj.getDate() + Math.floor(totalMinutes / (24 * 60)));
        endDateStr = dateObj.toISOString().split('T')[0];
      }
    }
    const endDateTime = `${endDateStr}T${endTimeStr}`;

    // Work out who actually gets the invite.
    //
    // 2026-08-03: this used to hand the requested ids straight to the whole
    // profiles table and mail back whatever emails came out, so a made-up list of
    // ids could reach anyone in the app from the HIVE's Google account. Now the
    // ids are matched against this HIVE's membership first, and only the people
    // who belong here have an email address looked up at all.
    //
    // Someone else's id gets quietly left off rather than sinking the whole
    // request — one stale pick shouldn't cost the meeting — but the count comes
    // back in the response, because a person who meant to invite six and reached
    // four deserves to see that rather than wonder.
    let attendees: Attendee[] = [];
    let attendeesSkipped = 0;
    // Settle on one spelling of each id before counting anything. The ids arrive
    // as text, and the database treats "AB-12" and "ab-12" as the same person —
    // so without this the same person named twice in two cases counted as two
    // people asked for and one found, and the sentence at the bottom told
    // somebody a guest had been left off the invite when nobody had.
    // Anything that isn't text is dropped here rather than sent to the database
    // to fail; a stray value shouldn't cost the whole meeting. (2026-08-03)
    const requestedAttendeeIds = Array.from(
      new Set(
        (Array.isArray(attendeeIds) ? attendeeIds : [])
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim().toLowerCase())
          .filter(Boolean)
      )
    );

    if (requestedAttendeeIds.length > 0) {
      const { data: memberships, error: membershipError } = await supabaseAdmin
        .from('community_memberships')
        .select('user_id')
        .eq('community_id', communityId)
        .in('user_id', requestedAttendeeIds);

      // A membership lookup that fell over tells us nothing about who belongs
      // here, and guessing would mean mailing strangers. Stop instead.
      if (membershipError) {
        console.error('Could not confirm who belongs to this HIVE:', membershipError);
        return errorResponse('Could not check who to invite. Please try again.', 500);
      }

      // Count each person once even if the membership table ever hands back two
      // rows for them; the skipped number below is subtraction and must not go
      // negative and confuse whoever reads it.
      const memberIds = Array.from(
        new Set((memberships ?? []).map((m: { user_id: string }) => m.user_id))
      );
      attendeesSkipped = requestedAttendeeIds.length - memberIds.length;

      if (memberIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('email')
          .in('id', memberIds);

        if (profilesError) {
          console.error('Failed to fetch attendee emails:', profilesError);
        } else if (profiles) {
          attendees = profiles
            .filter((p) => p.email)
            .map((p) => ({ email: p.email }));
        }
      }
    }

    // Does this HIVE meet on Meet? Its own row says (migration 191).
    const { data: hiveRow } = await supabaseAdmin
      .from('communities')
      .select('meets_on_google_meet')
      .eq('id', communityId)
      .maybeSingle();
    const onGoogleMeet = !!(hiveRow as { meets_on_google_meet?: boolean } | null)?.meets_on_google_meet;

    // Get Google access token
    const accessToken = await getAccessToken();

    const calendarEvent = await createCalendarEvent(accessToken, {
      title,
      description,
      startDateTime,
      endDateTime,
      timeZone,
      attendees,
      location,
      onGoogleMeet,
    });

    // A HIVE that meets in the app has one door and this stays null on purpose,
    // so the column reads as "deliberately none" rather than "we forgot".
    const meetLink: string | null = onGoogleMeet
      ? (calendarEvent.hangoutLink
        ?? calendarEvent.conferenceData?.entryPoints?.find((point) => point.entryPointType === 'video')?.uri
        ?? null)
      : null;

    // Create authenticated Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          },
        },
      }
    );

    // Store event in database
    const { data: event, error: dbError } = await supabase
      .from('events')
      .insert({
        title,
        description,
        event_date: date,
        event_time: startTimeStr,
        end_time: endTime || null,
        event_type: 'meeting',
        google_event_id: calendarEvent.id,
        meet_link: meetLink,
        location,
        community_id: communityId,
        created_by: userId,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Say what actually happened. By the time we get here Google has already
      // put the invite in everyone's inbox, and the old wording ("failed to save
      // meeting") reads like nothing happened — so the natural next move was to
      // press Schedule again and invite everybody twice. (2026-08-03)
      return errorResponse(
        'The calendar invite has already gone out, but we could not save the meeting to the HIVE. Check the calendar before scheduling it again.',
        500
      );
    }

    // Roll the monthly check-in forward to this meeting: due_date drives the
    // response period, the arrival board, and every reminder touch. Stored as
    // (meeting date + 1) at 00:00 UTC == 5pm Pacific on the meeting day —
    // the same convention the check-in-reminder date math documents.
    // Only ever move it FORWARD past the previous meeting; never backwards.
    try {
      const { data: activeSurveys } = await supabaseAdmin
        .from('surveys')
        .select('id, title, due_date')
        .eq('community_id', communityId)
        .eq('is_active', true);
      const checkIn = (activeSurveys ?? []).find((s: { title?: string }) =>
        /monthly\s+check-?in/i.test(s.title || '')
      );
      if (checkIn) {
        const [y, m, d] = String(date).split('-').map(Number);
        const newDue = new Date(Date.UTC(y, m - 1, d + 1)).toISOString();
        if (!checkIn.due_date || newDue > checkIn.due_date) {
          await supabaseAdmin
            .from('surveys')
            .update({ due_date: newDue })
            .eq('id', checkIn.id)
            // Name the HIVE on the write as well as on the read above. The id
            // came out of a read already scoped to this HIVE, so this changes
            // nothing today — it means a later edit to the read can't quietly
            // turn this into a line that moves another HIVE's check-in.
            // (2026-08-03)
            .eq('community_id', communityId);
          console.log(`Check-in due_date rolled to ${newDue} for survey ${checkIn.id}`);
        }
      }
    } catch (surveyError) {
      console.error('Could not roll check-in due_date (non-blocking):', surveyError);
    }

    return jsonResponse({
      success: true,
      event,
      meetLink,
      googleEventId: calendarEvent.id,
      attendeesInvited: attendees.length,
      attendeesSkipped,
      // Plain sentence rather than a raw number, so whatever screen shows this
      // can put it in front of a person as-is.
      ...(attendeesSkipped > 0
        ? {
            notice:
              attendeesSkipped === 1
                ? 'One person you picked belongs to a different HIVE, so they were left off the invite.'
                : `${attendeesSkipped} of the people you picked belong to a different HIVE, so they were left off the invite.`,
          }
        : {}),
    });
  } catch (error) {
    // The detail goes to the logs and nowhere else, changed 2026-08-03. This
    // used to hand the caller error.message, and the two errors thrown above
    // both carry Google's reply back word for word — the token endpoint's and
    // the calendar endpoint's. That is our Google account talking about itself,
    // and it belongs in a log, not in a browser. Every refusal this function
    // gives on purpose is a return rather than a throw, so none of the wording
    // people actually read has changed.
    console.error('Error scheduling meeting:', error);
    return errorResponse('We could not schedule that meeting. Please try again.', 500);
  }
});
