/**
 * Google Calendar integration with Meet link generation
 *
 * This module handles:
 * - Creating calendar events with Google Meet conferencing
 * - Fetching the Meet link from created events
 *
 * Note: Requires a valid Google refresh token stored in the user's profile.
 * OAuth scopes needed: calendar.events
 */

const GOOGLE_API_BASE = 'https://www.googleapis.com/calendar/v3';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface GoogleCalendarEvent {
  id: string;
  htmlLink: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType: string;
      uri: string;
      label?: string;
    }>;
    conferenceSolution?: {
      name: string;
      iconUri: string;
    };
  };
}

interface CreateEventParams {
  title: string;
  description?: string;
  startDateTime: string; // ISO string
  endDateTime: string; // ISO string
  timeZone?: string;
  includeMeet?: boolean;
}

/**
 * Exchange a refresh token for an access token
 */
async function getAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data: GoogleTokenResponse = await response.json();
  return data.access_token;
}

/**
 * Create a calendar event with optional Google Meet link
 */
export async function createCalendarEvent(
  accessToken: string,
  params: CreateEventParams
): Promise<GoogleCalendarEvent> {
  const { title, description, startDateTime, endDateTime, timeZone = 'America/New_York', includeMeet = true } = params;

  const requestBody: Record<string, unknown> = {
    summary: title,
    description,
    start: {
      dateTime: startDateTime,
      timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone,
    },
  };

  // Add conference data request for Google Meet
  if (includeMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `hive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet',
        },
      },
    };
  }

  const url = new URL(`${GOOGLE_API_BASE}/calendars/primary/events`);
  if (includeMeet) {
    url.searchParams.set('conferenceDataVersion', '1');
  }

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
 * Extract the Meet link from a calendar event response
 */
export function extractMeetLink(event: GoogleCalendarEvent): string | null {
  const meetEntry = event.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video'
  );
  return meetEntry?.uri ?? null;
}

/**
 * High-level function to create a meeting with Google Meet
 * This would typically be called from a Supabase Edge Function
 */
export async function createMeetingWithMeet(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  params: CreateEventParams
): Promise<{ event: GoogleCalendarEvent; meetLink: string | null }> {
  const accessToken = await getAccessToken(refreshToken, clientId, clientSecret);
  const event = await createCalendarEvent(accessToken, { ...params, includeMeet: true });
  const meetLink = extractMeetLink(event);

  return { event, meetLink };
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `${GOOGLE_API_BASE}/calendars/primary/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete calendar event: ${error}`);
  }
}

/**
 * Update a calendar event
 */
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  params: Partial<CreateEventParams>
): Promise<GoogleCalendarEvent> {
  const { title, description, startDateTime, endDateTime, timeZone = 'America/New_York' } = params;

  const requestBody: Record<string, unknown> = {};

  if (title) requestBody.summary = title;
  if (description !== undefined) requestBody.description = description;
  if (startDateTime) {
    requestBody.start = { dateTime: startDateTime, timeZone };
  }
  if (endDateTime) {
    requestBody.end = { dateTime: endDateTime, timeZone };
  }

  const response = await fetch(
    `${GOOGLE_API_BASE}/calendars/primary/events/${eventId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update calendar event: ${error}`);
  }

  return response.json();
}
