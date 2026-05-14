import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import JSZip from 'https://esm.sh/jszip@3.10.1?target=deno';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const MAX_FILE_BASE64_LENGTH = 8_000_000;

interface ImportMeetingNotesRequest {
  communityId: string;
  notesText?: string;
  title?: string;
  date?: string;
  linkedEventId?: string | null;
  fileName?: string | null;
  fileMimeType?: string | null;
  fileBase64?: string | null;
}

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

async function getImportedNotesText(body: ImportMeetingNotesRequest) {
  const pastedText = body.notesText?.trim();
  if (pastedText) {
    return {
      notesText: pastedText,
      source: 'pasted_notes',
      importedFile: null,
    };
  }

  if (!body.fileBase64 || !body.fileName) {
    throw new Error('Paste notes or upload a supported file.');
  }

  if (body.fileBase64.length > MAX_FILE_BASE64_LENGTH) {
    throw new Error('That file is too large. Try exporting a shorter notes file or paste the text.');
  }

  const extension = getFileExtension(body.fileName);
  const mimeType = body.fileMimeType ?? '';

  if (extension === 'docx') {
    return {
      notesText: await extractDocxText(body.fileBase64),
      source: 'docx_upload',
      importedFile: { fileName: body.fileName, mimeType },
    };
  }

  if (extension === 'txt' || extension === 'md' || mimeType.startsWith('text/')) {
    return {
      notesText: extractPlainText(body.fileBase64),
      source: 'text_upload',
      importedFile: { fileName: body.fileName, mimeType },
    };
  }

  if (extension === 'pdf' || mimeType === 'application/pdf') {
    return {
      notesText: `PDF uploaded: ${body.fileName}. Tap Apply Notes to have Clive read and process the attached PDF.`,
      source: 'pdf_upload',
      importedFile: {
        fileName: body.fileName,
        mimeType: 'application/pdf',
        base64: body.fileBase64,
      },
    };
  }

  throw new Error('Unsupported file type. Upload .docx, .pdf, .txt, or paste the notes.');
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
    const requestedTitle = body.title?.trim() || 'Hive Meeting';

    if (!communityId) {
      return errorResponse('Missing communityId', 400);
    }

    const imported = await getImportedNotesText(body);

    if (imported.notesText.length < 20) {
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
      summary: 'Notes imported. Apply them when you are ready for Clive to create tasks, events, and board updates.',
      decisions: [],
      details: [],
      wishes_surfaced: [],
      queen_bee_highlights: [],
      board_suggestions: [],
      board_posts_created: [],
      action_items_created: 0,
      events_created: 0,
    };

    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from('meetings')
      .insert({
        date: meetingDate,
        audio_url: null,
        transcript_raw: imported.notesText,
        transcript_attributed: imported.notesText,
        summary: JSON.stringify(summaryPayload),
        recorded_by: userId,
        processing_status: 'complete',
        community_id: communityId,
        linked_event_id: body.linkedEventId || null,
      })
      .select()
      .single();

    if (meetingError || !meeting) {
      console.error('Failed to save imported meeting notes:', meetingError);
      return errorResponse(meetingError?.message || 'Failed to save meeting notes', 500);
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
