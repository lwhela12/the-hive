import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const ASSEMBLYAI_API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY')!;

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // This function uses service_role - no user auth needed (webhook endpoint)
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Check if this is a webhook callback from AssemblyAI
    const body = await req.json();

    if (body.status === 'completed') {
      // This is the webhook callback with completed transcript
      const { transcript_id } = body;

      // Get the full transcript with speaker labels
      const transcriptResponse = await fetch(
        `https://api.assemblyai.com/v2/transcript/${transcript_id}`,
        {
          headers: { Authorization: ASSEMBLYAI_API_KEY }
        }
      );

      const transcript = await transcriptResponse.json();

      // Find the meeting with this transcript ID
      const { data: meeting, error: findError } = await supabaseAdmin
        .from('meetings')
        .select('*')
        .eq('assemblyai_transcript_id', transcript_id)
        .single();

      if (findError || !meeting) {
        console.error('Meeting not found for transcript_id:', transcript_id);
        return errorResponse('Meeting not found', 404);
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: `You are summarizing a Hive community meeting. The Hive is a group of 12 people who practice "high-definition wishing" - helping each other articulate specific needs and matching them with skills.

Available members: ${members?.map(m => m.name).join(', ')}

Analyze the transcript and provide:
1. A concise summary (2-3 paragraphs)
2. Action items extracted with assigned person if mentioned
3. Any wishes that surfaced during the meeting
4. Queen Bee highlights - specific progress updates, accomplishments, or blockers mentioned about the current Queen Bee's project. Each highlight should be a concise bullet point (1-2 sentences max).

Format your response as JSON:
{
  "summary": "string",
  "action_items": [{"description": "string", "assigned_to_name": "string or null", "due_date": "YYYY-MM-DD or null"}],
  "wishes_surfaced": [{"person_name": "string", "description": "string"}],
  "queen_bee_highlights": ["string"]
}`,
        messages: [
          {
            role: 'user',
            content: `Please analyze this meeting transcript:\n\n${formattedTranscript}`
          }
        ]
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
        analysis = { summary: textBlock?.text, action_items: [], wishes_surfaced: [], queen_bee_highlights: [] };
      }

      // Store the full analysis as JSON so frontend can display all parts
      const summaryData = {
        summary: analysis.summary,
        wishes_surfaced: analysis.wishes_surfaced || [],
        queen_bee_highlights: analysis.queen_bee_highlights || []
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

      // Persist Queen Bee highlights
      if (analysis.queen_bee_highlights?.length > 0) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const { data: currentQueenBee } = await supabaseAdmin
          .from('queen_bees')
          .select('id')
          .eq('community_id', meeting.community_id)
          .eq('month', currentMonth)
          .single();

        if (currentQueenBee) {
          // Delete existing highlights from this meeting (allows reprocessing)
          await supabaseAdmin
            .from('monthly_highlights')
            .delete()
            .eq('meeting_id', meeting.id);

          const highlightsToInsert = analysis.queen_bee_highlights.map(
            (highlight: string, index: number) => ({
              queen_bee_id: currentQueenBee.id,
              meeting_id: meeting.id,
              community_id: meeting.community_id,
              highlight,
              display_order: index
            })
          );

          await supabaseAdmin.from('monthly_highlights').insert(highlightsToInsert);
        }
      }

      return jsonResponse({ success: true });

    } else if (body.meeting_id) {
      // This is a request to start transcription
      const { meeting_id } = body;

      // Get meeting
      const { data: meeting, error } = await supabaseAdmin
        .from('meetings')
        .select('*')
        .eq('id', meeting_id)
        .single();

      if (error || !meeting) {
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
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          Authorization: ASSEMBLYAI_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: signedUrl.signedUrl,
          speaker_labels: true,
          webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/transcribe`
        })
      });

      const transcriptData = await transcriptResponse.json();

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
