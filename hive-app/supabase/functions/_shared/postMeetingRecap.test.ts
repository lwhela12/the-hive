import {
  buildPostMeetingRecapLinks,
  eligibleRecapRecipients,
  postMeetingRecapHtml,
  recipientsForApprovedPreview,
  type RecapMeeting,
} from './postMeetingRecap.ts';

const meeting: RecapMeeting = {
  id: 'meeting/42',
  communityId: 'hive & one',
  hiveName: 'OG <HIVE>',
  title: 'August & Friends',
  date: '2026-08-18',
};

Deno.test('buildPostMeetingRecapLinks deep-links the exact summary and contextual Clive prompt', () => {
  const links = buildPostMeetingRecapLinks('https://app.example/', meeting);
  if (links.summaryUrl !== 'https://app.example/meetings?hive=hive%20%26%20one&meeting=meeting%2F42') {
    throw new Error(`unexpected summary URL: ${links.summaryUrl}`);
  }
  const parsed = new URL(links.cliveUrl);
  if (parsed.pathname !== '/' || parsed.searchParams.get('hive') !== meeting.communityId) {
    throw new Error(`Clive URL did not preserve HIVE context: ${links.cliveUrl}`);
  }
  const prefill = parsed.searchParams.get('prefill') || '';
  if (!prefill.startsWith('Hey Clive') || !prefill.includes(meeting.title) || !prefill.includes('decisions')) {
    throw new Error(`Clive prompt lacks useful meeting context: ${prefill}`);
  }
  if (prefill.includes(meeting.id) || prefill.includes('2026-08-18')) {
    throw new Error(`Clive prompt exposed technical routing details: ${prefill}`);
  }
});

Deno.test('postMeetingRecapHtml has exactly the two required buttons and escapes member content', () => {
  const html = postMeetingRecapHtml('<Nat>', meeting, 'https://app.example');
  const anchors = html.match(/<a\s/gi) ?? [];
  if (anchors.length !== 2) throw new Error(`expected exactly two buttons, got ${anchors.length}`);
  for (const label of ['Open Meeting Summaries', 'Ask Clive what I missed']) {
    if (!html.includes(`>${label}</a>`)) throw new Error(`missing button: ${label}`);
  }
  if (html.includes('<Nat>') || html.includes('OG <HIVE>')) throw new Error('unescaped HTML reached the email');
});

Deno.test('Tech recap buttons use the Tech HIVE brand pair', () => {
  const html = postMeetingRecapHtml('Kelly', {
    ...meeting,
    hiveName: 'Tech HIVE',
    hiveSlug: 'tech',
    hiveAccent: '#011f46',
  }, 'https://app.example');
  if (!html.includes('background:#011f46')) {
    throw new Error('primary recap button is not Circuit Navy');
  }
  if (!html.includes('background:#2f82c2')) {
    throw new Error('secondary recap button is not Signal Blue');
  }
});

Deno.test('eligibleRecapRecipients requires explicit absence, email, and both enabled settings', () => {
  const recipients = eligibleRecapRecipients(['absent-on', 'absent-opted-out', 'absent-master-off'], [
    { id: 'absent-on', name: 'A', email: 'a@example.com' },
    { id: 'present', name: 'P', email: 'p@example.com' },
    { id: 'absent-opted-out', name: 'B', email: 'b@example.com', emailPostMeetingRecapEnabled: false },
    { id: 'absent-master-off', name: 'C', email: 'c@example.com', emailRemindersEnabled: false },
  ]);
  if (recipients.map((recipient) => recipient.id).join(',') !== 'absent-on') {
    throw new Error(`unexpected recipients: ${recipients.map((recipient) => recipient.id).join(',')}`);
  }
});

Deno.test('approval sends only the previewed list, minus opt-outs and copies already sent', () => {
  const result = recipientsForApprovedPreview(['previewed', 'sent', 'opted-out'], ['sent'], [
    { id: 'previewed', name: 'Previewed', email: 'previewed@example.com' },
    { id: 'sent', name: 'Already sent', email: 'sent@example.com' },
    { id: 'opted-out', name: 'Opted out', email: 'out@example.com', emailPostMeetingRecapEnabled: false },
    { id: 'late-opt-in', name: 'Not in preview', email: 'late@example.com' },
  ]);
  if (result.recipients.map((recipient) => recipient.id).join(',') !== 'previewed') {
    throw new Error(`approval escaped its previewed list: ${result.recipients.map((recipient) => recipient.id).join(',')}`);
  }
  if (result.becameIneligibleCount !== 1) {
    throw new Error(`expected one previewed opt-out, got ${result.becameIneligibleCount}`);
  }
});
