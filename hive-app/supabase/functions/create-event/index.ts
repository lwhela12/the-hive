import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface CreateEventPayload {
  community_id: string;
  title: string;
  event_date: string;
  event_time?: string | null;
  description?: string | null;
  location?: string | null;
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

  const newEvent: Record<string, string | null> = {
    title,
    event_date: eventDate,
    event_type: 'custom',
    created_by: userId,
    community_id: communityId,
  };

  if (payload.event_time) newEvent.event_time = payload.event_time;
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
