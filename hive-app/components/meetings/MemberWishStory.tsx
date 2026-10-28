import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { memberWishStory, type StoryTask, type StoryWish } from '../../lib/memberWishStory';
import { parseActionItemDescription } from '../../lib/actionItemDisplay';

import { usePersistentTextDraft } from '../../lib/hooks/usePersistentTextDraft';

type Reflection = { progress: string; help_received: string; help_given: string };
const emptyReflection: Reflection = { progress: '', help_received: '', help_given: '' };

// Shared wishes and task records only. Never read private survey feedback here.
async function pages(query: () => any) {
  const rows: any[] = [];
  for (let start = 0; ; start += 200) {
    const result = await query().range(start, start + 199);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < 200) return rows;
  }
}

export function MemberWishStory({ communityId, memberId, memberName, memberIds, since, reportedWish = '', meetingId, viewerId, canEdit, scale = 1 }: {
  communityId: string; memberId: string; memberName: string; memberIds: string[]; since: string; reportedWish?: string; meetingId: string; viewerId: string; canEdit: boolean; scale?: number;
}) {
  const [data, setData] = useState<{ wishes: StoryWish[]; tasks: StoryTask[] } | null>(null);
  const [previousReflections, setPreviousReflections] = useState<(Reflection & { meeting_id: string; meeting?: { event_date: string } })[]>([]);
  const [reflection, setReflection] = useState<Reflection>(emptyReflection);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const draftKey = `hummdinger:${viewerId}:${communityId}:${meetingId}:${memberId}`;
  const [progress, setProgress, clearProgress] = usePersistentTextDraft(draftKey + ':progress', reflection.progress);
  const [received, setReceived, clearReceived] = usePersistentTextDraft(draftKey + ':received', reflection.help_received);
  const [given, setGiven, clearGiven] = usePersistentTextDraft(draftKey + ':given', reflection.help_given);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedWish, setExpandedWish] = useState<string | null>(null);
  const memberScope = [...memberIds].sort().join(',');
  useEffect(() => {
    let active = true;
    setData(null); setError(false); setHistoryOpen(false); setExpandedWish(null);
    Promise.all([
      pages(() => (supabase as any).from('meeting_member_reflections').select('meeting_id, progress, help_received, help_given, meeting:events!meeting_id(event_date)').eq('community_id', communityId).eq('user_id', memberId).order('updated_at', { ascending: false }).order('meeting_id')),
      pages(() => supabase.from('wishes')
        .select('id, user_id, title, description, status, is_active, is_spotlight, created_at, fulfilled_at, owner:profiles!user_id(name), granters:wish_granters(granter_id, granter:profiles!granter_id(name))')
        .in('user_id', memberScope.split(','))
        .or(`community_id.eq.${communityId},share_scope.eq.all_hives`)
        .in('status', ['public', 'fulfilled', 'replaced'])
        .order('created_at', { ascending: false }).order('id')),
      pages(() => supabase.from('action_items')
        .select('id, description, assigned_to, related_user_id, related_wish_id, completed, completed_at, assignee:profiles!assigned_to(name), recipient:profiles!related_user_id(name)')
        .eq('community_id', communityId).is('archived_at', null)
        .or(`assigned_to.eq.${memberId},related_user_id.eq.${memberId}`)
        .order('created_at', { ascending: false }).order('id')),
    ]).then(([reflectionResult, wishes, tasks]) => {
      if (active) { setReflection(reflectionResult.find(row => row.meeting_id === meetingId) ?? emptyReflection); setPreviousReflections(reflectionResult.filter(row => row.meeting_id !== meetingId)); setData({ wishes, tasks }); }
    })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [communityId, memberId, memberScope, meetingId, retry]);
  useEffect(() => {
    const channel = supabase.channel(`member-story:${meetingId}:${memberId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_member_reflections', filter: `meeting_id=eq.${meetingId}` }, payload => {
        const row = payload.new as Reflection & { user_id?: string };
        if (row.user_id === memberId) setReflection(row);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_items', filter: `community_id=eq.${communityId}` }, payload => {
        const row = payload.new as { assigned_to?: string; related_user_id?: string };
        if (row.assigned_to === memberId || row.related_user_id === memberId) setRetry(n => n + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishes', filter: `user_id=eq.${memberId}` }, () => setRetry(n => n + 1))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [meetingId, memberId, communityId]);
  const saveReflection = async () => {
    if (!canEdit || saving) return;
    setSaving(true); setSaveError(''); setSaved(false);
    try {
      const next = { progress: progress.trim(), help_received: received.trim(), help_given: given.trim() };
      const result = await (supabase as any).from('meeting_member_reflections').upsert({
        ...next, meeting_id: meetingId, community_id: communityId, user_id: memberId,
        recorded_by: viewerId, updated_at: new Date().toISOString(),
      }, { onConflict: 'meeting_id,user_id' }).select('progress, help_received, help_given').single();
      if (result.error || !result.data) throw result.error || new Error('No saved update');
      setReflection(result.data); clearProgress(); clearReceived(); clearGiven(); setEditing(false); setSaved(true);
    } catch { setSaveError('The update did not save. Your draft is kept here; try again.'); }
    finally { setSaving(false); }
  };
  const text = { fontFamily: 'Lato_400Regular', color: '#313130', fontSize: 16 * scale, lineHeight: 24 * scale };
  const quiet = { ...text, fontSize: 13 * scale, lineHeight: 19 * scale, color: '#776c59' };
  const title = { ...text, fontFamily: 'Lato_700Bold', color: '#8b6828', fontSize: 17 * scale };
  const button = { paddingVertical: 10, minHeight: 44, justifyContent: 'center' as const };
  const date = (value?: string | null) => value ? new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const section = (label: string, content: React.ReactNode, prompt?: string) => <View style={{ gap: 6 * scale }}>
    <Text accessibilityRole="header" style={title}>{label}</Text>{content}
    {prompt ? <Text style={{ ...quiet, fontStyle: 'italic' }}>{prompt}</Text> : null}
  </View>;
  if (error) return <View accessibilityRole="alert"><Text style={text}>Wish history and progress couldn’t load.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n+1)} style={button}><Text style={title}>Try again</Text></Pressable></View>;
  if (!data) return <ActivityIndicator accessibilityLabel="Loading wishes and progress" color="#bd9348" />;
  const story = memberWishStory(memberId, data.wishes, data.tasks, since);
  const renderWish = (wish: StoryWish) => <View key={wish.id} style={{ borderWidth: 1, borderColor: '#e8d6b2', borderRadius: 12, padding: 12 * scale, gap: 4 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedWish === wish.id }} onPress={() => setExpandedWish(expandedWish === wish.id ? null : wish.id)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ ...text, fontFamily: 'Lato_700Bold' }}>{wish.title || wish.description}</Text>
      <Text style={quiet}>{wish.status === 'fulfilled' ? `Granted · ${date(wish.fulfilled_at)}` : wish.status === 'replaced' || wish.is_active === false ? `Previous wish · ${date(wish.created_at)}` : `${wish.id === story.spotlight?.id ? 'Main wish' : 'Open wish'} · ${date(wish.created_at)}`}</Text>
    </Pressable>
    {expandedWish === wish.id && wish.title ? <Text style={text}>{wish.description}</Text> : null}
    {wish.granters?.length ? <Text style={quiet}>Help from {wish.granters.map(g => g.granter?.name || 'a HIVE member').join(', ')}</Text> : null}
  </View>;
  const renderTask = (task: StoryTask, context: 'given' | 'received' | 'own' | 'next') => <View key={task.id} style={{ gap: 2, paddingVertical: 4 }}>
    <Text style={text}>{parseActionItemDescription(task.description).text}</Text>
    <Text style={quiet}>{context === 'received' ? `From ${task.assignee?.name || 'a HIVE member'}` : context === 'given' ? `For ${task.recipient?.name || 'a HIVE member'}` : context === 'next' ? `Next step for ${task.assignee?.name || 'a HIVE member'}` : 'Checked off'}{task.completed_at ? ` · ${date(task.completed_at)}` : ''}</Text>
    {task.related_wish_id && data.wishes.find(w => w.id === task.related_wish_id) ? <Text style={quiet}>Wish: {data.wishes.find(w => w.id === task.related_wish_id)?.title || data.wishes.find(w => w.id === task.related_wish_id)?.description}</Text> : null}
  </View>;
  return <View style={{ gap: 22 * scale }}>
    {section('What I wanted', <>
      {story.history.slice(0, historyOpen ? undefined : 2).map(renderWish)}
      {!story.history.length ? <Text style={quiet}>No previous shared wishes recorded.</Text> : null}
      {previousReflections.slice(0, historyOpen ? undefined : 1).map(update => <View key={update.meeting_id} style={{ gap: 4, paddingVertical: 8 }}>
        <Text style={{ ...text, fontFamily: 'Lato_700Bold' }}>Shared at the {date(update.meeting?.event_date)} meeting</Text>
        {update.progress ? <Text style={text}>{update.progress}</Text> : null}
        {update.help_received ? <Text style={text}>Help received: {update.help_received}</Text> : null}
        {update.help_given ? <Text style={text}>Help given: {update.help_given}</Text> : null}
      </View>)}

      {story.history.length > 2 || previousReflections.length > 1 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: historyOpen }} onPress={() => setHistoryOpen(!historyOpen)} style={button}><Text style={title}>{historyOpen ? 'Show less history' : 'See full wish and meeting history'}</Text></Pressable> : null}
    </>, 'What happened with these wishes?')}
    {section('What happened since our last meeting', <>
      {story.ownDone.map(t => renderTask(t, 'own'))}
      {story.received.length ? <View><Text style={{ ...text, fontFamily: 'Lato_700Bold' }}>Help I received</Text>{story.received.map(t => renderTask(t, 'received'))}</View> : null}
      {story.given.length ? <View><Text style={{ ...text, fontFamily: 'Lato_700Bold' }}>Help I gave</Text>{story.given.map(t => renderTask(t, 'given'))}</View> : null}
      {story.granted.map(w => <Text key={w.id} style={text}>{w.user_id === memberId ? 'My wish was granted' : `I helped ${w.owner?.name || 'a HIVE member'}`} — {w.title || w.description}{w.granters?.length ? ` · ${w.granters.map(g => g.granter?.name || 'a HIVE member').join(', ')}` : ''}</Text>)}
      {!story.ownDone.length && !story.given.length && !story.received.length && !story.granted.length ? <Text style={quiet}>No completed work or granted wishes recorded for this cycle yet.</Text> : null}
    </>, 'What else moved forward? Who helped you, and who did you help outside the app?')}
    {section('Shared during this meeting', <>
      {reflection.progress ? <View><Text style={{ ...text, fontFamily: 'Lato_700Bold' }}>Progress</Text><Text style={text}>{reflection.progress}</Text></View> : null}
      {reflection.help_received ? <View><Text style={{ ...text, fontFamily: 'Lato_700Bold' }}>Help I received</Text><Text style={text}>{reflection.help_received}</Text></View> : null}
      {reflection.help_given ? <View><Text style={{ ...text, fontFamily: 'Lato_700Bold' }}>Help I gave</Text><Text style={text}>{reflection.help_given}</Text></View> : null}
      {!reflection.progress && !reflection.help_received && !reflection.help_given ? <Text style={quiet}>What happened outside the app? Add what {memberName} shares with the room.</Text> : null}
      {canEdit && !editing ? <Pressable accessibilityRole="button" style={button} onPress={() => { setEditing(true); setSaved(false); }}><Text style={title}>Add or edit a spoken update</Text></Pressable> : null}
      {editing ? <View style={{ gap: 10 }}>
        <Text style={quiet}>These updates are shared with this HIVE.</Text>
        {([{ label: 'What happened with your wish?', value: progress, set: setProgress }, { label: 'Who helped you, and how?', value: received, set: setReceived }, { label: 'Who did you help, and how?', value: given, set: setGiven }]).map(field => <View key={field.label} style={{ gap: 4 }}><Text style={text}>{field.label}</Text><TextInput accessibilityLabel={field.label} multiline maxLength={5000} value={field.value} onChangeText={field.set} editable={!saving} style={{ ...text, minHeight: 78, textAlignVertical: 'top', borderWidth: 1, borderColor: '#d6bc88', borderRadius: 10, padding: 10, backgroundColor: '#fffdf5' }} /></View>)}
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveReflection()} style={{ ...button, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#f5e7c9', alignSelf: 'flex-start' }}><Text style={title}>{saving ? 'Saving…' : 'Save shared update'}</Text></Pressable>
        {saveError ? <Text accessibilityRole="alert" style={{ ...text, color: '#9b3028' }}>{saveError}</Text> : null}
      </View> : null}
      {saved ? <Text accessibilityLiveRegion="polite" style={quiet}>Shared update saved.</Text> : null}
    </>)}
    {section('What I want now', <>{reportedWish ? <View><Text style={quiet}>Reported for this meeting · shared with admin</Text><Text style={text}>{reportedWish}</Text></View> : null}{story.current.map(renderWish)}{!story.current.length && !reportedWish ? <Text style={quiet}>No open shared wish yet.</Text> : null}</>, 'Is this still what you want, or has your ask changed?')}
    {section('What happens next', <>{story.next.map(t => renderTask(t, 'next'))}{!story.next.length ? <Text style={quiet}>No open next steps recorded for {memberName}.</Text> : null}</>, 'Use the note below to capture tonight’s wish and who will help.')}
  </View>;
}
