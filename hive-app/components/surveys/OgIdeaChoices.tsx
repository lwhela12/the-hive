import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/showAlert';
import { ideaRanking, toggleIdeaRank } from '../../lib/ideaRanking';

type Kind = 'help' | 'hang';
type Notes = Record<string, unknown> & { ideasMeetingId?: string; helpIdeas?: string; hangIdeas?: string };
const answerKey: Record<Kind, string> = { help: 'q_help_idea_choice', hang: 'q_hang_idea_choice' };
const noteKey: Record<Kind, 'helpIdeas' | 'hangIdeas'> = { help: 'helpIdeas', hang: 'hangIdeas' };

function lines(value: string) {
  return value.split('\n').map(line => line.trim()).filter(Boolean);
}

/** One meeting's choices: Nat curates the short list; each member's answer is saved with that meeting's check-in. */
export function OgIdeaChoices({ communityId, meetingId, canEdit, answers, onSetAnswers }: {
  communityId: string;
  meetingId: string;
  canEdit: boolean;
  answers: Record<string, unknown>;
  onSetAnswers: (patch: Record<string, unknown>) => void;
}) {
  const [notes, setNotes] = useState<Notes>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Kind | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('communities')
      .select('meeting_helper_notes').eq('id', communityId).single();
    if (loadError) throw loadError;
    setNotes(((data?.meeting_helper_notes ?? {}) as Notes));
  }, [communityId]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setEditing(null);
    refresh().catch(() => { if (active) setError('Ideas could not load. Please reopen the check-in.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh, meetingId]);

  const choicesFor = (kind: Kind) => notes.ideasMeetingId === meetingId
    ? lines(notes[noteKey[kind]] ?? '').slice(0, 3) : [];

  const beginEdit = (kind: Kind) => {
    // Previous picks are a starting draft only; they are not sent to this
    // meeting until Nat saves them against its id.
    setDraft(lines(notes[noteKey[kind]] ?? '').slice(0, 3).join('\n'));
    setEditing(kind);
    setError(null);
  };

  const save = async (kind: Kind) => {
    const proposed = lines(draft);
    if (proposed.length > 3) { setError('Choose up to three ideas for this meeting.'); return; }
    if (new Set(proposed.map(item => item.toLocaleLowerCase())).size !== proposed.length) {
      setError('Each idea should appear once.'); return;
    }
    setSaving(true); setError(null);
    try {
      const { data, error: loadError } = await supabase.from('communities')
        .select('meeting_helper_notes').eq('id', communityId).single();
      if (loadError) throw loadError;
      const latest = ((data?.meeting_helper_notes ?? {}) as Notes);
      const next: Notes = {
        ...latest,
        ...(latest.ideasMeetingId === meetingId ? {} : { helpIdeas: '', hangIdeas: '' }),
        ideasMeetingId: meetingId,
        [noteKey[kind]]: proposed.join('\n'),
      };
      const { error: saveError } = await (supabase.from('communities') as any)
        .update({ meeting_helper_notes: next }).eq('id', communityId);
      if (saveError) throw saveError;
      setNotes(next); setEditing(null);
      showAlert('Choices saved', `Your HIVE ${kind === 'help' ? 'Help' : 'Hang'} options are ready for this meeting.`);
    } catch {
      setError('Your choices did not save. Please try again.');
    } finally { setSaving(false); }
  };

  if (loading) return <ActivityIndicator color="#b58b43" />;
  return <View style={{ gap: 14, marginTop: 12, marginBottom: 20 }}>
    <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, color: '#3b3428' }}>Ideas for next month</Text>
    <Text style={{ fontFamily: 'Lato_400Regular', color: '#665c4b' }}>Tap your favorites in order: 1st, 2nd, then 3rd. Rank fewer if you prefer. You can also suggest your own.</Text>
    {(['help', 'hang'] as Kind[]).map(kind => {
      const options = choicesFor(kind);
      const rankingKey = `q_${kind}_idea_ranking`;
      const suggestionKey = `q_${kind}_idea_suggestion`;
      const ranking = ideaRanking(answers[rankingKey], answers[answerKey[kind]]);
      const legacyChoice = typeof answers[answerKey[kind]] === 'string' ? answers[answerKey[kind]] as string : '';
      const custom = typeof answers[suggestionKey] === 'string' ? answers[suggestionKey] as string
        : legacyChoice && !options.includes(legacyChoice) ? legacyChoice : '';
      const rankOption = (option: string) => onSetAnswers({ [rankingKey]: toggleIdeaRank(ranking, option) });
      return <View key={kind} style={{ borderWidth: 1, borderColor: '#e8d6b2', borderRadius: 16, padding: 16, gap: 10, backgroundColor: '#fffdf8' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: '#765b2d' }}>HIVE {kind === 'help' ? 'Help' : 'Hang'}</Text>
          {canEdit && <Pressable accessibilityRole="button" accessibilityLabel={`Edit HIVE ${kind === 'help' ? 'Help' : 'Hang'} choices for this meeting`}
            onPress={() => editing === kind ? setEditing(null) : beginEdit(kind)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#d9c39b' }}>
            <Text style={{ fontFamily: 'Lato_700Bold', color: '#765b2d' }}>{editing === kind ? 'Cancel' : 'Edit choices'}</Text>
          </Pressable>}
        </View>
        {editing === kind ? <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: 'Lato_400Regular', color: '#665c4b' }}>One idea per line, up to three. Review these before sending this month’s check-in.</Text>
          <TextInput accessibilityLabel={`HIVE ${kind === 'help' ? 'Help' : 'Hang'} choices`}
            value={draft} onChangeText={setDraft} multiline placeholder={'First idea\nSecond idea\nThird idea'}
            style={{ minHeight: 104, textAlignVertical: 'top', borderWidth: 1, borderColor: '#d9c39b', borderRadius: 10, padding: 12, color: '#3b3428', backgroundColor: '#fff' }} />
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save(kind)}
            style={{ alignSelf: 'flex-start', borderRadius: 999, backgroundColor: '#b58b43', paddingHorizontal: 18, paddingVertical: 10, opacity: saving ? 0.7 : 1 }}>
            <Text style={{ fontFamily: 'Lato_700Bold', color: '#fff' }}>{saving ? 'Saving…' : 'Save choices'}</Text>
          </Pressable>
        </View> : <>
          {options.length === 0 && <Text style={{ fontFamily: 'Lato_400Regular', color: '#665c4b' }}>
            {canEdit ? 'Add your choices for this meeting, or leave the suggestion box open for members.' : 'No choices posted yet. You can suggest one below.'}
          </Text>}
          {options.map(option => {
            const rank = ranking.findIndex(item => item.toLocaleLowerCase() === option.toLocaleLowerCase());
            return <Pressable key={option} accessibilityRole="button"
              accessibilityLabel={`${rank >= 0 ? `Rank ${rank + 1}` : 'Rank'} ${option}`}
              onPress={() => rankOption(option)}
              style={{ borderWidth: 1, borderColor: rank >= 0 ? '#b58b43' : '#eadfc9', borderRadius: 12, padding: 11, backgroundColor: rank >= 0 ? '#fff2d9' : '#fff', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#765b2d', minWidth: 24 }}>{rank >= 0 ? `${rank + 1}.` : '○'}</Text>
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#51452f', flex: 1 }}>{option}</Text>
            </Pressable>;
          })}
          {ranking.length === 3 && <Text style={{ fontFamily: 'Lato_400Regular', color: '#665c4b', fontSize: 12 }}>Three ranked. Tap one to remove it before adding another.</Text>}
          <TextInput accessibilityLabel={`Suggest your own HIVE ${kind} idea`} value={custom}
            onChangeText={value => {
              const priorWasRanked = custom && ranking.some(item => item.toLocaleLowerCase() === custom.trim().toLocaleLowerCase());
              onSetAnswers({
                [suggestionKey]: value,
                ...(priorWasRanked ? { [rankingKey]: ranking.map(item => item.toLocaleLowerCase() === custom.trim().toLocaleLowerCase() ? value.trim() : item).filter(Boolean) } : {}),
              });
            }} placeholder="Suggest your own idea"
            style={{ borderWidth: 1, borderColor: '#eadfc9', borderRadius: 10, padding: 11, color: '#3b3428', backgroundColor: '#fff' }} />
          {!!custom.trim() && !options.some(option => option.toLocaleLowerCase() === custom.trim().toLocaleLowerCase()) && <Pressable
            accessibilityRole="button" accessibilityLabel={`Rank your HIVE ${kind} suggestion`}
            onPress={() => rankOption(custom.trim())}
            style={{ borderWidth: 1, borderColor: ranking.includes(custom.trim()) ? '#b58b43' : '#eadfc9', borderRadius: 12, padding: 11, backgroundColor: ranking.includes(custom.trim()) ? '#fff2d9' : '#fff' }}>
            <Text style={{ fontFamily: 'Lato_700Bold', color: '#51452f' }}>
              {ranking.includes(custom.trim()) ? `${ranking.indexOf(custom.trim()) + 1}. ` : '○ '}{custom.trim()}
            </Text>
          </Pressable>}
        </>}
      </View>;
    })}
    {error && <Text style={{ color: '#b42318' }}>{error}</Text>}
  </View>;
}
