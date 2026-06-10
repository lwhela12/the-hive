import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export interface SurveyQuestion {
  id: string;
  text: string;
  type: 'short' | 'long' | 'scale' | 'choice';
  options?: string[];
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

export interface SurveyResponse {
  id: string;
  survey_id: string;
  user_id: string;
  answers: Record<string, string | string[] | number>;
  submitted_at: string;
  response_period?: string | null;
}

const RETIRED_SURVEY_PATTERNS = [
  /q1\s+exit/i,
  /q1\s+review/i,
];

const MONTHLY_CHECK_IN_WINDOW_DAYS = 3;
const MONTHLY_CHECK_IN_PATTERN = /monthly\s+check-?in/i;
const DEFAULT_RESPONSE_PERIOD = 'default';

function isRetiredSurvey(survey: Survey) {
  const label = `${survey.title} ${survey.description ?? ''}`;
  return RETIRED_SURVEY_PATTERNS.some(pattern => pattern.test(label));
}

function isMonthlyCheckInSurvey(survey: Survey) {
  const label = `${survey.title} ${survey.description ?? ''}`;
  return MONTHLY_CHECK_IN_PATTERN.test(label);
}

function getLocalDateFromSurveyDueDate(dueDate?: string | null) {
  if (!dueDate) return null;

  const dateOnly = dueDate.slice(0, 10);
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(dueDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSurveyResponsePeriod(survey: Survey) {
  if (!isMonthlyCheckInSurvey(survey)) return DEFAULT_RESPONSE_PERIOD;

  const dueDate = getLocalDateFromSurveyDueDate(survey.due_date);
  if (!dueDate) return DEFAULT_RESPONSE_PERIOD;

  const year = dueDate.getFullYear();
  const month = String(dueDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getSurveyResponseKey(surveyId: string, responsePeriod: string) {
  return `${surveyId}:${responsePeriod}`;
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

function getSurveyAvailableAt(survey: Survey) {
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
  if (!availableAt) return false;

  const submittedAt = new Date(response.submitted_at);
  if (Number.isNaN(submittedAt.getTime())) return false;

  return submittedAt < availableAt;
}

export function useSurveys(communityId?: string, userId?: string) {
  const [allSurveys, setAllSurveys] = useState<Survey[]>([]);
  const [myResponses, setMyResponses] = useState<Map<string, SurveyResponse>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const surveysQuery = supabase
        .from('surveys')
        .select('*')
        .eq('community_id', communityId)
        .order('created_at', { ascending: false });

      const responsesQuery = userId
        ? supabase
            .from('survey_responses')
            .select('*')
            .eq('user_id', userId)
            .eq('community_id', communityId)
        : Promise.resolve({ data: [] });

      const [surveysRes, responsesRes] = await Promise.all([surveysQuery, responsesQuery]);

      const surveys = (surveysRes.data ?? []) as Survey[];
      setAllSurveys(surveys);

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
      setMyResponses(currentResponses);
    } catch (e) {
      console.error('[useSurveys] load error', e);
    } finally {
      setLoading(false);
    }
  }, [communityId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeSurveys = allSurveys.filter(s => s.is_active && !isRetiredSurvey(s));
  const availableSurveys = activeSurveys.filter(isSurveyAvailableToMembers);
  const pendingSurveys = availableSurveys.filter(s => isSurveyPendingForMember(s, myResponses.get(s.id)));

  const submitResponse = async (
    surveyId: string,
    answers: Record<string, string | string[] | number>
  ) => {
    if (!communityId || !userId) return { error: 'Not authenticated' };

    const survey = allSurveys.find(s => s.id === surveyId);
    const responsePeriod = survey ? getSurveyResponsePeriod(survey) : DEFAULT_RESPONSE_PERIOD;

    const payload = {
      survey_id: surveyId,
      user_id: userId,
      community_id: communityId,
      answers,
      response_period: responsePeriod,
      submitted_at: new Date().toISOString(),
    };

    let result = await supabase
      .from('survey_responses')
      .upsert(payload, { onConflict: 'survey_id,user_id,response_period' })
      .select()
      .single();

    if (result.error && shouldRetryLegacyResponseUpsert(result.error)) {
      const { response_period: _responsePeriod, ...legacyPayload } = payload;
      result = await supabase
        .from('survey_responses')
        .upsert(legacyPayload, { onConflict: 'survey_id,user_id' })
        .select()
        .single();
    }

    const { data, error } = result;

    if (!error && data) {
      setMyResponses(prev => new Map(prev).set(surveyId, data as SurveyResponse));
    }
    return { error };
  };

  return { allSurveys, activeSurveys, availableSurveys, pendingSurveys, myResponses, loading, refetch: load, submitResponse };
}
