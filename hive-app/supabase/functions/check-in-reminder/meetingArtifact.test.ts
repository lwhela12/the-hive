import {
  addDaysToDateOnly,
  eligibleEmailRecipientCount,
  formatClock,
  getWindowOpenDate,
  type MeetingDetails,
  meetingTimeWindow,
  MEMBER_NAME_TOKEN,
  monthlyMeetingDedupPeriod,
  monthlyMeetingSubject,
  personalizeHeldArtifact,
  responsePeriodForMeeting,
  weekdayOf,
} from './meetingArtifact.ts';

function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

const meeting: MeetingDetails = {
  meetingId: 'meeting-42',
  title: 'Page <to> Screen',
  dateOnly: '2026-09-20',
  weekday: weekdayOf('2026-09-20'),
  dateLabel: 'September 20',
  eventTime: '17:00:00',
  endTime: '19:00:00',
  timeLabel: formatClock('17:00:00'),
  endTimeLabel: formatClock('19:00:00'),
  location: 'Studio & Zoom',
  note: 'Bring <ideas>',
};

Deno.test('meeting row alone drives window timing and response period across boundaries', () => {
  assertEquals(
    getWindowOpenDate(meeting.dateOnly),
    '2026-09-17',
    'September meeting window',
  );
  assertEquals(
    responsePeriodForMeeting(meeting),
    '2026-09',
    'meeting response period',
  );
  assertEquals(
    addDaysToDateOnly('2027-01-02', -3),
    '2026-12-30',
    'year boundary',
  );
  assertEquals(
    addDaysToDateOnly('2028-03-02', -3),
    '2028-02-28',
    'leap-year boundary',
  );
});

Deno.test('meeting identity and date make window/day-of dedup keys reschedule-safe', () => {
  assertEquals(
    monthlyMeetingDedupPeriod('window', meeting, '2026-09-17'),
    '2026-09:window:meeting-42:2026-09-20',
    'scheduled window period',
  );
  assertEquals(
    monthlyMeetingDedupPeriod(
      'day_of',
      { ...meeting, dateOnly: '2026-09-21' },
      '2026-09-21',
    ),
    '2026-09:day_of:meeting-42:2026-09-21',
    'moved meeting period',
  );
  assertEquals(
    monthlyMeetingDedupPeriod('window', meeting, '2026-09-18', 'resend'),
    '2026-09:window:meeting-42:2026-09-20:resend-2026-09-18',
    'resend period',
  );
});

Deno.test('monthly subject and timing are built from the meeting artifact', () => {
  assertEquals(meeting.weekday, 'Sunday', 'weekday');
  assertEquals(meetingTimeWindow(meeting), '5:00 – 7:00 PM', 'time window');
  assertEquals(
    monthlyMeetingSubject('window', 'Production HIVE', meeting),
    '🐝 Pro HIVE · Your check-in is open — Page <to> Screen on Sept 20',
    'window subject',
  );
  assertEquals(
    monthlyMeetingSubject('day_of', 'OG HIVE', meeting),
    "🐝 OG HIVE · Page <to> Screen tonight (Sept 20) — quick check-in if you haven't",
    'day-of subject',
  );
});

Deno.test('held HTML is immutable except for escaped recipient-name substitution', () => {
  const template =
    `<p>Hi ${MEMBER_NAME_TOKEN},</p><p>Approved ${MEMBER_NAME_TOKEN} meeting snapshot</p>`;
  const delivered = personalizeHeldArtifact(template, '&lt;Nat&gt;');
  assertEquals(
    delivered,
    `<p>Hi &lt;Nat&gt;,</p><p>Approved ${MEMBER_NAME_TOKEN} meeting snapshot</p>`,
    'personalized artifact',
  );
});

Deno.test('preview audience counts only valid opted-in email recipients', () => {
  assertEquals(
    eligibleEmailRecipientCount('window', [
      { email: 'yes@example.com' },
      { email: '   ' },
      { email: 'master-off@example.com', email_reminders_enabled: false },
      {
        email: 'meeting-off@example.com',
        email_meeting_checkin_enabled: false,
      },
      {
        email: 'midpoint-off@example.com',
        email_midpoint_checkin_enabled: false,
      },
    ]),
    2,
    'window email recipients',
  );
  assertEquals(
    eligibleEmailRecipientCount('midpoint', [
      { email: 'yes@example.com' },
      {
        email: 'meeting-off@example.com',
        email_meeting_checkin_enabled: false,
      },
      {
        email: 'midpoint-off@example.com',
        email_midpoint_checkin_enabled: false,
      },
    ]),
    2,
    'midpoint email recipients',
  );
});
