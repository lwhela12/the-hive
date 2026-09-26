export type RecapSummaryGroup = {
  title?: string;
  lines?: string[];
  meta?: string;
};

export type RecapSummarySection = {
  title?: string;
  intro?: string;
  lines?: string[];
  groups?: RecapSummaryGroup[];
};

export type RecapMeetingSnapshot = {
  next_meeting?: Record<string, unknown> | null;
  upcoming_hangs?: Record<string, unknown>[];
  help_focus?: string | null;
  confirmed_absentee_ids?: string[];
  confirmed_absentee_names?: string[];
};

export type RecapFocusStatus = 'confirmed' | 'absent' | 'unclear';

export type RecapStoredFocus = {
  person_name: string;
  focus?: string | null;
  status: RecapFocusStatus;
};

export type RecapStoredOneMinute = {
  news?: string[];
  dates?: RecapDateItem[];
  help_focus?: string | null;
  member_focuses?: RecapStoredFocus[];
  generated_at?: string;
};

export type RecapStoredSummary = {
  sections?: RecapSummarySection[];
  details?: string[];
  line_corrections?: Record<string, string>;
  hidden_lines?: Record<string, true>;
  meeting_helper_snapshot?: RecapMeetingSnapshot;
  one_minute_recap?: RecapStoredOneMinute;
};

export type RecapMember = {
  id: string;
  name?: string | null;
};

export type RecapDateItem = {
  label: string;
  date: string;
  time?: string | null;
  endTime?: string | null;
  location?: string | null;
};

export type MeetingRecapContent = {
  news: string[];
  dates: RecapDateItem[];
  helpFocus: string | null;
  wishes: { personName: string; wish: string | null; status: RecapFocusStatus }[];
};

const clean = (value?: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

function compactLine(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const slice = value.slice(0, maxLength - 1).trim();
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > Math.floor(maxLength * 0.6) ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

function correctedLine(
  summary: RecapStoredSummary,
  sectionTitle: string,
  groupIndex: number | null,
  lineIndex: number,
  original: string,
) {
  const key = groupIndex === null
    ? `${sectionTitle}::s${lineIndex}`
    : `${sectionTitle}::g${groupIndex}::${lineIndex}`;
  if (summary.hidden_lines?.[key]) return '';
  return clean(summary.line_corrections?.[key] ?? original);
}

function linesFromSection(summary: RecapStoredSummary, wantedTitle: string): string[] {
  const section = (summary.sections ?? []).find((item) => item.title === wantedTitle);
  if (!section) return [];
  const groupLines = (section.groups ?? []).flatMap((group, groupIndex) =>
    (group.lines ?? []).map((line, lineIndex) => correctedLine(summary, wantedTitle, groupIndex, lineIndex, line))
  );
  const sectionLines = (section.lines ?? [])
    .map((line, lineIndex) => correctedLine(summary, wantedTitle, null, lineIndex, line));
  return [...groupLines, ...sectionLines].filter(Boolean);
}

function stringField(row: Record<string, unknown> | null | undefined, key: string) {
  return clean(row?.[key]);
}

/**
 * The one-minute member recap. It is intentionally derived from the sealed
 * meeting record, never from a member's live profile wish. A profile wish can
 * be useful elsewhere in HIVE, but it cannot answer what somebody actually
 * asked for during this particular meeting. The app and the email therefore
 * read the same stored one-minute recap, while the complete source record
 * remains available underneath.
 */
export function buildMeetingRecapContent(
  summary: RecapStoredSummary,
  members: RecapMember[],
): MeetingRecapContent {
  const snapshot = summary.meeting_helper_snapshot ?? {};
  const stored = summary.one_minute_recap;

  if (stored) {
    return {
      news: (stored.news ?? []).map(clean).filter(Boolean),
      dates: (stored.dates ?? []).flatMap((item) => {
        const label = clean(item.label);
        const date = clean(item.date);
        return label && date ? [{
          label,
          date,
          time: clean(item.time) || null,
          endTime: clean(item.endTime) || null,
          location: clean(item.location) || null,
        }] : [];
      }),
      helpFocus: clean(stored.help_focus) || null,
      wishes: (stored.member_focuses ?? []).flatMap((item) => {
        const personName = clean(item.person_name);
        if (!personName) return [];
        return [{
          personName,
          wish: clean(item.focus) || null,
          status: item.status === 'confirmed' || item.status === 'absent' ? item.status : 'unclear',
        }];
      }),
    };
  }

  const nextMeeting = snapshot.next_meeting ?? null;
  const dates: RecapDateItem[] = [];

  const nextDate = stringField(nextMeeting, 'event_date');
  if (nextDate) {
    dates.push({
      label: stringField(nextMeeting, 'title') || 'Next HIVE meeting',
      date: nextDate,
      time: stringField(nextMeeting, 'event_time') || null,
      endTime: stringField(nextMeeting, 'end_time') || null,
      location: stringField(nextMeeting, 'location') || null,
    });
  }

  for (const hang of snapshot.upcoming_hangs ?? []) {
    const date = stringField(hang, 'event_date');
    if (!date) continue;
    dates.push({
      label: stringField(hang, 'title') || 'HIVE hang',
      date,
      time: stringField(hang, 'event_time') || null,
      endTime: stringField(hang, 'end_time') || null,
      location: stringField(hang, 'location') || null,
    });
  }

  const planLines = linesFromSection(summary, 'Plan the Meet Ups');
  const wrapLines = linesFromSection(summary, 'Wrap-Up');
  const detailLines = summary.details ?? [];
  const helpLine = [...planLines, ...wrapLines, ...detailLines]
    .map(clean)
    .find((line) => /\bHIVE Help\b/i.test(line));
  const helpFocus = clean(snapshot.help_focus)
    || (helpLine ? clean(helpLine.replace(/^.*?HIVE Help(?:\s+focus)?\s*:\s*/i, '')) : '')
    || null;

  const orderedMembers = [...members]
    .filter((member) => !!member.id && !!clean(member.name))
    .sort((a, b) => clean(a.name).localeCompare(clean(b.name)));
  const absentIds = new Set(snapshot.confirmed_absentee_ids ?? []);
  const absentNames = new Set((snapshot.confirmed_absentee_names ?? []).map(clean));

  return {
    // HIVE Help and hangs have their own short sections below. Keeping them out
    // of News avoids saying the same thing twice and leaves room for Nat's
    // actual announcements.
    news: linesFromSection(summary, 'News from Nat')
      .filter((line) => !/\bHIVE Help\b|\bHIVE hang\b/i.test(line))
      .map((line) => compactLine(line, 180))
      .slice(0, 5),
    dates,
    helpFocus,
    // Older records did not store a meeting-specific focus. Say so plainly;
    // silently substituting a profile wish made old requests look current.
    wishes: orderedMembers.map((member) => {
      const personName = clean(member.name);
      const absent = absentIds.has(member.id) || absentNames.has(personName);
      return {
        personName,
        wish: null,
        status: absent ? 'absent' as const : 'unclear' as const,
      };
    }),
  };
}
