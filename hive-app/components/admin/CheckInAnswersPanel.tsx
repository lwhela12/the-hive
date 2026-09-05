import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

/** One read-only archive. Scope every query; never retire or delete a response. */
export function CheckInAnswersPanel({ hives, cellStyle, panelStyle, bodyStyle, scrollStyle, Panel }: any) {
  const [hiveId, setHiveId] = useState<string | null>(null);
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
        else setSurveys(data ?? []);
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
        setLoading(false);
        if (error) setError('Could not load these answers.');
        else {
          const rows = data ?? [];
          void supabase.from('profiles').select('id, full_name').in('id', [...new Set(rows.map(r => r.user_id))]).then(({ data: people, error: nameError }) => {
            if (!current) return;
            if (nameError) { setError('Could not load respondent names.'); return; }
            setResponses(rows.map(r => ({ ...r, respondent: people?.find(p => p.id === r.user_id)?.full_name ?? r.user_id })));
          });
        }
      });
    return () => { current = false; };
  }, [surveyId, surveys, hiveId]);
  const text = { color: '#fffdf5', fontSize: 13 };
  const selected = surveys.find(s => s.id === surveyId);
  return <View style={cellStyle}><Panel title="Check-in answers" style={panelStyle} bodyStyle={bodyStyle}>
    <ScrollView style={scrollStyle} contentContainerStyle={{ padding: 12, gap: 10 }}>
      <Text style={text}>Read current and archived answers by HIVE. Nothing here changes a check-in or its schedule.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{hives.map((h: any) =>
        <Pressable key={h.community_id} accessibilityRole="button" accessibilityState={{ selected: hiveId === h.community_id }} onPress={() => { if (hiveId === h.community_id) return; setResponses([]); setSurveys([]); setSurveyId(null); setHiveId(h.community_id); }}>
          <Text style={{ ...text, fontWeight: hiveId === h.community_id ? '700' : '400' }}>{h.community?.name ?? 'HIVE'}</Text>
        </Pressable>)}</View>
      {surveys.map(s => <Pressable key={s.id} accessibilityRole="button" onPress={() => { if (surveyId === s.id) return; setResponses([]); setSurveyId(s.id); }}><Text style={text}>{s.id === surveyId ? '▾ ' : '▸ '}{s.title}{s.is_active ? '' : ' · Archived'}</Text></Pressable>)}
      {loading ? <Text style={text}>Loading…</Text> : error ? <Text accessibilityRole="alert" style={{ color: '#ffb4a8' }}>{error}</Text> : selected && !responses.length ? <Text style={text}>No answers for this check-in.</Text> : null}
      {responses.map(r => <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: '#ffffff33', paddingTop: 10 }}>
        <Text style={text}>{r.respondent} · {r.response_period ?? 'Earlier answers'} · {r.submitted_at}</Text>
        {Object.entries(r.answers ?? {}).map(([key, value]) => <Text key={key} selectable style={{ ...text, paddingTop: 6 }}>{selected?.questions?.find((q: any) => q.id === key)?.label ?? selected?.questions?.find((q: any) => q.id === key)?.question ?? key}: {typeof value === 'string' ? value : JSON.stringify(value)}</Text>)}
      </View>)}
    </ScrollView>
  </Panel></View>;
}
