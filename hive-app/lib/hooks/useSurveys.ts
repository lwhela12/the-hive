import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { queryClient } from '../queryClient';

export interface SurveyQuestion {
  id: string;
  text: string;
  // 'hangs' auto-populates the month's hang events as went/didn't-go chips
  // plus a thoughts box; the answer is stored as plain text.
  // 'focus' does the same for the month's HIVE Help focus: did it + a 1-5
  // score, so the deck can average it instead of only quoting paragraphs.
  // 'note' asks nothing — it explains the questions around it, and stores no
  // answer. Nat, 2026-09-01, looking at four blank boxes in a row: *"I want it
  // more obvious, like, explaining how the HIVE's work."*
  type: 'short' | 'long' | 'scale' | 'choice' | 'hangs' | 'focus' | 'note';
  options?: string[];
  /** A 'note' block's paragraphs. Nothing else reads it. */
  body?: string[];
  required: boolean;
}

export interface Survey {
  id: string;
  community_id: string;
  title: string;
  description?: string | null;
  questions: SurveyQuestion[];
  due_date?: string | null;
  meeting_id?: string | null;
  created_by?: string | null;
  created_at: string;
  is_active: boolean;
}

export type SurveyAnswerValue =
  | string
  | string[]
  | number
  | boolean
  | null
  | Record<string, unknown>
  | Record<string, unknown>[];

export type SurveyAnswers = Record<string, SurveyAnswerValue>;

export interface SurveyResponse {
  id: string;
  survey_id: string;
  user_id: string;
  answers: SurveyAnswers;
  submitted_at: string;
  response_period?: string | null;
}

const RETIRED_SURVEY_PATTERNS = [
  /q1\s+exit/i,
  /q1\s+review/i,
];

// The check-in is open the WHOLE cycle now — the mid-month pulse, to-do
// review, and hang ratings all depend on people popping in weeks before the
// meeting. (Was 3 back when this was a pre-meeting-only form.)
const MONTHLY_CHECK_IN_WINDOW_DAYS = 33;
const MONTHLY_CHECK_IN_PATTERN = /monthly\s+check-?in/i;
/**
 * The end-of-month check-in, by title — the same repeating shape as the monthly
 * one and so the same need for a per-month answer key.
 *
 * **"End of the month" had to be added, and the cost of missing it was silent.**
 * The row Nat created on 2026-09-02 carries the new name, matched neither
 * pattern, and so keyed every answer to `'default'` — one row per person for
 * ever, with October's answers landing on top of September's and nothing on
 * screen saying so. Exactly the bug the note on `getSurveyResponsePeriod`
 * records being fixed once already for Production.
 *
 * Still narrower than `END_OF_MONTH_CHECK_IN_PATTERN` in
 * `_shared/checkInPatterns.ts`: that one also answers to two retired titles,
 * and a period key is not the place to start honouring names nothing sends.
 */
const HALFWAY_CHECK_IN_PATTERN = /halfway\s+check-?in|end of the month/i;
/**
 * And the merged pre-meeting one, for the third time this has bitten.
 *
 * "Before we meet" matched neither pattern above, so every answer to it would
 * have keyed to `'default'` — one row per person per HIVE for ever, with
 * October's answers landing silently on top of September's. It is a STANDING
 * monthly check-in, answered again every cycle, which is precisely the shape
 * migration 096 introduced periods for.
 *
 * Found on 2026-09-04 by walking the cutover before doing it, not by it going
 * wrong. The same omission has now cost Production once and "End of the month"
 * once; the note above records the second. A title that repeats needs a period
 * — that is the rule, and this is the third title to need telling.
 */
const PRE_MEETING_CHECK_IN_PATTERN = /before we meet|before our first meeting/i;
const DEFAULT_RESPONSE_PERIOD = 'default';

function isRetiredSurvey(survey: Survey) {
  const label = `${survey.title} ${survey.description ?? ''}`;
  return RETIRED_SURVEY_PATTERNS.some(pattern => pattern.test(label));
}

export function isMonthlyCheckInSurvey(survey: Survey) {
  const label = `${survey.title} ${survey.description ?? ''}`;
  return MONTHLY_CHECK_IN_PATTERN.test(label);
}

function getLocalDateFromSurveyDueDate(dueDate?: string | null) {
  if (!dueDate) return null;

  const match = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(dueDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Which occurrence of a repeating check-in an answer belongs to.
 *
 * A check-in that comes round every month is ONE survey row answered many
 * times, so the answer is keyed by month as well as by survey — otherwise
 * September's upsert lands on August's row and the month before is gone.
 *
 * The HALFWAY check-in repeats exactly the same way, and was reading
 * `'default'` — the key for a one-off survey that is answered once, ever.
 * Nobody had noticed because Production's halfway had no answers at all until
 * 2026-08-28, when it became a copy of OG's and started collecting the
 * newsletter ask. Left alone, the first September shout-out would have
 * overwritten the August one it was filed beside.
 */
export function getSurveyResponsePeriod(survey: Survey) {
  const title = survey.title ?? '';
  const repeats = isMonthlyCheckInSurvey(survey)
    || HALFWAY_CHECK_IN_PATTERN.test(title)
    || PRE_MEETING_CHECK_IN_PATTERN.test(title);
  if (!repeats) return DEFAULT_RESPONSE_PERIOD;

  const periodDate = getLocalDateFromSurveyDueDate(survey.due_date) ?? new Date();
  const year = periodDate.getFullYear();
  const month = String(periodDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getSurveyResponseKey(surveyId: string, responsePeriod: string) {
  return `${surveyId}:${responsePeriod}`;
}

/**
 * SAVING AN ANSWER MUST NOT DEPEND ON WHICH UNIQUE INDEX HAPPENS TO EXIST.
 *
 * An upsert names its conflict target by column, and Postgres refuses with
 * 42P10 unless a unique index matches those columns EXACTLY. That makes the
 * index part of the app's contract, silently — and on 2026-09-04 a migration
 * widened that index to allow one answer per HIVE and, in the same statement,
 * dropped the three-column one this call had always named. Every check-in
 * submit in the app started failing instantly, with no error anywhere except
 * in the face of whoever pressed Save. Nobody happened to be answering, which
 * is luck rather than design.
 *
 * So the target is a LIST, tried widest first, falling back on 42P10:
 *
 *   1. `…, community_key` — one answer per person, per cycle, per HIVE. What a
 *      merged check-in covering several HIVEs needs (migration 229).
 *   2. `…, response_period` — one per person per cycle. The shape before that.
 *   3. `survey_id, user_id` — one per person, ever. The shape before periods.
 *
 * Each is a real historical shape of this table, so the fallback is not a
 * guess: whichever index the database actually has, one of these matches it.
 * It also means the app can be deployed BEFORE the migration and after it,
 * with no window in between where saving is broken — which is the order this
 * was shipped in, deliberately, the second time.
 */
const RESPONSE_CONFLICT_TARGETS = [
  'survey_id,user_id,response_period,community_key',
  'survey_id,user_id,response_period',
  'survey_id,user_id',
];

async function upsertSurveyResponse(payload: Record<string, unknown>) {
  let last: { data: any; error: any } = { data: null, error: null };
  for (const onConflict of RESPONSE_CONFLICT_TARGETS) {
    // The oldest shape has no `response_period` column to send.
    const body = onConflict === 'survey_id,user_id'
      ? (({ response_period: _drop, ...rest }) => rest)(payload as any)
      : payload;
    last = await supabase
      .from('survey_responses')
      .upsert(body, { onConflict })
      .select()
      .single();
    if (!last.error) return last;
    if (!shouldRetryLegacyResponseUpsert(last.error)) return last;
  }
  return last;
}

function shouldRetryLegacyResponseUpsert(error: any) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return (
    error?.code === 'PGRST204'
    || error?.code === '42P10'
    || message.includes('response_period')
    || message.includes('unique or exclusion constraint')
  );
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfLocalMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getSurveyAvailableAt(survey: Survey) {
  const dueDate = getLocalDateFromSurveyDueDate(survey.due_date);
  if (!dueDate) return null;

  const availableAt = startOfLocalDay(dueDate);
  availableAt.setDate(availableAt.getDate() - MONTHLY_CHECK_IN_WINDOW_DAYS);
  return availableAt;
}

function isSurveyAvailableToMembers(survey: Survey) {
  if (!isMonthlyCheckInSurvey(survey)) return true;

  const availableAt = getSurveyAvailableAt(survey);
  if (!availableAt) return true;

  return startOfLocalDay(new Date()) >= availableAt;
}

function isSurveyPendingForMember(survey: Survey, response?: SurveyResponse) {
  if (!response) return true;

  if (!isMonthlyCheckInSurvey(survey)) return false;

  const currentPeriod = getSurveyResponsePeriod(survey);
  if (
    currentPeriod !== DEFAULT_RESPONSE_PERIOD
    && response.response_period
    && response.response_period !== currentPeriod
  ) {
    return true;
  }

  const availableAt = getSurveyAvailableAt(survey);
  const submittedAt = new Date(response.submitted_at);
  if (Number.isNaN(submittedAt.getTime())) return false;

  if (!availableAt) {
    return submittedAt < startOfLocalMonth(new Date());
  }

  return submittedAt < availableAt;
}

type SurveysSnapshot = {
  surveys: Survey[];
  responses: Map<string, SurveyResponse>;
};

const EMPTY_SNAPSHOT: SurveysSnapshot = { surveys: [], responses: new Map() };

const surveysQueryKey = (communityId?: string, userId?: string) =>
  ['surveys', communityId ?? '', userId ?? ''] as const;

async function fetchSurveys(communityId: string, userId?: string): Promise<SurveysSnapshot> {
    /**
     * This HIVE's check-ins, **and the ones that belong to no HIVE at all**.
     *
     * `community_id is null` means HIVE-Wide — one survey for everybody, the
     * same thing NULL means everywhere else in this app (migration 225). Nat,
     * 2026-09-02: *"maybe we make one survey that goes out to everyone
     * HIVE-Wide, and if you're in multiple HIVEs you only get one email...
     * fewer surveys."*
     *
     * Every other reader in the app still filters to one HIVE and therefore
     * still cannot see it, which is the point of NULL over a pretend
     * "HIVE-Wide community" row: seeing it is opt-in, one caller at a time,
     * rather than a fourth HIVE turning up in lists nobody thought to guard.
     */
    const surveysQuery = supabase
      .from('surveys')
      .select('*')
      .or(`community_id.eq.${communityId},community_id.is.null`)
      .order('created_at', { ascending: false });

    const responsesQuery = userId
      ? supabase
          .from('survey_responses')
          .select('*')
          .eq('user_id', userId)
          .or(`community_id.eq.${communityId},community_id.is.null`)
      : Promise.resolve({ data: [] });

    const [surveysRes, responsesRes] = await Promise.all([surveysQuery, responsesQuery]);

    const surveys = (surveysRes.data ?? []) as Survey[];

    const responsesByPeriod = new Map<string, SurveyResponse>();
    const latestResponseBySurvey = new Map<string, SurveyResponse>();
    ((responsesRes as any).data ?? []).forEach((r: any) => {
      const response = r as SurveyResponse;
      const responsePeriod = response.response_period ?? DEFAULT_RESPONSE_PERIOD;
      responsesByPeriod.set(getSurveyResponseKey(response.survey_id, responsePeriod), response);

      const existing = latestResponseBySurvey.get(response.survey_id);
      if (!existing || response.submitted_at > existing.submitted_at) {
        latestResponseBySurvey.set(response.survey_id, response);
      }
    });

    const currentResponses = new Map<string, SurveyResponse>();
    surveys.forEach((survey) => {
      const responsePeriod = getSurveyResponsePeriod(survey);
      const periodResponse = responsesByPeriod.get(getSurveyResponseKey(survey.id, responsePeriod));
      const latestResponse = latestResponseBySurvey.get(survey.id);
      if (periodResponse || latestResponse) {
        currentResponses.set(survey.id, periodResponse ?? latestResponse!);
      }
    });
    return { surveys, responses: currentResponses };
}

/**
 * The HIVE's surveys, and which of them this member has already answered.
 *
 * Cached since 2026-08-12. Like `useActivityFeed` and
 * `useCarryForwardContext`, this ran its two round trips on every mount with
 * nothing remembered in between — and it mounts on Home, Profile,
 * monthly-tuneup and Admin, so the same two queries were being re-asked as a
 * member moved between them. Ten minutes of stale time: a survey's shape and
 * due date barely move within a session, and the one thing that does change
 * mid-session — this member answering — is written straight into the cache by
 * `submitResponse` below rather than waited for.
 */
export function useSurveys(communityId?: string, userId?: string) {
  const queryKey = surveysQueryKey(communityId, userId);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchSurveys(communityId!, userId),
    enabled: !!communityId,
    staleTime: 10 * 60 * 1000,
  });

  const { surveys: allSurveys, responses: myResponses } = data ?? EMPTY_SNAPSHOT;
  const loading = !!communityId && isLoading;

  const activeSurveys = allSurveys.filter(s => s.is_active && !isRetiredSurvey(s));
  const availableSurveys = activeSurveys.filter(isSurveyAvailableToMembers);
  const pendingSurveys = availableSurveys.filter(s => isSurveyPendingForMember(s, myResponses.get(s.id)));

  const submitResponse = async (
    surveyId: string,
    answers: SurveyAnswers,
    periodOverride?: string,
  ) => {
    if (!userId) return { error: 'Not authenticated' };

    /**
     * Which check-in this is, fetched if the cache has not got it.
     *
     * The cached list is normally enough, and when it is not the guess is
     * dangerous rather than merely wrong: a HIVE-Wide answer filed under
     * whichever HIVE the person happened to be standing in counts three times
     * for a member of three HIVEs, and is invisible to the one policy that lets
     * Nat read it (migration 225). One extra round trip in a race beats that.
     */
    let survey = allSurveys.find(s => s.id === surveyId) ?? null;
    if (!survey) {
      const { data: fetched } = await supabase
        .from('surveys')
        .select('*')
        .eq('id', surveyId)
        .maybeSingle();
      survey = (fetched as Survey | null) ?? null;
    }
    if (!survey) return { error: 'That check-in could not be found.' };

    // A HIVE-Wide check-in has no HIVE, and needs none. Only a HIVE's own
    // check-in requires you to be standing in it.
    const isWide = survey.community_id == null;
    if (!isWide && !communityId) return { error: 'Not authenticated' };

    const responsePeriod = periodOverride ?? getSurveyResponsePeriod(survey);

    const payload = {
      survey_id: surveyId,
      user_id: userId,
      // An answer belongs where its QUESTION belongs.
      community_id: isWide ? null : communityId,
      answers,
      response_period: responsePeriod,
      submitted_at: new Date().toISOString(),
    };

    const { data, error } = await upsertSurveyResponse(payload);

    if (!error && data) {
      // Straight into the cache, the same shape the fetch builds. Every
      // screen holding this key — Home, Profile, the tune-up, Admin — sees
      // the answer land without a refetch, which is what the old local
      // `setMyResponses` did for one screen only.
      queryClient.setQueryData<SurveysSnapshot>(queryKey, (previous) => {
        const base = previous ?? EMPTY_SNAPSHOT;
        return {
          surveys: base.surveys,
          responses: new Map(base.responses).set(surveyId, data as SurveyResponse),
        };
      });
    }
    return { error };
  };

  /**
   * ONE CHECK-IN, ONE ROW PER HIVE.
   *
   * What the merged "Before we meet" saves: the answers about each HIVE under
   * their own bare ids, in that HIVE's own row, each row also carrying a copy
   * of the personal answers. See `splitMergedAnswers` in `lib/checkIns.ts` for
   * the split and why the copy is deliberate.
   *
   * Rows are written one at a time rather than in a single call so that a HIVE
   * that fails does not take the others down with it — a member who answered
   * for three HIVEs and lost all three because one write tripped would have
   * nothing to show for it and no idea which. Whatever landed, landed; the
   * reply says how many.
   */
  const submitPerHiveResponses = async (
    surveyId: string,
    perHive: { communityId: string; answers: SurveyAnswers; responsePeriod?: string }[],
  ) => {
    if (!userId) return { error: 'Not authenticated' };
    if (!perHive.length) return { error: 'Nothing to save' };

    let survey = allSurveys.find((s) => s.id === surveyId) ?? null;
    if (!survey) {
      const { data: fetched } = await supabase
        .from('surveys').select('*').eq('id', surveyId).maybeSingle();
      survey = (fetched as Survey | null) ?? null;
    }
    if (!survey) return { error: 'That check-in could not be found.' };

    const responsePeriod = getSurveyResponsePeriod(survey);
    const submittedAt = new Date().toISOString();
    const failed: string[] = [];
    let mine: SurveyResponse | null = null;

    for (const row of perHive) {
      const { data, error } = await upsertSurveyResponse({
        survey_id: surveyId,
        user_id: userId,
        community_id: row.communityId,
        answers: row.answers,
        response_period: row.responsePeriod ?? responsePeriod,
        submitted_at: submittedAt,
      });
      if (error) { failed.push(row.communityId); continue; }
      // The cache holds one response per survey, so it keeps the HIVE the
      // reader is standing in — the others are read by their own HIVE's deck.
      if (!mine || row.communityId === communityId) mine = data as SurveyResponse;
    }

    if (mine) {
      queryClient.setQueryData<SurveysSnapshot>(queryKey, (previous) => {
        const base = previous ?? EMPTY_SNAPSHOT;
        return {
          surveys: base.surveys,
          responses: new Map(base.responses).set(surveyId, mine as SurveyResponse),
        };
      });
    }

    if (failed.length === perHive.length) return { error: 'Could not save your answers.' };
    if (failed.length) {
      return { error: `Saved, except for ${failed.length} of your HIVEs. Your other answers are saved. Please try again.` };
    }
    return { error: null };
  };

  // No legacy-write fallback: a missing RPC must fail closed, not mark a
  // response complete independently of saving its occurrence answers.
  const submitCheckInOccurrence = async (
    surveyId: string,
    answers: SurveyAnswers,
    occurrenceCommunityId: string | null,
    occurrence: string,
  ) => {
    if (!userId) return { error: 'Not authenticated' };
    const { data, error } = await supabase.rpc('save_check_in_occurrence', {
      p_survey_id: surveyId,
      p_community_id: occurrenceCommunityId,
      p_occurrence: occurrence,
      p_answers: answers,
    });
    if (error) return { error };
    if (!data) return { error: 'Could not confirm your saved check-in.' };
    // Only publish success after both database writes committed.
    queryClient.setQueryData<SurveysSnapshot>(surveysQueryKey(occurrenceCommunityId ?? communityId, userId), (previous) => {
      const base = previous ?? EMPTY_SNAPSHOT;
      return { surveys: base.surveys, responses: new Map(base.responses).set(surveyId, data as SurveyResponse) };
    });
    void queryClient.invalidateQueries({ queryKey: ['surveys'] });
    return { error: null };
  };

  return { allSurveys, activeSurveys, availableSurveys, pendingSurveys, myResponses, loading, refetch, submitResponse, submitPerHiveResponses, submitCheckInOccurrence };
}
