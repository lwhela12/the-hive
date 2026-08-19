import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

/**
 * Keep the room's own recording, and send it to be written down.
 *
 * Nat, 2026-08-19, after Production met around one table with the video panel
 * untouched and nothing kept: *"I definitely, definitely think 100% of the time
 * we always want transcriptions, because you just never know"* — and one
 * microphone, not five: *"if we had everyone toggle on their mics to record
 * different speakers, the feedback would be crazy. So I think we just want the
 * one, I'll just toggle on the recording."*
 *
 * `save-transcript` is the same shape for the video call's own transcription.
 * This is its sibling for a room with no call in it: the presenter's laptop
 * records, uploads to `meeting-recordings`, and hands the path over here.
 *
 * The recording lands on the SAME `meetings` row Wrap-Up will seal — found by
 * date with exactly the rule `seal-meeting` and `save-transcript` use — so a
 * HIVE night is still one record no matter which of the three happens first.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function pacificToday() {
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

    const { community_id, storage_path, date } = await req.json().catch(() => ({}));
    if (!community_id) return errorResponse('community_id is required', 400);
    if (typeof storage_path !== 'string' || !storage_path.trim()) {
      return errorResponse('There was no recording to keep.', 400);
    }

    // The path is ours to build, never the caller's to choose freely: it has to
    // sit under this HIVE's own folder in the bucket, or a member of one HIVE
    // could hand us a path into another one's and have us transcribe it.
    if (!storage_path.startsWith(`${community_id}/`)) {
      return errorResponse('That recording does not belong to this HIVE.', 403);
    }

    // Membership is checked as the caller, so RLS decides.
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

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingRows } = await admin
      .from('meetings')
      .select('id, transcript_raw')
      .eq('community_id', community_id)
      .eq('date', meetingDate)
      .order('created_at', { ascending: true });

    const existing = (existingRows ?? []).find((row) => row.transcript_raw) ?? (existingRows ?? [])[0] ?? null;

    let meetingId = existing?.id as string | undefined;
    if (meetingId) {
      const { error } = await admin
        .from('meetings')
        .update({ audio_url: storage_path, processing_status: 'transcribing' })
        .eq('id', meetingId);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await admin
        .from('meetings')
        .insert({
          date: meetingDate,
          community_id,
          audio_url: storage_path,
          transcript_raw: '',
          transcript_attributed: '',
          recorded_by: userId,
          processing_status: 'transcribing',
        })
        .select('id')
        .single();
      if (error) throw error;
      meetingId = inserted.id;
    }

    // Hand it to AssemblyAI through the function that already knows how. Called
    // with the service key so `transcribe` treats it as the backend rather than
    // re-deriving a membership it has just been proved.
    const started = await fetch(`${supabaseUrl}/functions/v1/transcribe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ meeting_id: meetingId }),
    });

    if (!started.ok) {
      const detail = await started.text();
      console.error('Could not start the transcription:', started.status, detail);
      // The audio is safe on the meeting either way, so this is a partial
      // success rather than a lost recording — say so instead of throwing.
      await admin.from('meetings').update({ processing_status: 'failed' }).eq('id', meetingId);
      return jsonResponse({ meetingId, transcribing: false });
    }

    return jsonResponse({ meetingId, transcribing: true });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Could not keep the recording.',
      500
    );
  }
});
