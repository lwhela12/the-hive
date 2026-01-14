/**
 * Schedule Meeting Edge Function
 *
 * Creates a calendar event with Google Meet link, sends calendar invites to
 * selected attendees, and stores it in the database.
 * Requires user authentication.
 *
 * POST /functions/v1/schedule-meeting
 * Body: { title, description?, date, time, duration?, communityId, attendeeIds? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface GoogleCalendarEvent {
  id: string;
  htmlLink: string;
  summary: string;
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
  duration?: number; // minutes, defaults to 60
  communityId: string;
  attendeeIds?: string[]; // User IDs to invite
  timezone?: string; // User's timezone, e.g., 'America/Los_Angeles'
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
  }
): Promise<GoogleCalendarEvent> {
  const { title, description, startDateTime, endDateTime, timeZone, attendees } = params;

  const requestBody: Record<string, unknown> = {
    summary: title,
    description,
    start: { dateTime: startDateTime, timeZone },
    end: { dateTime: endDateTime, timeZone },
    conferenceData: {
      createRequest: {
        requestId: `hive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  // Add attendees if provided
  if (attendees && attendees.length > 0) {
    requestBody.attendees = attendees;
    // Send email notifications to attendees
    requestBody.sendUpdates = 'all';
  }

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('conferenceDataVersion', '1');
  url.searchParams.set('sendUpdates', 'all'); // Ensure invites are sent

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
 * Extract Meet link from calendar event
 */
function extractMeetLink(event: GoogleCalendarEvent): string | null {
  const meetEntry = event.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video'
  );
  return meetEntry?.uri ?? null;
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

  const { userId, token } = auth;

  try {
    // Parse request body
    const body: ScheduleMeetingRequest = await req.json();
    const { title, description, date, time, duration = 60, communityId, attendeeIds, timezone } = body;

    // Validate required fields
    if (!title || !date || !time || !communityId) {
      return errorResponse('Missing required fields: title, date, time, communityId', 400);
    }

    // Use the user's timezone, fallback to Eastern if not provided
    const timeZone = timezone || 'America/New_York';
    const startDateTime = `${date}T${time}:00`;

    // Calculate end time by parsing the time string and adding duration
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + duration;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    const endTimeStr = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:00`;

    // Handle day rollover if meeting goes past midnight
    let endDateStr = date;
    if (totalMinutes >= 24 * 60) {
      const dateObj = new Date(`${date}T12:00:00`); // Use noon to avoid DST issues
      dateObj.setDate(dateObj.getDate() + Math.floor(totalMinutes / (24 * 60)));
      endDateStr = dateObj.toISOString().split('T')[0];
    }
    const endDateTime = `${endDateStr}T${endTimeStr}`;

    // Fetch attendee emails if attendeeIds provided
    let attendees: Attendee[] = [];
    if (attendeeIds && attendeeIds.length > 0) {
      // Use service role to fetch all member emails
      const adminSupabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data: profiles, error: profilesError } = await adminSupabase
        .from('profiles')
        .select('email')
        .in('id', attendeeIds);

      if (profilesError) {
        console.error('Failed to fetch attendee emails:', profilesError);
      } else if (profiles) {
        attendees = profiles
          .filter((p) => p.email)
          .map((p) => ({ email: p.email }));
      }
    }

    // Get Google access token
    const accessToken = await getAccessToken();

    // Create Google Calendar event with Meet link and attendees
    const calendarEvent = await createCalendarEvent(accessToken, {
      title,
      description,
      startDateTime,
      endDateTime,
      timeZone,
      attendees,
    });

    const meetLink = extractMeetLink(calendarEvent);

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
        event_time: time,
        event_type: 'meeting',
        google_event_id: calendarEvent.id,
        meet_link: meetLink,
        community_id: communityId,
        created_by: userId,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return errorResponse('Failed to save meeting to database', 500);
    }

    return jsonResponse({
      success: true,
      event,
      meetLink,
      googleEventId: calendarEvent.id,
    });
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to schedule meeting',
      500
    );
  }
});
