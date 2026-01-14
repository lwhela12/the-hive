/**
 * Delete Meeting Edge Function
 *
 * Deletes a calendar event from Google Calendar and removes it from the database.
 * Requires user authentication and admin privileges.
 *
 * POST /functions/v1/delete-meeting
 * Body: { eventId }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface DeleteMeetingRequest {
  eventId: string;
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
 * Delete a Google Calendar event
 */
async function deleteCalendarEvent(
  accessToken: string,
  googleEventId: string
): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}?sendUpdates=all`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // 204 No Content is success, 404 means already deleted (also OK)
  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete calendar event: ${error}`);
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

  const { userId, token } = auth;

  try {
    // Parse request body
    const body: DeleteMeetingRequest = await req.json();
    const { eventId } = body;

    if (!eventId) {
      return errorResponse('Missing required field: eventId', 400);
    }

    // Use service role to fetch the event and check permissions
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the event to find the google_event_id
    const { data: event, error: fetchError } = await adminSupabase
      .from('events')
      .select('id, google_event_id, community_id')
      .eq('id', eventId)
      .single();

    if (fetchError || !event) {
      return errorResponse('Event not found', 404);
    }

    // Check if user is admin for this community
    const { data: membership } = await adminSupabase
      .from('community_memberships')
      .select('role')
      .eq('community_id', event.community_id)
      .eq('user_id', userId)
      .single();

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    const isAdmin = membership?.role === 'admin' || profile?.role === 'admin';

    if (!isAdmin) {
      return errorResponse('Only admins can delete meetings', 403);
    }

    // Delete from Google Calendar if we have the google_event_id
    if (event.google_event_id) {
      try {
        const accessToken = await getAccessToken();
        await deleteCalendarEvent(accessToken, event.google_event_id);
        console.log('Deleted from Google Calendar:', event.google_event_id);
      } catch (calendarError) {
        // Log but don't fail - still delete from database
        console.error('Failed to delete from Google Calendar:', calendarError);
      }
    }

    // Delete from database
    const { error: deleteError } = await adminSupabase
      .from('events')
      .delete()
      .eq('id', eventId);

    if (deleteError) {
      console.error('Database delete error:', deleteError);
      return errorResponse('Failed to delete meeting from database', 500);
    }

    return jsonResponse({
      success: true,
      message: 'Meeting deleted from calendar and database',
    });
  } catch (error) {
    console.error('Error deleting meeting:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to delete meeting',
      500
    );
  }
});
