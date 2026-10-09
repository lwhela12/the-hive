import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { hiveMark } from '../../lib/hiveBrand';
import { TimeInput } from '../ui/TimeInput';
import {
  MEETING_TIME_ANSWER_KEY,
  meetingTimeId,
  meetingTimeLabel,
  normalizeMeetingTimeOptions,
  readMeetingTimeAnswer,
  readMeetingTimePoll,
  type MeetingTimeOption,
} from '../../lib/techMeetingAvailability';

type Notes = Record<string, unknown>;
const emptyOption = (): MeetingTimeOption => ({ date: '', start: '5:00 PM', end: '7:00 PM' });
const blue = hiveMark('tech').accent;
const todayPacific = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

/** Nat sets the ballot while reviewing this meeting's form; members can answer even if they won't attend. */
export function TechMeetingTimes({ communityId, meetingId, canEdit, answers, onSetAnswers }: {
  communityId: string;
  meetingId: string;
  canEdit: boolean;
  answers: Record<string, unknown>;
  onSetAnswers: (patch: Record<string, unknown>) => void;
}) {
  const [notes, setNotes] = useState<Notes>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MeetingTimeOption[]>([emptyOption(), emptyOption(), emptyOption()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('communities')
      .select('meeting_helper_notes').eq('id', communityId).single();
    if (loadError) throw loadError;
    setNotes((data?.meeting_helper_notes ?? {}) as Notes);
  }, [communityId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh().catch(() => { if (active) setError('Meeting times could not load. Please reopen the check-in.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh, meetingId]);

  const poll = readMeetingTimePoll(notes, meetingId);
  const answer = readMeetingTimeAnswer(answers[MEETING_TIME_ANSWER_KEY], meetingId)
    ?? { meetingId, choices: {} as Record<string, 'yes' | 'maybe' | 'no'>, favorite: undefined, suggestion: '' };
  const updateAnswer = (patch: Partial<typeof answer>) => onSetAnswers({
    [MEETING_TIME_ANSWER_KEY]: { ...answer, ...patch },
  });

  const beginEdit = () => {
    setDraft(poll?.options.length ? poll.options.map(item => ({ ...item })) : [emptyOption(), emptyOption(), emptyOption()]);
    setEditing(true);
    setError(null);
  };

  const updateDraft = (index: number, patch: Partial<MeetingTimeOption>) => setDraft(previous =>
    previous.map((item, at) => at === index ? { ...item, ...patch } : item));

  const save = async () => {
    if (draft.length < 3 || draft.length > 5) { setError('Add 3 to 5 possible times.'); return; }
    const options = normalizeMeetingTimeOptions(draft);
    if (options.length !== draft.length) { setError('Check every date and time. Use a future date and an end time after the start.'); return; }
    if (options.some(option => option.date <= todayPacific())) {
      setError('Choose dates after today.'); return;
    }
    if (new Set(options.map(meetingTimeId)).size !== options.length) { setError('Each date and start time should appear once.'); return; }
    setSaving(true); setError(null);
    try {
      const { data, error: loadError } = await supabase.from('communities')
        .select('meeting_helper_notes').eq('id', communityId).single();
      if (loadError) throw loadError;
      const next: Notes = {
        ...((data?.meeting_helper_notes ?? {}) as Notes),
        techMeetingTimePoll: { meetingId, options },
      };
      const { error: saveError } = await (supabase.from('communities') as any)
        .update({ meeting_helper_notes: next }).eq('id', communityId);
      if (saveError) throw saveError;
      setNotes(next);
      setEditing(false);
    } catch {
      setError('The times did not save. Please try again.');
    } finally { setSaving(false); }
  };

  if (loading) return <ActivityIndicator color={blue} />;
  if (!poll && !canEdit) return null;

  return <View style={{ marginTop: 20, marginBottom: 20, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#b7d4eb', backgroundColor: '#f8fbff', gap: 12 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, color: '#183b5f' }}>When could you meet next?</Text>
      {canEdit && <Pressable accessibilityRole="button" onPress={() => editing ? setEditing(false) : beginEdit()}
        style={{ borderWidth: 1, borderColor: '#9dc5e4', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', color: blue }}>{editing ? 'Cancel' : poll ? 'Edit times' : 'Add times'}</Text>
      </Pressable>}
    </View>
    {editing ? <>
      <Text style={{ fontFamily: 'Lato_400Regular', color: '#4c6072' }}>Add 3 to 5 options before sending this check-in. Times are Pacific.</Text>
      {draft.map((option, index) => <View key={index} style={{ gap: 8, borderWidth: 1, borderColor: '#d5e6f2', borderRadius: 12, padding: 11, backgroundColor: '#fff' }}>
        <Text style={{ fontFamily: 'Lato_700Bold', color: blue }}>Option {index + 1}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {Platform.OS === 'web' ? <input aria-label={`Option ${index + 1} date`} type="date" value={option.date}
            onChange={event => updateDraft(index, { date: event.target.value })}
            style={{ minHeight: 44, padding: 10, border: '1px solid #c7dceb', borderRadius: 10, fontSize: 16 }} />
            : <TextInput accessibilityLabel={`Option ${index + 1} date, year month day`} value={option.date}
              onChangeText={date => updateDraft(index, { date })} placeholder="YYYY-MM-DD"
              style={{ minWidth: 138, minHeight: 44, borderWidth: 1, borderColor: '#c7dceb', borderRadius: 10, paddingHorizontal: 10, color: '#183b5f', backgroundColor: '#fff' }} />}
          <TimeInput accessibilityLabel={`Option ${index + 1} start time`} value={option.start} onChangeText={start => updateDraft(index, { start })} style={{ width: 122 }} />
          <Text style={{ color: '#4c6072' }}>to</Text>
          <TimeInput accessibilityLabel={`Option ${index + 1} end time`} value={option.end} onChangeText={end => updateDraft(index, { end })} style={{ width: 122 }} />
        </View>
        {draft.length > 3 && <Pressable accessibilityRole="button" onPress={() => setDraft(previous => previous.filter((_, at) => at !== index))}>
          <Text style={{ fontFamily: 'Lato_700Bold', color: blue }}>Remove</Text>
        </Pressable>}
      </View>)}
      {draft.length < 5 && <Pressable accessibilityRole="button" onPress={() => setDraft(previous => [...previous, emptyOption()])}>
        <Text style={{ fontFamily: 'Lato_700Bold', color: blue }}>+ Add another time</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()}
        style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: blue, opacity: saving ? 0.7 : 1 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', color: '#fff' }}>{saving ? 'Saving…' : 'Save times'}</Text>
      </Pressable>
    </> : poll ? <>
      <Text style={{ fontFamily: 'Lato_400Regular', color: '#4c6072' }}>You can answer even if you won’t be on the call. For each time, choose Yes, Maybe, or No. Mark your favorite if you have one.</Text>
      {poll.options.map(option => {
        const id = meetingTimeId(option);
        const status = answer.choices[id];
        return <View key={id} style={{ borderWidth: 1, borderColor: '#d5e6f2', borderRadius: 12, padding: 11, backgroundColor: '#fff', gap: 9 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', color: '#183b5f', fontSize: 16 }}>{meetingTimeLabel(option)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['yes', 'maybe', 'no'] as const).map(value => <Pressable key={value} accessibilityRole="button"
              accessibilityLabel={`${value === 'yes' ? 'Yes' : value === 'maybe' ? 'Maybe' : 'No'} for ${meetingTimeLabel(option)}`}
              accessibilityState={{ selected: status === value }}
              onPress={() => updateAnswer({ choices: { ...answer.choices, [id]: value }, favorite: value === 'no' && answer.favorite === id ? undefined : answer.favorite })}
              style={{ borderRadius: 999, borderWidth: 1, borderColor: status === value ? blue : '#c7dceb', paddingHorizontal: 13, paddingVertical: 8, backgroundColor: status === value ? '#e5f1fb' : '#fff' }}>
              <Text style={{ fontFamily: 'Lato_700Bold', color: blue }}>{value === 'yes' ? 'Yes' : value === 'maybe' ? 'Maybe' : 'No'}</Text>
            </Pressable>)}
            {(status === 'yes' || status === 'maybe') && <Pressable accessibilityRole="button" accessibilityLabel={`Favorite ${meetingTimeLabel(option)}`}
              accessibilityState={{ selected: answer.favorite === id }} onPress={() => updateAnswer({ favorite: answer.favorite === id ? undefined : id })}
              style={{ borderRadius: 999, borderWidth: 1, borderColor: answer.favorite === id ? blue : '#c7dceb', paddingHorizontal: 13, paddingVertical: 8, backgroundColor: answer.favorite === id ? '#e5f1fb' : '#fff' }}>
              <Text style={{ fontFamily: 'Lato_700Bold', color: blue }}>{answer.favorite === id ? '★ Favorite' : '☆ Favorite'}</Text>
            </Pressable>}
          </View>
        </View>;
      })}
      <TextInput accessibilityLabel="Suggest another meeting time" value={answer.suggestion ?? ''}
        onChangeText={suggestion => updateAnswer({ suggestion })} placeholder="Another time that works? (Optional)"
        style={{ minHeight: 44, borderWidth: 1, borderColor: '#c7dceb', borderRadius: 10, paddingHorizontal: 12, color: '#183b5f', backgroundColor: '#fff' }} />
    </> : <Text style={{ fontFamily: 'Lato_400Regular', color: '#4c6072' }}>Add this meeting’s time options before sending the check-in.</Text>}
    {error && <Text style={{ fontFamily: 'Lato_400Regular', color: '#b42318' }}>{error}</Text>}
  </View>;
}
