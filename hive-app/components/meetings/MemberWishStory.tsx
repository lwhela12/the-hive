import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { meetingFocus, compactWishSteps, type StoryWish, type StoryTask } from '../../lib/memberWishStory';
import { parseActionItemDescription } from '../../lib/actionItemDisplay';

type Reflection = { progress?: string; help_received?: string; help_given?: string };
export function MemberWishStory({ communityId, memberId, since, meetingId, selectedId, selectedText, hasCheckIn, reportedWish = '', progressText = '', scale = 1 }: {
  communityId: string; memberId: string; since: string; meetingId: string;
  selectedId?: unknown; selectedText: string; hasCheckIn: boolean;
  reportedWish?: string; progressText?: string; scale?: number;
}) {
  const [data, setData] = useState<{ wishes: StoryWish[]; tasks: StoryTask[]; reflection: Reflection } | null>(null);
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
      pages(() => supabase.from('action_items').select('id, description, assigned_to, related_wish_id, completed, completed_at, created_at')
        .eq('community_id', communityId).or(`related_user_id.eq.${memberId},assigned_to.eq.${memberId}`).is('archived_at', null)
        .order('created_at', { ascending: false }).order('id')),
      (supabase as any).from('meeting_member_reflections').select('progress, help_received, help_given')
        .eq('community_id', communityId).eq('meeting_id', meetingId).eq('user_id', memberId).maybeSingle(),
    ]).then(([wishes, tasks, reflection]) => {
      if (reflection.error) throw reflection.error;
      if (active) setData({ wishes, tasks, reflection: reflection.data ?? {} });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [communityId, memberId, meetingId, retry]);
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
  const steps = compactWishSteps(data.tasks, focus?.id, since);
  const update = data.reflection.progress || progressText;
  return <View style={{ gap: 20 * scale }}>
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={heading}>{hasCheckIn || reportedWish ? 'Tonight’s focus' : 'Last saved focus'}</Text>
      <Text style={{ ...text, fontSize: 24 * scale, lineHeight: 33 * scale }}>{focus?.description || (!hasCheckIn ? reportedWish : '') || (selectedText || selectedId ? 'The selected wish was closed or removed. Choose a new focus.' : 'What would you like help with tonight?')}</Text>
    </View>
    <View style={{ gap: 6 }}>
      <Text accessibilityRole="header" style={heading}>Progress &amp; thanks</Text>
      <Text style={text}>{update || (steps.completed ? `${steps.completed} linked ${steps.completed === 1 ? 'step' : 'steps'} checked off since our last meeting.` : 'What moved forward? Who helped?')}</Text>
      {data.reflection.help_received ? <Text style={text}>Help received: {data.reflection.help_received}</Text> : null}
      {data.reflection.help_given ? <Text style={text}>Help given: {data.reflection.help_given}</Text> : null}
    </View>
    {steps.next ? <View style={{ gap: 6 }}>
      <Text accessibilityRole="header" style={heading}>Next step</Text>
      <Text style={text}>{parseActionItemDescription(steps.next.description).text}</Text>
      {steps.next && steps.next.helpers.size > 1 ? <Text style={{ ...heading, fontSize: 14 * scale }}>{steps.next.helpers.size} people have this step on their list.</Text> : null}
    </View> : null}
  </View>;
}
