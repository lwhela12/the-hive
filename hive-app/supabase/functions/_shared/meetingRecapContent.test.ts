import { buildMeetingRecapContent } from './meetingRecapContent.ts';

Deno.test('stored one-minute recap is the source of truth for meeting-specific help', () => {
  const recap = buildMeetingRecapContent({
    one_minute_recap: {
      news: ['A high-level update'],
      dates: [{ label: 'Craft night', date: '2026-10-09' }],
      help_focus: 'Collect plastic containers.',
      member_focuses: [
        { person_name: 'Nic Munson', focus: 'Help Uncle Ernie move.', status: 'confirmed' },
        { person_name: 'Oliver Parkinson', focus: null, status: 'absent' },
      ],
    },
  }, [
    { id: 'nic', name: 'Nic Munson' },
    { id: 'oliver', name: 'Oliver Parkinson' },
  ]);

  if (recap.wishes[0]?.wish !== 'Help Uncle Ernie move.' || recap.wishes[0]?.status !== 'confirmed') {
    throw new Error('meeting-confirmed focus was not preserved');
  }
  if (recap.wishes[1]?.wish !== null || recap.wishes[1]?.status !== 'absent') {
    throw new Error('absence was not represented honestly');
  }
});

Deno.test('legacy recap does not substitute a live profile wish for an unknown meeting focus', () => {
  const recap = buildMeetingRecapContent({
    meeting_helper_snapshot: {
      confirmed_absentee_ids: ['away'],
      confirmed_absentee_names: ['Away Member'],
    },
  }, [
    { id: 'here', name: 'Here Member' },
    { id: 'away', name: 'Away Member' },
  ]);

  const here = recap.wishes.find((item) => item.personName === 'Here Member');
  const away = recap.wishes.find((item) => item.personName === 'Away Member');
  if (here?.wish !== null || here?.status !== 'unclear') throw new Error('unknown focus was guessed');
  if (away?.wish !== null || away?.status !== 'absent') throw new Error('known absence was lost');
});
