import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

/** One read-only archive. Scope every query; never retire or delete a response. */
export function CheckInAnswersPanel({ hiveId }: { hiveId: string }) {
  const [surveys, setSurveys] = useState<any[]>([]);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setSurveys([]); setSurveyId(null); setResponses([]); setError(null);
    if (!hiveId) return;
    setLoading(true);
    void supabase.from('surveys').select('id, title, questions, is_active, community_id').or(`community_id.eq.${hiveId},community_id.is.null`)
      .order('created_at', { ascending: false }).then(({ data, error }) => {
        if (!current) return;
        setLoading(false);
        if (error) setError('Could not load this HIVE’s check-ins.');
        else { setSurveys(data ?? []); setSurveyId(data?.find(s => s.is_active)?.id ?? data?.[0]?.id ?? null); }
      });
    return () => { current = false; };
  }, [hiveId]);
  useEffect(() => {
    let current = true;
    setResponses([]); setError(null);
    if (!hiveId || !surveyId || !surveys.some(s => s.id === surveyId)) return;
    setLoading(true);
    const survey = surveys.find(s => s.id === surveyId);
    let query = supabase.from('survey_responses').select('id, user_id, answers, response_period, submitted_at')
      .eq('survey_id', surveyId);
    query = survey.community_id ? query.or(`community_id.eq.${hiveId},community_id.is.null`) : query.eq('community_id', hiveId);
    void query.order('submitted_at', { ascending: false }).then(({ data, error }) => {
        if (!current) return;
        if (error) { setLoading(false); setError('Could not load these answers.'); }
        else {
          const rows = data ?? [];
          if (!rows.length) { setResponses([]); setLoading(false); return; }
          void supabase.from('profiles').select('id, name').in('id', [...new Set(rows.map(r => r.user_id))]).then(({ data: people, error: nameError }) => {
            if (!current) return;
            setLoading(false);
            if (nameError) { setError('Could not load respondent names.'); return; }
            setResponses(rows.map(r => ({ ...r, respondent: people?.find(p => p.id === r.user_id)?.name ?? r.user_id })));
          });
        }
      });
    return () => { current = false; };
  }, [surveyId, surveys, hiveId]);
  const text = { color: '#fffdf5', fontSize: 13 };
  const selected = surveys.find(s => s.id === surveyId);
  return <View style={{ padding: 12, gap: 10 }}>
      <Text style={text}>Current and archived answers for this HIVE.</Text>
      {!loading && !error && !surveys.length ? <Text style={text}>No check-ins for this HIVE yet.</Text> : null}
      {surveys.map(s => <Pressable key={s.id} accessibilityRole="button" onPress={() => { if (surveyId === s.id) return; setResponses([]); setSurveyId(s.id); }}><Text style={text}>{s.id === surveyId ? '▾ ' : '▸ '}{s.title}{s.is_active ? '' : ' · Archived'}</Text></Pressable>)}
      {loading ? <Text style={text}>Loading…</Text> : error ? <Text accessibilityRole="alert" style={{ color: '#ffb4a8' }}>{error}</Text> : selected && !responses.length ? <Text style={text}>No answers for this check-in.</Text> : null}
      {responses.map(r => <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: '#ffffff33', paddingTop: 10 }}>
        <Text style={text}>{r.respondent} · {r.response_period ?? 'Earlier answers'} · {r.submitted_at}</Text>
        {Object.entries(r.answers ?? {}).map(([key, value]) => <Text key={key} selectable style={{ ...text, paddingTop: 6 }}>{selected?.questions?.find((q: any) => q.id === key)?.text ?? selected?.questions?.find((q: any) => q.id === key)?.label ?? selected?.questions?.find((q: any) => q.id === key)?.question ?? key}: {typeof value === 'string' ? value : JSON.stringify(value)}</Text>)}
      </View>)}
  </View>;
}
