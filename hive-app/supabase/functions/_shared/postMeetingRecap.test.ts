import {
  buildPostMeetingRecapLinks,
  eligibleRecapRecipients,
  postMeetingRecapHtml,
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
  if (!prefill.includes(meeting.title) || !prefill.includes(meeting.id) || !prefill.includes('decisions')) {
    throw new Error(`Clive prompt lacks useful meeting context: ${prefill}`);
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
