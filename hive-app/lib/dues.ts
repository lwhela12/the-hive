import { HONEY_POT_CASH_APP_HANDLE } from './honeyPotPayment';

export const QUARTERLY_DUES_AMOUNT = 25;
export const ANNUAL_DUES_AMOUNT = QUARTERLY_DUES_AMOUNT * 4;

export type DuesCoverage = 'none' | 'quarter' | 'year';

export type DuesPeriod = {
  year: number;
  quarter: number;
};

export type DuesTransactionCoverage = {
  dues_year?: number | null;
  dues_quarter?: number | null;
  dues_covered_quarters?: number | null;
};

export type DuesTransactionRecognitionRow = DuesTransactionCoverage & {
  related_user_id?: string | null;
  transaction_type?: string | null;
  amount?: number | string | null;
  note?: string | null;
  external_counterparty_name?: string | null;
  created_at?: string | null;
};

export type DuesMemberIdentity = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export const getCurrentDuesPeriod = (date = new Date()): DuesPeriod => ({
  year: date.getFullYear(),
  quarter: Math.floor(date.getMonth() / 3) + 1,
});

export const getDuesPeriodStartDate = (period: DuesPeriod): Date =>
  new Date(period.year, (period.quarter - 1) * 3, 1);

/**
 * The last local calendar day of a dues quarter.
 *
 * OG settles its quarter at the END of the quarter. The old Home reminder used
 * the first day, which could say Q3 was due on July 1 while the thing Nat
 * actually needed to remember was September 30.
 */
export const getDuesPeriodEndDate = (period: DuesPeriod): Date =>
  new Date(period.year, period.quarter * 3, 0);

const formatLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const QUARTERLY_DUES_REMINDER_ID_PREFIX = 'quarterly-dues-reminder-';

export type QuarterlyDuesReminderEvent = {
  id: string;
  community_id: string;
  title: string;
  description: string;
  event_date: string;
  end_date: null;
  event_time: null;
  event_type: 'custom';
  created_at: string;
  visibility: 'members';
  invited_scope: 'members';
};

/**
 * One calendar-shaped reminder, generated from the date instead of stored as
 * a second source of truth. It appears in HIVE's calendars and can be added to
 * Apple or Google Calendar, while the Honey Pot ledger remains the authority
 * on whether a member has paid.
 */
export const getQuarterlyDuesReminderEvent = (
  communityId: string,
  date = new Date()
): QuarterlyDuesReminderEvent => {
  const period = getCurrentDuesPeriod(date);
  const endDate = getDuesPeriodEndDate(period);

  return {
    id: `${QUARTERLY_DUES_REMINDER_ID_PREFIX}${period.year}-q${period.quarter}`,
    community_id: communityId,
    title: `OG HIVE Q${period.quarter} dues due`,
    description: `Quarterly dues are $${QUARTERLY_DUES_AMOUNT}. Pay ${HONEY_POT_CASH_APP_HANDLE} by the end of Q${period.quarter}.`,
    event_date: formatLocalDateKey(endDate),
    end_date: null,
    event_time: null,
    event_type: 'custom',
    created_at: endDate.toISOString(),
    visibility: 'members',
    invited_scope: 'members',
  };
};

export const isQuarterlyDuesReminderEvent = (event: { id?: string | null }) =>
  (event.id ?? '').startsWith(QUARTERLY_DUES_REMINDER_ID_PREFIX);

export const getDuesAmountForCoverage = (coverage: DuesCoverage) => {
  if (coverage === 'quarter') return QUARTERLY_DUES_AMOUNT;
  if (coverage === 'year') return ANNUAL_DUES_AMOUNT;
  return null;
};

export const duesTransactionCoversQuarter = (
  row: DuesTransactionCoverage,
  period = getCurrentDuesPeriod()
) => {
  if (row.dues_year !== period.year) return false;
  if ((row.dues_covered_quarters ?? 0) >= 4) return true;
  if (!row.dues_quarter) return false;

  const coveredQuarters = row.dues_covered_quarters ?? 1;
  return period.quarter >= row.dues_quarter
    && period.quarter < row.dues_quarter + coveredQuarters;
};

const QUARTER_MONTHS = [
  ['jan', 'january', 'feb', 'february', 'mar', 'march'],
  ['apr', 'april', 'may', 'jun', 'june'],
  ['jul', 'july', 'aug', 'august', 'sep', 'sept', 'september'],
  ['oct', 'october', 'nov', 'november', 'dec', 'december'],
] as const;

const normalizeLedgerText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const phrasePattern = (phrase: string) =>
  new RegExp(`(^|\\s)${normalizeLedgerText(phrase).split(' ').join('\\s+')}($|\\s)`);

const containsPhrase = (text: string, phrase: string) => {
  const normalizedPhrase = normalizeLedgerText(phrase);
  if (!normalizedPhrase) return false;
  return phrasePattern(normalizedPhrase).test(text);
};

const hasDuesLanguage = (text: string) =>
  /\b(dues?|membership)\b/.test(text);

const hasPaymentLanguage = (text: string) =>
  /\b(paid|payment|pays?)\b/.test(text);

const hasGroupPaymentLanguage = (text: string) => [
  'everyone',
  'everybody',
  'all members',
  'all member',
  'all dues',
  'whole group',
  'the group',
  'hive dues',
  'community dues',
].some((phrase) => containsPhrase(text, phrase));

const getMemberAliases = (member: DuesMemberIdentity) => {
  const aliases = new Set<string>();
  const normalizedName = normalizeLedgerText(member.name ?? '');
  const normalizedEmail = normalizeLedgerText(member.email ?? '');

  if (normalizedName) {
    aliases.add(normalizedName);
    normalizedName
      .split(' ')
      .filter((part) => part.length >= 3)
      .forEach((part) => aliases.add(part));
  }

  if (normalizedName.startsWith('natalie') || normalizedName.startsWith('nathan')) {
    aliases.add('nat');
  }

  const emailLocal = member.email?.split('@')[0];
  const normalizedLocal = normalizeLedgerText(emailLocal ?? '');
  if (normalizedLocal) {
    aliases.add(normalizedLocal);
    normalizedLocal
      .split(' ')
      .filter((part) => part.length >= 3)
      .forEach((part) => aliases.add(part));
  }

  if (normalizedEmail) aliases.add(normalizedEmail);

  return Array.from(aliases).filter((alias) => alias.length >= 3);
};

const textMentionsMember = (text: string, member: DuesMemberIdentity) =>
  getMemberAliases(member).some((alias) => containsPhrase(text, alias));

const getPeriodEndDate = (period: DuesPeriod) =>
  new Date(period.year, period.quarter * 3, 1);

const createdDuringPeriod = (row: DuesTransactionRecognitionRow, period: DuesPeriod) => {
  if (!row.created_at) return false;
  const createdAt = new Date(row.created_at);
  if (Number.isNaN(createdAt.getTime())) return false;
  return createdAt >= getDuesPeriodStartDate(period)
    && createdAt < getPeriodEndDate(period);
};

const createdDuringYear = (row: DuesTransactionRecognitionRow, period: DuesPeriod) => {
  if (!row.created_at) return false;
  const createdAt = new Date(row.created_at);
  return !Number.isNaN(createdAt.getTime()) && createdAt.getFullYear() === period.year;
};

const mentionedQuarter = (text: string) => {
  const match = text.match(/\b(?:q|qtr|quarter)\s*([1-4])\b|\b([1-4])(?:st|nd|rd|th)\s+quarter\b/);
  if (!match) return null;
  return Number(match[1] ?? match[2]);
};

const mentionedMonthQuarter = (text: string) => {
  for (let index = 0; index < QUARTER_MONTHS.length; index += 1) {
    if (QUARTER_MONTHS[index].some((month) => containsPhrase(text, month))) {
      return index + 1;
    }
  }
  return null;
};

const textCoversDuesPeriod = (
  row: DuesTransactionRecognitionRow,
  period: DuesPeriod,
  text: string,
  { requireExplicitPeriod = false } = {}
) => {
  const mentionsYear = containsPhrase(text, String(period.year));
  const annualLanguage = /\b(annual|yearly|full year|whole year|all year)\b/.test(text)
    || /\bq1\s+(?:to|through|thru)?\s*q4\b/.test(text);
  if (annualLanguage) return mentionsYear || createdDuringYear(row, period);

  const quarter = mentionedQuarter(text);
  if (quarter) return quarter === period.quarter && (mentionsYear || createdDuringYear(row, period));

  const monthQuarter = mentionedMonthQuarter(text);
  if (monthQuarter) return monthQuarter === period.quarter && (mentionsYear || createdDuringYear(row, period));

  if (mentionsYear) return true;
  return !requireExplicitPeriod && createdDuringPeriod(row, period);
};

const unstructuredDuesTransactionCoversMember = (
  row: DuesTransactionRecognitionRow,
  member: DuesMemberIdentity,
  period: DuesPeriod
) => {
  const amount = Number(row.amount ?? 0);
  if (!Number.isFinite(amount) || amount < QUARTERLY_DUES_AMOUNT) return false;

  const text = normalizeLedgerText([
    row.note,
    row.external_counterparty_name,
  ].filter(Boolean).join(' '));

  // Notes like "Lucas. Paid for 2026" never say "dues" — accept payment
  // language too, but only with an explicit period mention (a quarter, month,
  // or year in the text) so unrelated deposits can't cover the current quarter.
  const duesLanguage = hasDuesLanguage(text);
  const paymentLanguage = hasPaymentLanguage(text) && amount % QUARTERLY_DUES_AMOUNT === 0;
  if (!duesLanguage && !paymentLanguage) return false;
  if (!textCoversDuesPeriod(row, period, text, { requireExplicitPeriod: !duesLanguage })) return false;
  return textMentionsMember(text, member) || hasGroupPaymentLanguage(text);
};

export const duesTransactionsCoverMember = (
  rows: DuesTransactionRecognitionRow[],
  member: DuesMemberIdentity,
  period = getCurrentDuesPeriod()
) => rows.some((row) => {
  if (row.transaction_type && row.transaction_type !== 'deposit') return false;

  if (row.related_user_id === member.id && duesTransactionCoversQuarter(row, period)) {
    return true;
  }

  const hasStructuredDuesMetadata = !!row.dues_year || !!row.dues_quarter || !!row.dues_covered_quarters;
  if (hasStructuredDuesMetadata && row.related_user_id && row.related_user_id !== member.id) {
    return false;
  }

  return unstructuredDuesTransactionCoversMember(row, member, period);
});
