import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { usePageSkin } from '../../lib/pageSkin';
import { transitionAnswers, type CheckInHistory } from '../../lib/checkInTransition';
import type { SurveyAnswers } from '../../lib/hooks/useSurveys';

/** Originals are review material, never evidence of completing a meeting. */
export function LegacyCheckInAnswers({ surveyId, userId, communityId, scopeLabel, onReview }: {
  surveyId: string; userId: string; communityId: string | null; scopeLabel?: string;
  onReview: (answers: SurveyAnswers) => void;
}) {
  const skin = usePageSkin();
  const [rows, setRows] = useState<CheckInHistory[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    setRows([]); setError(false);
    void supabase.from('check_in_answer_history')
      .select('id, community_id, response_period, submitted_at, answers')
      .eq('survey_id', surveyId).eq('user_id', userId)
      .order('archived_at', { ascending: false }).then(({ data, error }) => {
        if (!current) return;
        setError(!!error); setRows(data ?? []);
      });
    return () => { current = false; };
  }, [surveyId, userId]);
  const seen = new Set<string>();
  return <View style={{ gap: 8 }}>
    {error && <Text accessibilityRole="alert" style={{ color: skin.inkSoft }}>Earlier answers could not load. They have not been removed.</Text>}
    {rows.map(row => {
      const answers = transitionAnswers(row, communityId);
      if (!answers) return null;
      const key = JSON.stringify([row.response_period, answers]);
      if (seen.has(key)) return null;
      seen.add(key);
      return <View key={row.id} style={{ padding: 12, borderWidth: 1, borderColor: skin.inkSoft, gap: 6 }}>
        <Text style={{ color: skin.inkSoft }}>{scopeLabel ?? (communityId ? "This HIVE" : "Your month")} · Earlier answers · {row.response_period ?? 'Undated'} · submitted {row.submitted_at ?? 'date unknown'}</Text>
        <Text style={{ color: skin.inkSoft }}>Original preserved. Review and save to use these for this check-in; they do not mark a meeting complete.</Text>
        {Object.entries(answers).map(([key, value]) => <Text selectable key={key} style={{ color: skin.inkSoft }}>{key}: {typeof value === 'string' ? value : JSON.stringify(value)}</Text>)}
        <Pressable accessibilityRole="button" onPress={() => onReview(answers)}><Text style={{ color: skin.gold }}>Review these answers →</Text></Pressable>
      </View>;
    })}
  </View>;
}
