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
};

export type RecapStoredSummary = {
  sections?: RecapSummarySection[];
  details?: string[];
  line_corrections?: Record<string, string>;
  hidden_lines?: Record<string, true>;
  meeting_helper_snapshot?: RecapMeetingSnapshot;
};

export type RecapWishRow = {
  id?: string;
  user_id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  is_spotlight?: boolean | null;
  created_at?: string | null;
  user_name?: string | null;
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
  wishes: { personName: string; wish: string | null }[];
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

function currentWishFor(memberId: string, wishes: RecapWishRow[]) {
  const live = wishes
    .filter((wish) => wish.user_id === memberId && wish.status === 'public' && wish.is_active !== false)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  const wish = live.find((item) => item.is_spotlight) ?? live[0] ?? null;
  if (!wish) return null;
  const source = clean(wish.title) || clean(wish.description);
  if (!source) return null;
  return compactLine(source, 110);
}

/**
 * The one-minute member recap. It is intentionally derived from the sealed
 * record rather than saved as a second competing summary, so the app and the
 * email always speak from the same facts while the complete record remains
 * available underneath.
 */
export function buildMeetingRecapContent(
  summary: RecapStoredSummary,
  members: RecapMember[],
  wishes: RecapWishRow[],
): MeetingRecapContent {
  const snapshot = summary.meeting_helper_snapshot ?? {};
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
    wishes: orderedMembers.map((member) => ({
      personName: clean(member.name),
      wish: currentWishFor(member.id, wishes),
    })),
  };
}
