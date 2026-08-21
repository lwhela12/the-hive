import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface CreateEventPayload {
  community_id: string;
  title: string;
  event_date: string;
  end_date?: string | null;
  event_time?: string | null;
  /**
   * When the meeting finishes, so a member sees a window instead of only an
   * arrival time — Nat: "i couldnt add window, like 5-7, i could only put in
   * 5pm" (migration 202).
   */
  end_time?: string | null;
  description?: string | null;
  location?: string | null;
  /** Signed-in reach, or an owner-reviewed public invitation. */
  visibility?: string | null;
}

/** 'HH:MM' or 'HH:MM:SS' to minutes past midnight, or null if it isn't a time. */
function timeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  const auth = await verifySupabaseJwt(authHeader);

  if (isAuthError(auth)) {
    return errorResponse(auth.error, auth.status);
  }

  const { userId, token } = auth;
  const payload: CreateEventPayload = await req.json();

  const communityId = payload.community_id;
  const title = payload.title?.trim();
  const eventDate = payload.event_date;

  if (!communityId || !title || !eventDate) {
    return errorResponse('Missing title, date, or community', 400);
  }

  if (payload.end_time) {
    const endMinutes = timeToMinutes(payload.end_time);
    if (endMinutes === null) {
      return errorResponse('Please give the end time as HH:MM.', 400);
    }
    if (payload.event_time) {
      const startMinutes = timeToMinutes(payload.event_time);
      if (startMinutes !== null && endMinutes <= startMinutes) {
        return errorResponse('End time must be after the start time.', 400);
      }
    }
  }

  const supabaseUser = createClient(
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

  const { data: membership, error: membershipError } = await supabaseUser
    .from('community_memberships')
    .select('id')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .single();

  if (membershipError || !membership) {
    return errorResponse('Community membership required', 403);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: creator } = await supabaseAdmin
    .from('profiles')
    .select('is_owner')
    .eq('id', userId)
    .maybeSingle();

  if (payload.visibility === 'public' && !creator?.is_owner) {
    return errorResponse('Public invitations are reviewed by the HIVE owner', 403);
  }

  const newEvent: Record<string, string | null> = {
    title,
    event_date: eventDate,
    event_type: 'custom',
    // Member-created events have two signed-in reaches. Public is exceptional
    // and passed only after the owner check above.
    visibility: payload.visibility === 'public'
      ? 'public'
      : payload.visibility === 'all_hives' ? 'all_hives' : 'members',
    created_by: userId,
    community_id: communityId,
  };

  if (payload.event_time) newEvent.event_time = payload.event_time;
  if (payload.end_time) newEvent.end_time = payload.end_time;
  // Multi-day range: only keep an end date that lands after the start date.
  if (payload.end_date && payload.end_date > eventDate) newEvent.end_date = payload.end_date;
  if (payload.description?.trim()) newEvent.description = payload.description.trim();
  if (payload.location?.trim()) newEvent.location = payload.location.trim();

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .insert(newEvent)
    .select()
    .single();

  if (error) {
    console.error('Failed to create event:', error);
    return errorResponse(error.message || 'Failed to create event', 500);
  }

  return jsonResponse({ success: true, event });
});
