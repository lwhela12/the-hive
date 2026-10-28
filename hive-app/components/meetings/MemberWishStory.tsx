import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { meetingFocus, monthlyHelp, precedingPeriod, speakingCue, focusCues, helpByPerson, wishIdentity, type StoryWish, type StoryTask } from '../../lib/memberWishStory';
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
  useEffect(() => { setExpanded({}); }, [memberId, meetingId]);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_items', filter: `assigned_to=eq.${memberId}` }, () => setRetry(n => n + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishes', filter: `user_id=eq.${memberId}` }, () => setRetry(n => n + 1))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [meetingId, memberId]);
  const text = { fontFamily: 'Lato_400Regular', color: '#313130', fontSize: 16 * scale, lineHeight: 22 * scale };
  const heading = { ...text, fontFamily: 'Lato_700Bold', color: '#8b6828', fontSize: 20 * scale, lineHeight: 26 * scale };
  if (error) return <View accessibilityRole="alert"><Text style={text}>Couldn’t load this person’s focus.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n+1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={heading}>Try again</Text></Pressable></View>;
  if (!data) return <ActivityIndicator accessibilityLabel="Loading meeting focus" color="#bd9348" />;
  const focus = meetingFocus(data.wishes, selectedId, selectedText, hasCheckIn);
  const help = monthlyHelp(data.tasks, memberId, since);
  const ownDone = data.tasks.filter(t => t.assigned_to === memberId && (!t.related_user_id || t.related_user_id === memberId) && t.completed && !!t.completed_at && t.completed_at >= since);
  const toggle = (key: string) => setExpanded(v => ({ ...v, [key]: !v[key] }));
  const subheading = { ...text, fontFamily: 'Lato_700Bold', color: '#75571f', fontSize: 14 * scale, lineHeight: 20 * scale };
  const column = { flexGrow: 1, flexBasis: width >= 900 ? '30%' as const : '100%' as const, minWidth: 0, gap: 16, backgroundColor: '#fbf6e9', borderRadius: 14, padding: 16 };
  const cue = (key: string, original: string, completed?: boolean, label = speakingCue(original)) => <Pressable
    key={key} accessibilityRole="button" accessibilityLabel={`${label}. ${completed === true ? 'Completed. ' : completed === false ? 'Still open. ' : ''}${expanded[key] ? 'Hide' : 'Show'} full wording`}
    accessibilityState={{ expanded: !!expanded[key] }} onPress={() => toggle(key)}
    style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingVertical: 5, borderRadius: 6, backgroundColor: pressed || expanded[key] ? '#f0e5ca' : 'transparent' })}>
    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start' }}>
      <Text style={{ ...text, color: completed === true ? '#52613d' : '#8b6828' }}>{completed === true ? '✓' : '•'}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={text}>{expanded[key] ? original : label}</Text>
        {completed === false ? <Text style={{ ...subheading, fontSize: 12 * scale }}>Still open</Text> : null}
      </View>
    </View>
  </Pressable>;
  const helpList = (key: 'received' | 'given') => {
    const people = helpByPerson(help[key]);
    const spoken = key === 'received' ? data.reflection.help_received : data.reflection.help_given;
    return <View style={{ gap: 12 }}>
      {people.map(person => <View key={person.id} style={{ gap: 0 }}>
        <Text style={subheading}>{memberNames[person.id]?.split(' ')[0] || 'A member'}</Text>
        {person.items.map((row, i) => cue(`${key}:${person.id}:${i}`, row.description, row.completed, speakingCue(parseActionItemDescription(row.description).text)))}
      </View>)}
      {spoken ? cue(key + ':spoken', spoken) : null}
      {!people.length && !spoken ? <Text style={text}>Nothing recorded yet.</Text> : null}
    </View>;
  };
  const progress = new Map<string, { original: string; completed?: boolean }>();
  for (const task of ownDone) {
    const original = task.description;
    progress.set(wishIdentity(parseActionItemDescription(original).text), { original, completed: true });
  }
  for (const original of (data.reflection.progress || progressText).split(/\n+/).map(s => s.trim()).filter(Boolean)) {
    const key = wishIdentity(parseActionItemDescription(original).text);
    if (!progress.has(key)) progress.set(key, { original, completed: /^✓/.test(original) ? true : undefined });
  }
  const next = focus?.description || (!hasCheckIn ? reportedWish : '');
  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
    <View style={column}>
      <Text accessibilityRole="header" style={heading}>I helped</Text>
      {helpList('given')}
    </View>
    <View style={column}>
      <Text accessibilityRole="header" style={heading}>My month</Text>
      <View>
        <Text style={subheading}>Last month’s focus</Text>
        {data.previous ? cue('previous', data.previous) : <Text style={text}>No focus saved last month.</Text>}
      </View>
      {progress.size ? <View>
        <Text style={subheading}>Progress</Text>
        {[...progress.values()].map((row, i) => cue(`progress:${i}`, row.original, row.completed, speakingCue(parseActionItemDescription(row.original).text)))}
      </View> : null}
      <View style={{ borderTopWidth: 1, borderColor: '#e9d5ad', paddingTop: 12, gap: 10 }}>
        <Text style={subheading}>Help I received</Text>
        {helpList('received')}
      </View>
    </View>
    <View style={column}>
      <Text accessibilityRole="header" style={heading}>Next month</Text>
      <View>{next ? focusCues(next).map((row, i) => cue(`next:${i}`, next, undefined, row.label)) : <Text style={text}>{selectedText || selectedId ? 'The selected wish was closed or removed. Choose a new focus.' : 'No new focus shared yet.'}</Text>}</View>
    </View>
  </View>;
}
