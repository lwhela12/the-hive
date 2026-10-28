import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { meetingFocus, monthlyHelp, precedingPeriod, type StoryWish, type StoryTask } from '../../lib/memberWishStory';
import { parseActionItemDescription } from '../../lib/actionItemDisplay';

type Reflection = { progress?: string; help_received?: string; help_given?: string };
export function MemberWishStory({ communityId, memberId, since, meetingId, selectedId, selectedText, hasCheckIn, reportedWish = '', progressText = '', scale = 1, surveyId, responsePeriod, memberNames }: {
  surveyId: string; responsePeriod: string; memberNames: Record<string, string>;
  communityId: string; memberId: string; since: string; meetingId: string;
  selectedId?: unknown; selectedText: string; hasCheckIn: boolean;
  reportedWish?: string; progressText?: string; scale?: number;
}) {
  const [data, setData] = useState<{ wishes: StoryWish[]; tasks: StoryTask[]; reflection: Reflection; previous: string } | null>(null);
  const [width, setWidth] = useState(800);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError(false);
    async function pages(query: () => any) {
      const rows: any[] = [];
      for (let offset = 0; ; offset += 200) {
        const result = await query().range(offset, offset + 199);
        if (result.error) throw result.error;
        rows.push(...(result.data ?? []));
        if ((result.data ?? []).length < 200) return rows;
      }
    }
    Promise.all([
      pages(() => supabase.from('wishes').select('id, user_id, description, status, is_active, is_spotlight')
        .eq('user_id', memberId).eq('status', 'public').eq('is_active', true)
        .or(`community_id.eq.${communityId},share_scope.eq.all_hives`).order('created_at', { ascending: false }).order('id')),
      pages(() => supabase.from('action_items').select('id, description, assigned_to, related_wish_id, related_user_id, completed, completed_at, created_at')
        .eq('community_id', communityId).or(`related_user_id.eq.${memberId},assigned_to.eq.${memberId}`).is('archived_at', null)
        .order('created_at', { ascending: false }).order('id')),
      (supabase as any).from('meeting_member_reflections').select('progress, help_received, help_given')
        .eq('community_id', communityId).eq('meeting_id', meetingId).eq('user_id', memberId).maybeSingle(),
      precedingPeriod(responsePeriod) ? (supabase as any).from('survey_responses')
        .select('wish:answers->>q_hd_wish').eq('survey_id', surveyId).eq('community_id', communityId)
        .eq('user_id', memberId).eq('response_period', precedingPeriod(responsePeriod)).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]).then(([wishes, tasks, reflection, previous]) => {
      if (reflection.error || previous.error) throw reflection.error || previous.error;
      if (active) setData({ wishes, tasks, reflection: reflection.data ?? {}, previous: previous.data?.wish?.trim() ?? '' });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [communityId, memberId, meetingId, retry, surveyId, responsePeriod]);
  useEffect(() => {
    const channel = supabase.channel(`meeting-focus:${meetingId}:${memberId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_items', filter: `related_user_id=eq.${memberId}` }, () => setRetry(n => n + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishes', filter: `user_id=eq.${memberId}` }, () => setRetry(n => n + 1))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [meetingId, memberId]);
  const text = { fontFamily: 'Lato_400Regular', color: '#313130', fontSize: 20 * scale, lineHeight: 29 * scale };
  const heading = { ...text, fontFamily: 'Lato_700Bold', color: '#8b6828', fontSize: 16 * scale, lineHeight: 23 * scale };
  if (error) return <View accessibilityRole="alert"><Text style={text}>Couldn’t load this person’s focus.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n+1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={heading}>Try again</Text></Pressable></View>;
  if (!data) return <ActivityIndicator accessibilityLabel="Loading meeting focus" color="#bd9348" />;
  const focus = meetingFocus(data.wishes, selectedId, selectedText, hasCheckIn);
  const help = monthlyHelp(data.tasks, memberId, since);
  const ownDone = data.tasks.filter(t => t.assigned_to === memberId && (!t.related_user_id || t.related_user_id === memberId) && t.completed && !!t.completed_at && t.completed_at >= since);
  const update = data.reflection.progress || progressText || ownDone.slice(0,2).map(t => '✓ ' + parseActionItemDescription(t.description).text).join('\n');
  const toggle = (key: string) => setExpanded(v => ({ ...v, [key]: !v[key] }));
  const more = (key: string, label = 'Read more') => <Pressable accessibilityRole="button" accessibilityState={{ expanded: !!expanded[key] }} onPress={() => toggle(key)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={heading}>{expanded[key] ? 'Show less' : label}</Text></Pressable>;
  const paragraph = (key: string, value: string) => <View><Text numberOfLines={expanded[key] ? undefined : 4} style={text}>{value}</Text>{value.length > 180 ? more(key) : null}</View>;
  const column = { flexGrow: 1, flexBasis: width >= 620 ? '45%' as const : '100%' as const, minWidth: 0, gap: 8, backgroundColor: '#fbf6e9', borderRadius: 14, padding: 16 };
  const helpColumn = (key: 'received' | 'given', title: string) => {
    const rows = help[key];
    const spoken = key === 'received' ? data.reflection.help_received : data.reflection.help_given;
    return <View style={column}>
      <Text accessibilityRole="header" style={heading}>{title}</Text>
      {spoken ? paragraph(key+'spoken', spoken) : null}
      {(expanded[key] ? rows : rows.slice(0,2)).map((row, i) => {
        const names = [...row.people].map(id => memberNames[id]?.split(' ')[0] || 'A member');
        const label = names.slice(0,3).join(', ') + (names.length > 3 ? ` +${names.length-3}` : '');
        return <View key={i} style={{ gap: 3 }}><Text style={{ ...heading, fontSize: 15 * scale }}>{label} · {row.completed ? 'Done' : 'Still open'}</Text><Text numberOfLines={expanded[key] ? undefined : 2} style={text}>{parseActionItemDescription(row.description).text}</Text></View>;
      })}
      {!rows.length && !spoken ? <Text style={text}>Nothing recorded this month yet.</Text> : null}
      {rows.length > 2 ? more(key, `See all ${rows.length}`) : rows.some(r => r.description.length > 120) ? more(key) : null}
    </View>;
  };
  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      <View style={column}><Text accessibilityRole="header" style={heading}>Last month’s focus</Text>{paragraph('previous', data.previous || 'No wish saved in last month’s check-in.')}</View>
      <View style={column}><Text accessibilityRole="header" style={heading}>Next month’s focus</Text>{paragraph('next', focus?.description || (!hasCheckIn ? reportedWish : '') || (selectedText || selectedId ? 'The selected wish was closed or removed. Choose a new focus.' : 'No new focus shared yet.'))}</View>
    </View>
    {update ? <View style={{ gap: 8 }}><Text accessibilityRole="header" style={heading}>How my month went</Text>{paragraph('progress', update)}</View> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {helpColumn('received', 'Who helped me')}
      {helpColumn('given', 'Who I helped')}
    </View>
  </View>;
}
