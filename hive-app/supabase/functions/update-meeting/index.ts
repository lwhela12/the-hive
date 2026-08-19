/**
 * Update Meeting Edge Function
 *
 * Updates a calendar event in Google Calendar and the database.
 * You must be signed in AND an admin of the HIVE that owns the meeting.
 *
 * POST /functions/v1/update-meeting
 * Body: { eventId, title?, description?, location?, date?, time? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError, isCommunityAdmin } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

/**
 * One answer for "there is no such meeting" and for "that meeting isn't yours
 * to change" — on purpose, added 2026-08-03. If the two answers differed, anyone
 * could feed this endpoint a stream of guessed ids and use the difference to map
 * out which meetings exist in HIVEs they've never been near. A refusal shouldn't
 * hand back a fact.
 */
const CANNOT_CHANGE_MEETING =
  "We couldn't change that meeting. Either it isn't there, or it belongs to a HIVE you don't run.";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface UpdateMeetingRequest {
  eventId: string;
  title?: string;
  description?: string;
  location?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  timezone?: string;
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
 * Update a Google Calendar event
 */
async function updateCalendarEvent(
  accessToken: string,
  googleEventId: string,
  params: {
    title?: string;
    description?: string;
    location?: string;
    startDateTime?: string;
    endDateTime?: string;
    timeZone?: string;
    /**
     * Give this event a Meet link if it has not got one.
     *
     * `schedule-meeting` adds one when the HIVE meets on Meet (migration 191),
     * but every event made BEFORE that flag existed has none — including Tech
     * HIVE's own September meeting, the first one that needs it. Editing a
     * meeting is the natural place to fix that, rather than asking somebody to
     * delete a meeting people have already accepted and make it again.
     */
    addMeetLink?: boolean;
  }
): Promise<string | null> {
  const { title, description, location, startDateTime, endDateTime, timeZone, addMeetLink } = params;

  // Build the update payload - only include changed fields
  const requestBody: Record<string, unknown> = {};

  if (title !== undefined) {
    requestBody.summary = title;
  }
  if (description !== undefined) {
    requestBody.description = description;
  }
  if (location !== undefined) {
    requestBody.location = location;
  }
  if (startDateTime && timeZone) {
    requestBody.start = { dateTime: startDateTime, timeZone };
  }
  if (endDateTime && timeZone) {
    requestBody.end = { dateTime: endDateTime, timeZone };
  }

  /**
   * The id is escaped before it goes in the address, added 2026-08-03.
   *
   * It looks safe because it comes out of our own database, but the column it
   * comes from — events.google_event_id — is plain text with no rules on it, and
   * the database lets anyone edit an event they created. So the value is really
   * whatever a person last typed there.
   *
   * Dropped into the address as-is, an "id" of
   * "../../calendars/somebody-else/events/abc" climbs out of "primary" and edits
   * a calendar that was never ours to touch, and a "?" in it lets the writer bolt
   * their own settings onto our request. Escaped, it can only ever be one event
   * id in one calendar, which is all it was ever meant to be.
   */
  if (addMeetLink) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `hive-${googleEventId}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  // Google ignores conferenceData without this and says nothing about having
  // done so — the event comes back looking fine, with no link on it.
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}?sendUpdates=all`
    + (addMeetLink ? '&conferenceDataVersion=1' : '');

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update calendar event: ${error}`);
  }

  // Hand the link back so it can be written down. A link that exists only on
  // Google is a link the app cannot show anybody.
  const updated = await response.json().catch(() => null) as {
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
  } | null;
  return updated?.hangoutLink
    ?? updated?.conferenceData?.entryPoints?.find((point) => point.entryPointType === 'video')?.uri
    ?? null;
}

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

  const { userId } = auth;

  try {
    // Parse request body
    const body: UpdateMeetingRequest = await req.json();
    const { eventId, title, description, location, date, time, timezone } = body;

    if (!eventId) {
      return errorResponse('Missing required field: eventId', 400);
    }

    // Use service role to fetch the event
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the meeting itself first. We only ask for the columns this function
    // actually uses; community_id is the one that decides whether the caller is
    // allowed anywhere near the rest of it.
    const { data: event, error: fetchError } = await adminSupabase
      .from('events')
      .select('id, community_id, google_event_id, event_date, event_time, event_type, meet_link')
      .eq('id', eventId)
      .maybeSingle();

    if (fetchError) {
      console.error('Could not load the meeting:', fetchError);
      return errorResponse('Failed to load the meeting', 500);
    }

    /**
     * The permission gate, added 2026-08-03.
     *
     * Until today this function checked that you were signed in and then did as
     * it was told. It reads and writes with the service-role key, which ignores
     * row-level security, so a member of one HIVE who guessed or spotted another
     * HIVE's meeting id could rewrite that meeting's title, description, place
     * and time. Worse, the Google Calendar step below sends its update to every
     * attendee, so a stranger's words would land in their inboxes over our name.
     *
     * The HIVE we check against comes off the meeting row we just loaded, never
     * from the request. Letting the caller name their own community id would be
     * the same trust-the-asker mistake wearing a different hat.
     */
    if (!event || !(await isCommunityAdmin(adminSupabase, userId, event.community_id))) {
      return errorResponse(CANNOT_CHANGE_MEETING, 403);
    }

    /**
     * The second half of the same question, added 2026-08-03.
     *
     * The gate above settled who owns the ROW. It did not settle who owns the
     * CALENDAR ENTRY that row points at, and those are two different things: the
     * pointer lives in events.google_event_id, a plain text column, and the
     * database lets any member freely edit an event they created themselves.
     *
     * So there was still a way through. Make a meeting in your own HIVE, then
     * quietly paste another HIVE's calendar id into it — you can read that id off
     * any meeting shared past its own HIVE. Now call this function. The gate says
     * yes, because you really do run the HIVE that owns your row. And the step
     * below rewrites the OTHER HIVE's calendar entry and, because Google mails
     * every guest when an event changes, sends your words to their whole guest
     * list over our name.
     *
     * One calendar entry belongs to one meeting in one HIVE. If a meeting in some
     * other HIVE is already claiming this one, we stop. We don't try to work out
     * which of the two is the impostor — that's a person's job, and the log line
     * below is how they find out it happened.
     */
    if (event.google_event_id) {
      const { data: otherClaims, error: claimError } = await adminSupabase
        .from('events')
        .select('id, community_id')
        .eq('google_event_id', event.google_event_id)
        .neq('community_id', event.community_id)
        .limit(1);

      if (claimError) {
        console.error('Could not check who else claims this calendar entry:', claimError);
        return errorResponse('Failed to load the meeting', 500);
      }

      if (otherClaims && otherClaims.length > 0) {
        console.error(
          'Refusing to change a calendar entry that two HIVEs both claim. Meeting:',
          event.id,
          'calendar entry:',
          event.google_event_id,
          'also claimed by meeting:',
          otherClaims[0].id
        );
        // Same refusal as "that isn't yours", on purpose — see the note at the
        // top. A different answer here would confirm the paste had landed.
        return errorResponse(CANNOT_CHANGE_MEETING, 403);
      }
    }

    // Build database update
    const dbUpdate: Record<string, unknown> = {};
    if (title !== undefined) dbUpdate.title = title;
    if (description !== undefined) dbUpdate.description = description || null;
    if (location !== undefined) dbUpdate.location = location || null;
    if (date !== undefined) dbUpdate.event_date = date;
    if (time !== undefined) dbUpdate.event_time = time || null;

    // Update Google Calendar if we have a google_event_id
    if (event.google_event_id) {
      try {
        const accessToken = await getAccessToken();

        // Calculate start/end times if date or time changed
        let startDateTime: string | undefined;
        let endDateTime: string | undefined;
        const timeZone = timezone || 'America/New_York';

        if (date || time) {
          const eventDate = date || event.event_date;
          const eventTime = time || event.event_time || '12:00';
          startDateTime = `${eventDate}T${eventTime}:00`;

          // Calculate end time (assume 1 hour duration)
          const [hours, minutes] = eventTime.split(':').map(Number);
          const endHours = (hours + 1) % 24;
          const endTimeStr = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
          endDateTime = `${eventDate}T${endTimeStr}`;
        }

        // A HIVE that meets on Meet, on a meeting that has no link yet, gets
        // one now — see `addMeetLink`. Editing is where somebody fixes a
        // meeting made before the HIVE moved to Meet, and the alternative was
        // deleting a meeting people have already accepted.
        const { data: hiveRow } = await adminSupabase
          .from('communities')
          .select('meets_on_google_meet')
          .eq('id', event.community_id)
          .maybeSingle();
        const addMeetLink = !!(hiveRow as { meets_on_google_meet?: boolean } | null)?.meets_on_google_meet
          && event.event_type === 'meeting'
          && !event.meet_link;

        const meetLink = await updateCalendarEvent(accessToken, event.google_event_id, {
          title,
          description,
          location,
          startDateTime,
          endDateTime,
          timeZone,
          addMeetLink,
        });
        if (addMeetLink && meetLink) dbUpdate.meet_link = meetLink;
        console.log('Updated Google Calendar event:', event.google_event_id);
      } catch (calendarError) {
        // Log but don't fail - still update database
        console.error('Failed to update Google Calendar:', calendarError);
      }
    }

    // Update database
    if (Object.keys(dbUpdate).length > 0) {
      const { error: updateError } = await adminSupabase
        .from('events')
        .update(dbUpdate)
        .eq('id', eventId)
        // Naming the HIVE again on the write is belt and braces: the row we
        // approved is the only row that can change, whatever happens above.
        .eq('community_id', event.community_id);

      if (updateError) {
        console.error('Database update error:', updateError);
        return errorResponse('Failed to update meeting in database', 500);
      }
    }

    return jsonResponse({
      success: true,
      message: 'Meeting updated',
    });
  } catch (error) {
    console.error('Error updating meeting:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to update meeting',
      500
    );
  }
});
