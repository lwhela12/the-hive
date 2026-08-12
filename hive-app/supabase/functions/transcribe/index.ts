import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { verifySupabaseJwt, isAuthError, isCommunityMember } from '../_shared/auth.ts';
import { recordAssistantUsage } from '../_shared/metering.ts';

const ASSEMBLYAI_API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY')!;

// Who is allowed to knock on this function, and how.
//
// Found by the 2026-08-04 audit: nobody was. Two quite different things share
// this one address, and neither had a door.
//
// A webhook cannot present a signed-in person, so it does not get a JWT — it
// gets a shared secret. AssemblyAI will send back any header we ask it to when
// we submit the job, so we ask for this one. The secret lives in the function's
// environment, never in the code:
//
//   supabase secrets set ASSEMBLYAI_WEBHOOK_SECRET=<a long random string>
//
// The one thing this must not do is lock out the real caller. The webhook path
// down in serve() explains, at length, why the secret is not the ONLY check and
// what has to change in another file before it can be.
const WEBHOOK_SECRET = Deno.env.get('ASSEMBLYAI_WEBHOOK_SECRET') ?? '';
const WEBHOOK_HEADER = 'x-hive-transcribe-secret';

/** Ask AssemblyAI what actually happened, rather than believing the body. */
async function fetchTranscript(transcriptId: string) {
  const response = await fetch(
    `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
    { headers: { Authorization: ASSEMBLYAI_API_KEY } }
  );
  if (!response.ok) {
    console.error('AssemblyAI lookup failed:', response.status, await response.text());
    return null;
  }
  return await response.json();
}

function formatTranscript(transcript: {
  utterances?: { speaker: string; text: string }[] | null;
  text?: string | null;
}) {
  if (transcript.utterances && transcript.utterances.length > 0) {
    return transcript.utterances
      .map((u) => `Speaker ${u.speaker}: ${u.text}`)
      .join('\n\n');
  }
  return transcript.text ?? '';
}

// Voice-memo imports: one webhook call per file. Store this file's transcript
// on its job row; once every job for the meeting is terminal, stitch the full
// transcript into the meeting so the normal Apply Notes flow takes over.
// deno-lint-ignore no-explicit-any
async function handleJobWebhook(supabaseAdmin: any, job: any, status: string, transcript: any) {
  if (status === 'completed') {
    await supabaseAdmin
      .from('meeting_transcription_jobs')
      .update({
        status: 'completed',
        transcript_text: formatTranscript(transcript),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  } else {
    await supabaseAdmin
      .from('meeting_transcription_jobs')
      .update({
        status: 'failed',
        error_message: `AssemblyAI reported status: ${status}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  }

  const { data: jobs } = await supabaseAdmin
    .from('meeting_transcription_jobs')
    .select('*')
    .eq('meeting_id', job.meeting_id)
    .order('position', { ascending: true });

  const allJobs = jobs ?? [];
  if (allJobs.some((row: { status: string }) => row.status === 'submitted')) {
    return jsonResponse({ success: true, pending: true });
  }

  const { data: meeting } = await supabaseAdmin
    .from('meetings')
    .select('*')
    .eq('id', job.meeting_id)
    .single();

  // Duplicate webhook deliveries: only the first finalize pass should write.
  if (!meeting || meeting.processing_status !== 'transcribing') {
    return jsonResponse({ success: true, alreadyFinalized: true });
  }

  const multipleFiles = allJobs.length > 1;
  const parts = allJobs.map((row: { file_name: string; status: string; transcript_text: string | null; error_message: string | null }) => {
    const heading = multipleFiles ? `— ${row.file_name} —\n\n` : '';
    if (row.status === 'completed' && row.transcript_text) {
      return `${heading}${row.transcript_text}`;
    }
    return `${heading}[Transcription failed for ${row.file_name}: ${row.error_message ?? 'unknown error'}]`;
  });

  const pastedSeed = (meeting.transcript_raw ?? '').trim();
  const combined = [pastedSeed, ...parts].filter(Boolean).join('\n\n');
  const anyCompleted = allJobs.some((row: { status: string }) => row.status === 'completed');

  let summaryPayload: Record<string, unknown> = {};
  try {
    summaryPayload = JSON.parse(meeting.summary ?? '{}');
  } catch {
    summaryPayload = {};
  }
  summaryPayload.summary = anyCompleted
    ? 'Notes imported. Apply them when you are ready for Clive to create tasks, events, and board updates.'
    : 'Transcription failed for the uploaded voice memos. You can paste the notes instead.';

  await supabaseAdmin
    .from('meetings')
    .update({
      transcript_raw: combined,
      transcript_attributed: combined,
      summary: JSON.stringify(summaryPayload),
      processing_status: anyCompleted || pastedSeed ? 'complete' : 'failed',
    })
    .eq('id', meeting.id);

  return jsonResponse({ success: true, finalized: true });
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  try {
    // `null` on its own is valid JSON, and so is `7`. Reading a field off
    // either throws, which turns a junk request into a 500 instead of a plain
    // refusal. Same fix check-in-reminder needed on 2026-08-03.
    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch { /* an empty body is just an invalid request */ }

    const transcriptId = typeof body.transcript_id === 'string' ? body.transcript_id : '';

    if (transcriptId) {
      // ───────────────────────────────────────────────────────────────────
      // THE WEBHOOK PATH — AssemblyAI telling us a job finished.
      //
      // This used to accept the caller's word for everything: who they were
      // (nobody asked), and what had happened (`body.status`). So anyone could
      // POST `{transcript_id, status: 'error'}` and mark somebody's meeting
      // failed, and the old order of operations meant an unknown transcript_id
      // still cost us a round trip to AssemblyAI before we noticed.
      //
      // Three things now stand between a stranger and this code, in the order
      // they are cheapest to check:
      //
      //   1. The shared secret, when it is there. We ask AssemblyAI to send it
      //      back on every job WE submit, so a request that carries the header
      //      and gets it wrong is turned away flat.
      //   2. The id has to be one of ours. transcript_ids are AssemblyAI's own
      //      random ids, we only ever learn them by submitting a job, and every
      //      one is written down against a meeting or a job row.
      //   3. What happened is not up to the caller. We ask AssemblyAI directly
      //      and act on ITS answer, so a forged body can only ever tell us
      //      something true.
      //
      // WHY (1) IS NOT THE WHOLE LOCK, AND MUST NOT BE MADE ONE YET: the voice
      // memo import submits its own jobs from import-meeting-notes/index.ts,
      // and it does not send the auth header. Requiring the header outright
      // today would mean every voice memo Nat imports transcribes fine at
      // AssemblyAI and then silently never comes back. When that file starts
      // sending the header too, this can become a hard requirement — delete the
      // `if (sent)` and refuse anything without it.
      const sentSecret = req.headers.get(WEBHOOK_HEADER);
      if (sentSecret && (!WEBHOOK_SECRET || sentSecret !== WEBHOOK_SECRET)) {
        console.error('Webhook secret did not match');
        return errorResponse('Not for you', 403);
      }

      const { data: job } = await supabaseAdmin
        .from('meeting_transcription_jobs')
        .select('*')
        .eq('transcript_id', transcriptId)
        .maybeSingle();

      // Older single-recording meetings keep the id on the meeting row itself.
      let legacyMeeting = null;
      if (!job) {
        const { data } = await supabaseAdmin
          .from('meetings')
          .select('*')
          .eq('assemblyai_transcript_id', transcriptId)
          .maybeSingle();
        legacyMeeting = data;
      }

      if (!job && !legacyMeeting) {
        console.error('No job or meeting for transcript_id:', transcriptId);
        return errorResponse('Unknown transcript', 404);
      }

      const transcript = await fetchTranscript(transcriptId);
      if (!transcript) {
        return errorResponse('Could not confirm the transcript with AssemblyAI', 502);
      }

      // AssemblyAI's own words, not the caller's. Anything still in flight is
      // not a finished job and there is nothing to do with it yet.
      const status: string = transcript.status;
      if (status !== 'completed' && status !== 'error') {
        return jsonResponse({ success: true, notFinished: status });
      }

      if (job) {
        return await handleJobWebhook(supabaseAdmin, job, status, transcript);
      }

      const meeting = legacyMeeting;

      // A failed single recording should say so rather than being dropped on
      // the floor, which is what happened before — only 'completed' was ever
      // handled and an 'error' fell through to the 400 at the bottom.
      if (status === 'error') {
        await supabaseAdmin
          .from('meetings')
          .update({ processing_status: 'failed' })
          .eq('id', meeting.id);
        return jsonResponse({ success: true, failed: true });
      }

      // Format transcript with speaker labels
      let formattedTranscript = '';
      if (transcript.utterances) {
        formattedTranscript = transcript.utterances
          .map((u: { speaker: string; text: string }) => `Speaker ${u.speaker}: ${u.text}`)
          .join('\n\n');
      } else {
        formattedTranscript = transcript.text;
      }

      // Update meeting with transcript
      await supabaseAdmin
        .from('meetings')
        .update({
          transcript_raw: formattedTranscript,
          processing_status: 'summarizing'
        })
        .eq('id', meeting.id);

      // Generate summary and extract action items with Claude
      const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

      // Get all members for speaker attribution
      const { data: memberRows } = await supabaseAdmin
        .from('community_memberships')
        .select('user_id')
        .eq('community_id', meeting.community_id);
      const memberIds = memberRows?.map((row) => row.user_id) || [];
      const { data: members } = memberIds.length
        ? await supabaseAdmin
          .from('profiles')
          .select('id, name')
          .in('id', memberIds)
        : { data: [] as { id: string; name: string }[] };

      const response = await anthropic.messages.create({
        // Was claude-sonnet-4-20250514, which is DEPRECATED and retires
        // 2026-06-15 — after that date this function would have started
        // returning 404 and meeting transcripts would have silently stopped
        // being cleaned up. Moved while we were in here (2026-08-03).
        //
        // Thinking is off on purpose: this is mechanical clean-up of a
        // transcript, there are no tools to reach for, and Sonnet 5's default
        // adaptive thinking would eat the 2048-token cap.
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        thinking: { type: 'disabled' as const },
        system: `You are summarizing a HIVE community meeting. H.I.V.E. (Human Insight Vision Execution) is a group of 12 people who practice "high-definition wishing" - helping each other articulate specific needs and matching them with skills.

Available members: ${members?.map(m => m.name).join(', ')}

Analyze the transcript and provide:
1. A concise summary (2-3 paragraphs)
2. Action items extracted with assigned person if mentioned
3. Any wishes or needs that surfaced during the meeting. Treat these as summary candidates only, not automatic wish records.

Format your response as JSON:
{
  "summary": "string",
  "action_items": [{"description": "string", "assigned_to_name": "string or null", "due_date": "YYYY-MM-DD or null"}],
  "wishes_surfaced": [{"person_name": "string", "description": "string"}]
}`,
        messages: [
          {
            role: 'user',
            content: `Please analyze this meeting transcript:\n\n${formattedTranscript}`
          }
        ]
      });

      // Clive keeps receipts (migration 175). This is the unattended
      // AssemblyAI-webhook path — spend nobody was watching.
      recordAssistantUsage({
        functionName: 'transcribe',
        model: 'claude-sonnet-5',
        usage: response.usage,
        communityId: meeting.community_id ?? null,
      });

      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

      let analysis;
      try {
        // Claude sometimes wraps JSON in markdown code blocks, so strip those
        let jsonText = textBlock?.text || '{}';
        jsonText = jsonText.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
        jsonText = jsonText.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
        analysis = JSON.parse(jsonText);
      } catch {
        analysis = { summary: textBlock?.text, action_items: [], wishes_surfaced: [] };
      }

      // Store the full analysis as JSON so frontend can display all parts
      const summaryData = {
        summary: analysis.summary,
        wishes_surfaced: analysis.wishes_surfaced || [],
      };

      // Update meeting with summary
      await supabaseAdmin
        .from('meetings')
        .update({
          summary: JSON.stringify(summaryData),
          transcript_attributed: formattedTranscript, // TODO: Attribute speakers to names
          processing_status: 'complete'
        })
        .eq('id', meeting.id);

      // Create action items
      if (analysis.action_items?.length > 0) {
        for (const item of analysis.action_items) {
          let assignedTo = null;
          if (item.assigned_to_name && members) {
            const member = members.find(m =>
              m.name.toLowerCase().includes(item.assigned_to_name.toLowerCase())
            );
            assignedTo = member?.id;
          }

          await supabaseAdmin.from('action_items').insert({
            meeting_id: meeting.id,
            community_id: meeting.community_id,
            description: item.description,
            assigned_to: assignedTo,
            due_date: item.due_date
          });
        }
      }

      return jsonResponse({ success: true });

    } else if (typeof body.meeting_id === 'string' && body.meeting_id) {
      // ───────────────────────────────────────────────────────────────────
      // THE START PATH — someone asking us to transcribe a recording.
      //
      // Nothing like a webhook, and it had no door either. A meeting id is not
      // a secret — every member of a HIVE can read its meetings — so anybody
      // signed in, or anybody at all who came by one, could POST it here and
      // have us mint a one-hour signed URL to that meeting's audio, hand it to
      // AssemblyAI, and reset the meeting's processing_status. On repeat that
      // is somebody else's AssemblyAI bill and a meeting stuck saying
      // "transcribing" forever.
      //
      // Two ways in, matching the rest of the app: the backend's own service
      // key, or a signed-in member OF THAT MEETING'S HIVE. The membership check
      // is the half that used to be missing everywhere (see _shared/auth.ts) —
      // verifying the token only proves you are somebody, not that you are
      // somebody with business here.
      const meeting_id = body.meeting_id;
      const authHeader = req.headers.get('Authorization') ?? '';
      const calledByBackend = !!serviceKey && authHeader === `Bearer ${serviceKey}`;

      // Who first, then what. Looking the meeting up before checking the token
      // would make the difference between 404 and 403 a way to sit outside and
      // ask "is this a real meeting id?" all afternoon.
      let callerId = '';
      if (!calledByBackend) {
        const auth = await verifySupabaseJwt(authHeader);
        if (isAuthError(auth)) return errorResponse(auth.error, auth.status);
        callerId = auth.userId;
      }

      // Get meeting
      const { data: meeting, error } = await supabaseAdmin
        .from('meetings')
        .select('*')
        .eq('id', meeting_id)
        .single();

      if (error || !meeting) {
        return errorResponse('Meeting not found', 404);
      }

      if (
        !calledByBackend &&
        !(await isCommunityMember(supabaseAdmin, callerId, meeting.community_id))
      ) {
        return errorResponse('Meeting not found', 404);
      }

      // Get signed URL for audio file
      const { data: signedUrl } = await supabaseAdmin.storage
        .from('meeting-recordings')
        .createSignedUrl(meeting.audio_url, 3600);

      if (!signedUrl?.signedUrl) {
        throw new Error('Could not get signed URL for audio');
      }

      // Submit to AssemblyAI
      console.log('Submitting to AssemblyAI, audio URL length:', signedUrl.signedUrl.length);
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          Authorization: ASSEMBLYAI_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: signedUrl.signedUrl,
          speaker_labels: true,
          webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/transcribe`,
          // Ask AssemblyAI to hand our own secret back when it calls us, so the
          // callback can prove it came from the job we started. Left off
          // entirely when no secret is configured — sending an empty header
          // value would just be a shape with nothing in it.
          ...(WEBHOOK_SECRET
            ? {
              webhook_auth_header_name: WEBHOOK_HEADER,
              webhook_auth_header_value: WEBHOOK_SECRET,
            }
            : {}),
        })
      });

      const transcriptData = await transcriptResponse.json();

      if (!transcriptResponse.ok) {
        console.error('AssemblyAI API error:', transcriptResponse.status, JSON.stringify(transcriptData));
        return errorResponse(`AssemblyAI error: ${transcriptData.error || transcriptResponse.statusText}`, 502);
      }

      if (!transcriptData.id) {
        console.error('AssemblyAI returned no transcript ID:', JSON.stringify(transcriptData));
        return errorResponse('AssemblyAI returned no transcript ID', 502);
      }

      console.log('AssemblyAI transcript created:', transcriptData.id);

      // Update status and store the transcript_id so we can match on webhook callback
      await supabaseAdmin
        .from('meetings')
        .update({
          processing_status: 'transcribing',
          assemblyai_transcript_id: transcriptData.id
        })
        .eq('id', meeting_id);

      return jsonResponse({ transcript_id: transcriptData.id });
    }

    return errorResponse('Invalid request', 400);

  } catch (error) {
    console.error('Transcription error:', error);
    return errorResponse('Internal server error', 500);
  }
});
