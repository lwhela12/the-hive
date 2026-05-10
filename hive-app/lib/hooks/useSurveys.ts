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

  const activeSurveys = allSurveys.filter(s => s.is_active);
  const pendingSurveys = activeSurveys.filter(s => !myResponses.has(s.id));

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

  return { allSurveys, activeSurveys, pendingSurveys, myResponses, loading, refetch: load, submitResponse };
}
