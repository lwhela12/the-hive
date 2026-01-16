/**
 * Update Meeting Edge Function
 *
 * Updates a calendar event in Google Calendar and the database.
 * Requires user authentication.
 *
 * POST /functions/v1/update-meeting
 * Body: { eventId, title?, description?, location?, date?, time? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

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
  }
): Promise<void> {
  const { title, description, location, startDateTime, endDateTime, timeZone } = params;

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

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}?sendUpdates=all`;

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

  const { token } = auth;

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

    // Get the event to find the google_event_id and current values
    const { data: event, error: fetchError } = await adminSupabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (fetchError || !event) {
      return errorResponse('Event not found', 404);
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

        await updateCalendarEvent(accessToken, event.google_event_id, {
          title,
          description,
          location,
          startDateTime,
          endDateTime,
          timeZone,
        });
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
        .eq('id', eventId);

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
