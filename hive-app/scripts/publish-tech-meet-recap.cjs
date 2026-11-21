// Called by meeting ingestion after it has reconciled a dated Drive packet.
// Usage: node scripts/publish-tech-meet-recap.cjs DATE PACKET_ID --write
// Omitting --write validates the meeting, source, and audience without publishing.
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');

const [date, packetId, option, ...extra] = process.argv.slice(2);
const isDriveId = (value) => /^[A-Za-z0-9_-]{10,200}$/.test(value ?? '');

async function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !isDriveId(packetId) ||
      (option && option !== '--write') || extra.length) {
    throw new Error('Expected DATE PACKET_ID [--write].');
  }
  process.loadEnvFile(process.env.HIVE_RECAP_ENV_FILE || '.env');
  const currentYear = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric',
  }).format(new Date());
  const libraries = JSON.parse(process.env.HIVE_TECH_MEETING_LIBRARIES || '{}');
  const libraryId = libraries[currentYear];
  if (!date.startsWith(`${currentYear}-`) || !isDriveId(libraryId)) {
    throw new Error('No verified Tech HIVE library is configured for this active vintage.');
  }

  const google = JSON.parse(fs.readFileSync(process.env.HIVE_RECAP_GOOGLE_TOKEN_FILE, 'utf8'));
  const googleToken = await json('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: google.client_id, client_secret: google.client_secret,
      refresh_token: google.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const headers = { Authorization: `Bearer ${googleToken.access_token}` };
  const drive = (path) => json(`https://www.googleapis.com/drive/v3/${path}`, { headers });
  const account = await drive('about?fields=user(emailAddress)');
  if (!process.env.HIVE_RECAP_GOOGLE_ACCOUNT ||
      account.user.emailAddress !== process.env.HIVE_RECAP_GOOGLE_ACCOUNT) {
    throw new Error('Google account does not match the configured meeting ingestion account.');
  }

  const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const community = await query(db.from('communities').select('id').eq('slug', 'tech').single());
  const meeting = await query(db.from('meetings').select('id').eq('community_id', community.id)
    .eq('date', date).is('archived_at', null).single());
  const memberships = await query(db.from('community_memberships')
    .select('profile:profiles!user_id(email)').eq('community_id', community.id));
  const roster = memberships.map(({ profile }) => profile?.email?.trim().toLowerCase());
  if (!roster.length || roster.some((email) => !email) || new Set(roster).size !== roster.length) {
    throw new Error('Tech HIVE roster has missing or duplicate member addresses.');
  }

  const packet = await drive(`files/${packetId}?fields=name,parents,mimeType,trashed`);
  if (packet.trashed || packet.mimeType !== 'application/vnd.google-apps.folder' ||
      !packet.parents?.includes(libraryId) || !packet.name.startsWith(`${date} — Tech HIVE`)) {
    throw new Error('Packet does not match the dated meeting in the configured vintage library.');
  }
  const list = await drive(`files?${new URLSearchParams({
    q: `'${packetId}' in parents and trashed=false`,
    fields: 'nextPageToken,files(id,name,mimeType,shortcutDetails(targetId,targetMimeType))', pageSize: '100',
  })}`);
  if (list.nextPageToken) throw new Error('Packet has more files than can be verified in one pass.');
  const originalIds = [...new Set(list.files.map((file) => file.shortcutDetails?.targetId ?? file.id))];
  const gemini = list.files.filter((file) => /notes by gemini/i.test(file.name) &&
    (file.shortcutDetails?.targetMimeType ?? file.mimeType) === 'application/vnd.google-apps.document');
  if (gemini.length !== 1) throw new Error('Waiting for one unambiguous Gemini notes document.');
  const sourceId = gemini[0].shortcutDetails?.targetId ?? gemini[0].id;
  for (const id of [packetId, ...originalIds]) {
    const readable = await drive(`files/${id}/permissions?fields=permissions(type,emailAddress,deleted),nextPageToken&pageSize=100`);
    const granted = new Set(readable.permissions.filter((grant) => grant.type === 'user' && !grant.deleted)
      .map((grant) => grant.emailAddress?.toLowerCase()));
    if (readable.nextPageToken || roster.some((email) => !granted.has(email))) {
      throw new Error('Waiting for verified vintage access to every packet asset.');
    }
  }

  const doc = await json(`https://docs.googleapis.com/v1/documents/${sourceId}?includeTabsContent=true`, { headers });
  if (!doc.title.toLowerCase().includes('tech hive') || !doc.title.includes(date.replaceAll('-', '/'))) {
    throw new Error('Gemini notes do not name the same Tech HIVE occurrence.');
  }
  const quick = doc.tabs?.find((tab) => tab.tabProperties.title === 'Quick notes');
  const recap = extractQuickNotes(quick?.documentTab?.body?.content ?? []);
  if (option === '--write') {
    await query(db.from('tech_meet_publications').upsert({
      meeting_id: meeting.id, packet_folder_id: packetId, source_document_id: sourceId, recap,
    }, { onConflict: 'meeting_id', ignoreDuplicates: true }));
    const saved = await query(db.from('tech_meet_publications').select('packet_folder_id,source_document_id')
      .eq('meeting_id', meeting.id).single());
    if (saved.packet_folder_id !== packetId || saved.source_document_id !== sourceId) {
      throw new Error('This meeting already has a different publication. Its existing recap was preserved.');
    }
  }
  console.log(JSON.stringify({ date, meetingId: meeting.id, packetId, roster: roster.length,
    assetsVerified: originalIds.length, recapCharacters: recap.length, published: option === '--write' }));
}

function extractQuickNotes(content) {
  const paragraphs = content.map(({ paragraph }) => ({
    style: paragraph?.paragraphStyle?.namedStyleType,
    bullet: Boolean(paragraph?.bullet),
    text: paragraph?.elements?.map((entry) => entry.textRun?.content ?? '').join('').trim(),
  })).filter(({ text }) => text && !/^please rate the new quick notes tab|^tech\s*hive\s*[—–-]/i.test(text));
  const recap = paragraphs.slice(0, 14).map(({ text, bullet }) => `${bullet ? '• ' : ''}${text}`).join('\n');
  if (recap.length < 20 || recap.length > 4000) throw new Error('Gemini Quick notes are missing or outside the recap size limit.');
  return recap;
}

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}.`);
  return response.json();
}

async function query(request) {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
