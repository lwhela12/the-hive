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
}

const RETIRED_SURVEY_PATTERNS = [
  /q1\s+exit/i,
  /q1\s+review/i,
];

const MONTHLY_CHECK_IN_WINDOW_DAYS = 5;
const MONTHLY_CHECK_IN_PATTERN = /monthly\s+check-?in/i;

function isRetiredSurvey(survey: Survey) {
  const label = `${survey.title} ${survey.description ?? ''}`;
  return RETIRED_SURVEY_PATTERNS.some(pattern => pattern.test(label));
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

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSurveyAvailableToMembers(survey: Survey) {
  const label = `${survey.title} ${survey.description ?? ''}`;
  if (!MONTHLY_CHECK_IN_PATTERN.test(label)) return true;

  const dueDate = getLocalDateFromSurveyDueDate(survey.due_date);
  if (!dueDate) return true;

  const availableAt = startOfLocalDay(dueDate);
  availableAt.setDate(availableAt.getDate() - MONTHLY_CHECK_IN_WINDOW_DAYS);

  return startOfLocalDay(new Date()) >= availableAt;
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

      setAllSurveys((surveysRes.data ?? []) as Survey[]);
      const map = new Map<string, SurveyResponse>();
      ((responsesRes as any).data ?? []).forEach((r: any) => map.set(r.survey_id, r));
      setMyResponses(map);
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
  const pendingSurveys = availableSurveys.filter(s => !myResponses.has(s.id));

  const submitResponse = async (
    surveyId: string,
    answers: Record<string, string | string[] | number>
  ) => {
    if (!communityId || !userId) return { error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('survey_responses')
      .upsert({
        survey_id: surveyId,
        user_id: userId,
        community_id: communityId,
        answers,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'survey_id,user_id' })
      .select()
      .single();

    if (!error && data) {
      setMyResponses(prev => new Map(prev).set(surveyId, data as SurveyResponse));
    }
    return { error };
  };

  return { allSurveys, activeSurveys, availableSurveys, pendingSurveys, myResponses, loading, refetch: load, submitResponse };
}
