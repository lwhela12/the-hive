import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

/**
 * Keep what the meeting said.
 *
 * The deck's video panel collects Daily's transcription as it happens — every
 * line already carrying the name of the microphone it came from — and hands the
 * whole thing over here when the call ends.
 *
 * It lands on the `meetings` row for that day, which is the row `seal-meeting`
 * looks for when Wrap-Up seals the night's notes (it deliberately prefers a row
 * that already has a `transcript_raw`). So the transcript and the notes end up
 * on the same meeting record no matter which of the two happens first.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function pacificToday() {
  // Same rule seal-meeting uses, so both land on the same date.
  return new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    const auth = await verifySupabaseJwt(authHeader);
    if (isAuthError(auth)) return errorResponse(auth.error, auth.status);
    const { userId, token } = auth;

    const { community_id, transcript, date } = await req.json().catch(() => ({}));
    if (!community_id) return errorResponse('community_id is required', 400);
    if (typeof transcript !== 'string' || !transcript.trim()) {
      return errorResponse('There was nothing to keep.', 400);
    }

    // Membership is checked as the caller, so RLS decides — this function
    // never lets anybody write into a HIVE they are not in.
    const asCaller = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey } },
    });
    const { data: membership } = await asCaller
      .from('community_memberships')
      .select('user_id')
      .eq('community_id', community_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!membership) return errorResponse('You are not in this HIVE.', 403);

    const meetingDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : pacificToday();

    // `meetings` is written with the service key here for the same reason
    // seal-meeting does it: the row belongs to the HIVE rather than to the
    // person who happened to be holding the deck.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingRows } = await admin
      .from('meetings')
      .select('id, transcript_raw')
      .eq('community_id', community_id)
      .eq('date', meetingDate)
      .order('created_at', { ascending: true });

    const existing = (existingRows ?? []).find((row) => row.transcript_raw) ?? (existingRows ?? [])[0] ?? null;

    if (existing) {
      // A call that stops and starts again in one evening adds to the record
      // rather than replacing what was already said.
      const previous = (existing.transcript_raw ?? '').trim();
      const combined = previous ? `${previous}\n\n${transcript.trim()}` : transcript.trim();
      const { error } = await admin
        .from('meetings')
        .update({ transcript_raw: combined })
        .eq('id', existing.id);
      if (error) throw error;
      return jsonResponse({ meetingId: existing.id, appended: !!previous });
    }

    const { data: inserted, error } = await admin
      .from('meetings')
      .insert({
        date: meetingDate,
        community_id,
        transcript_raw: transcript.trim(),
        transcript_attributed: '',
        recorded_by: userId,
        processing_status: 'complete',
      })
      .select('id')
      .single();
    if (error) throw error;

    return jsonResponse({ meetingId: inserted.id, appended: false });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Could not keep the transcript.',
      500
    );
  }
});
