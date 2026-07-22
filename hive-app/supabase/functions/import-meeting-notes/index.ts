import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import JSZip from 'https://esm.sh/jszip@3.10.1?target=deno';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const MAX_FILE_BASE64_LENGTH = 8_000_000;
const MAX_TOTAL_FILE_BASE64_LENGTH = 20_000_000;

interface ImportMeetingNotesFile {
  fileName: string;
  fileMimeType?: string | null;
  fileBase64: string;
}

// Voice memos are uploaded to the meeting-recordings bucket by the client
// (too large to inline as base64) — we only receive their storage paths.
interface ImportMeetingNotesAudioFile {
  fileName: string;
  storagePath: string;
}

interface ImportMeetingNotesRequest {
  communityId: string;
  notesText?: string;
  title?: string;
  date?: string;
  linkedEventId?: string | null;
  files?: ImportMeetingNotesFile[];
  audioFiles?: ImportMeetingNotesAudioFile[];
  fileName?: string | null;
  fileMimeType?: string | null;
  fileBase64?: string | null;
}

const MAX_AUDIO_FILES = 6;

function todayLocalDate() {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value?: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeXmlEntities(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function getFileExtension(fileName?: string | null) {
  return fileName?.split('.').pop()?.toLowerCase() ?? '';
}

async function extractDocxText(fileBase64: string) {
  const zip = await JSZip.loadAsync(decodeBase64(fileBase64));
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) {
    throw new Error('Could not read Word document text.');
  }

  return decodeXmlEntities(
    xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPlainText(fileBase64: string) {
  return new TextDecoder().decode(decodeBase64(fileBase64)).trim();
}

function getRequestFiles(body: ImportMeetingNotesRequest) {
  const files = [...(body.files ?? [])];
  if (body.fileBase64 && body.fileName) {
    files.push({
      fileName: body.fileName,
      fileMimeType: body.fileMimeType,
      fileBase64: body.fileBase64,
    });
  }
  return files.filter((file) => file.fileName && file.fileBase64);
}

async function getImportedNotesText(body: ImportMeetingNotesRequest, hasAudio: boolean) {
  const files = getRequestFiles(body);
  const pastedTextParts = body.notesText?.trim() ? [body.notesText.trim()] : [];
  const importedFiles = [];
  const sourceKinds = new Set<string>();

  if (pastedTextParts.length > 0) {
    sourceKinds.add('pasted_notes');
  }
  if (hasAudio) {
    sourceKinds.add('voice_memo_upload');
  }

  if (files.length === 0 && pastedTextParts.length === 0 && !hasAudio) {
    throw new Error('Paste notes, upload a supported file, or add a voice memo.');
  }

  const totalBase64Length = files.reduce((total, file) => total + file.fileBase64.length, 0);
  if (totalBase64Length > MAX_TOTAL_FILE_BASE64_LENGTH) {
    throw new Error('Those files are too large together. Try fewer photos or paste the text.');
  }

  for (const file of files) {
    if (file.fileBase64.length > MAX_FILE_BASE64_LENGTH) {
      throw new Error(`${file.fileName} is too large. Try fewer photos or paste the text.`);
    }

    const extension = getFileExtension(file.fileName);
    const mimeType = file.fileMimeType ?? '';

    if (extension === 'docx') {
      pastedTextParts.push(await extractDocxText(file.fileBase64));
      sourceKinds.add('docx_upload');
      importedFiles.push({ fileName: file.fileName, mimeType });
      continue;
    }

    if (extension === 'txt' || extension === 'md' || mimeType.startsWith('text/')) {
      pastedTextParts.push(extractPlainText(file.fileBase64));
      sourceKinds.add('text_upload');
      importedFiles.push({ fileName: file.fileName, mimeType });
      continue;
    }

    if (extension === 'pdf' || mimeType === 'application/pdf') {
      pastedTextParts.push(`PDF uploaded: ${file.fileName}.`);
      sourceKinds.add('pdf_upload');
      importedFiles.push({
        fileName: file.fileName,
        mimeType: 'application/pdf',
        base64: file.fileBase64,
      });
      continue;
    }

    if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
      const imageMimeType = mimeType.startsWith('image/')
        ? mimeType
        : extension === 'png'
        ? 'image/png'
        : extension === 'gif'
        ? 'image/gif'
        : extension === 'webp'
        ? 'image/webp'
        : 'image/jpeg';

      pastedTextParts.push(`Image uploaded: ${file.fileName}.`);
      sourceKinds.add('image_upload');
      importedFiles.push({
        fileName: file.fileName,
        mimeType: imageMimeType,
        base64: file.fileBase64,
      });
      continue;
    }

    throw new Error('Unsupported file type. Upload .docx, .pdf, .txt, images, or paste the notes.');
  }

  const source = sourceKinds.size === 1 ? [...sourceKinds][0] : 'mixed_notes';
  return {
    notesText: pastedTextParts.join('\n\n').trim(),
    source,
    importedFile: importedFiles[0] ?? null,
    importedFiles,
  };
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  const auth = await verifySupabaseJwt(req.headers.get('Authorization') ?? req.headers.get('authorization'));
  if (isAuthError(auth)) {
    return errorResponse(auth.error, auth.status);
  }

  const { userId, token } = auth;

  try {
    const body = (await req.json()) as ImportMeetingNotesRequest;
    const communityId = body.communityId;
    const meetingDate = isIsoDate(body.date) ? body.date! : todayLocalDate();
    const requestedTitle = body.title?.trim() || 'HIVE Meeting';

    if (!communityId) {
      return errorResponse('Missing communityId', 400);
    }

    const audioFiles = (body.audioFiles ?? [])
      .filter((file) => file.fileName && file.storagePath)
      .slice(0, MAX_AUDIO_FILES);
    const hasAudio = audioFiles.length > 0;

    const imported = await getImportedNotesText(body, hasAudio);

    if (!hasAudio && imported.notesText.length < 20) {
      return errorResponse('The imported notes look empty. Paste or upload the full notes.', 400);
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

    const { data: membership } = await supabaseUser
      .from('community_memberships')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      return errorResponse('Community membership required', 403);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const summaryPayload = {
      source: imported.source,
      title: requestedTitle,
      import_status: 'pending',
      imported_file: imported.importedFile,
      imported_files: imported.importedFiles,
      audio_files: audioFiles.map((file) => file.fileName),
      summary: hasAudio
        ? `Transcribing ${audioFiles.length} voice memo${audioFiles.length === 1 ? '' : 's'} — the full transcript will land here in a few minutes.`
        : 'Notes imported. Apply them when you are ready for Clive to create tasks, events, and board updates.',
      decisions: [],
      details: [],
      wishes_surfaced: [],
      board_suggestions: [],
      board_posts_created: [],
      action_items_created: 0,
      events_created: 0,
    };

    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from('meetings')
      .insert({
        date: meetingDate,
        audio_url: hasAudio ? audioFiles[0].storagePath : null,
        transcript_raw: imported.notesText,
        transcript_attributed: imported.notesText,
        summary: JSON.stringify(summaryPayload),
        recorded_by: userId,
        processing_status: hasAudio ? 'transcribing' : 'complete',
        community_id: communityId,
        linked_event_id: body.linkedEventId || null,
      })
      .select()
      .single();

    if (meetingError || !meeting) {
      console.error('Failed to save imported meeting notes:', meetingError);
      return errorResponse(meetingError?.message || 'Failed to save meeting notes', 500);
    }

    // Kick off one AssemblyAI job per voice memo; the transcribe webhook
    // stitches them into the meeting once every job lands.
    if (hasAudio) {
      const assemblyKey = Deno.env.get('ASSEMBLYAI_API_KEY') ?? '';
      let submitted = 0;

      for (const [index, audio] of audioFiles.entries()) {
        let transcriptId: string | null = null;
        let errorMessage: string | null = null;

        try {
          const { data: signed } = await supabaseAdmin.storage
            .from('meeting-recordings')
            .createSignedUrl(audio.storagePath, 7200);
          if (!signed?.signedUrl) throw new Error('Could not sign the uploaded audio file.');

          const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: { Authorization: assemblyKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio_url: signed.signedUrl,
              speaker_labels: true,
              webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/transcribe`,
            }),
          });
          const transcriptData = await transcriptResponse.json();
          if (!transcriptResponse.ok || !transcriptData.id) {
            throw new Error(transcriptData.error || `AssemblyAI rejected the file (${transcriptResponse.status}).`);
          }
          transcriptId = transcriptData.id;
          submitted += 1;
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : 'Transcription submit failed';
          console.error(`Transcription submit failed for ${audio.fileName}:`, error);
        }

        await supabaseAdmin.from('meeting_transcription_jobs').insert({
          meeting_id: meeting.id,
          community_id: communityId,
          transcript_id: transcriptId,
          file_name: audio.fileName,
          storage_path: audio.storagePath,
          position: index,
          status: transcriptId ? 'submitted' : 'failed',
          error_message: errorMessage,
        });
      }

      if (submitted === 0) {
        await supabaseAdmin
          .from('meetings')
          .update({ processing_status: imported.notesText.length >= 20 ? 'complete' : 'failed' })
          .eq('id', meeting.id);
        if (imported.notesText.length < 20) {
          return errorResponse('Could not start transcription for those voice memos. Please try again.', 502);
        }
      }
    }

    if (body.linkedEventId) {
      await supabaseAdmin
        .from('events')
        .update({ status: 'completed' })
        .eq('id', body.linkedEventId)
        .eq('community_id', communityId);
    }

    return jsonResponse({
      success: true,
      meeting,
      source: imported.source,
    });
  } catch (error) {
    console.error('Import meeting notes error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to import meeting notes', 500);
  }
});
