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
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
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
  }, [surveyId, userId, communityId, expanded]);
  const seen = new Set<string>();
  const history = rows.flatMap(row => {
    const answers = transitionAnswers(row, communityId);
    if (!answers) return [];
    const key = JSON.stringify([row.response_period, answers]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ row, answers }];
  });
  const label = scopeLabel ? `Review past answers · ${scopeLabel}` : 'Review past answers';
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: skin.gold }}>{expanded ? '▾' : '▸'} {label}</Text>
    </Pressable>
    {expanded && <View style={{ gap: 8, padding: 12 }}>
      {error ? <Text accessibilityRole="alert" style={{ color: skin.inkSoft }}>Past answers could not load. Please try again.</Text> : history.length === 0 ? <Text style={{ color: skin.inkSoft }}>No past answers here yet.</Text> : null}
      {history.map(({ row, answers }) => {
        const date = row.submitted_at ? new Date(row.submitted_at) : null;
        const when = date && !Number.isNaN(date.getTime())
          ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : 'An earlier check-in';
        return <Pressable key={row.id} accessibilityRole="button" onPress={() => onReview(answers)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: skin.gold }}>{when} →</Text>
        </Pressable>;
      })}
    </View>}
  </View>;
}
