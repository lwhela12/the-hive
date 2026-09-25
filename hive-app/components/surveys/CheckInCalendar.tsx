import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventDatePicker } from '../ui/DatePicker';
import { TimeInput } from '../ui/TimeInput';
import { EventScopeFields, type EventAudience } from '../events/EventAudienceToggle';
import { formatDateRangeShort, parseAmericanDate } from '../../lib/dateUtils';
import { humanTimeInput, parseTimeInput } from '../../lib/timeInput';
import { createCalendarEvent } from '../../lib/eventMutations';
import { invalidateEventQueries } from '../../lib/queryClient';
import { supabase } from '../../lib/supabase';
import { getLocalIsoDate } from '../../lib/hooks/useArrivalBoard';

type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  end_date: string | null;
  event_time: string | null;
  created_by: string | null;
  visibility: string | null;
  invited_scope: string | null;
};
const ink = '#51452f';
const gold = '#b58b43';
const inputStyle = { borderWidth: 1, borderColor: '#eadfc9', borderRadius: 10, padding: 11, color: ink, backgroundColor: '#fff' } as const;
const dateForInput = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return `${month}-${day}-${year}`;
};
const scope = (value: string | null): EventAudience => value === 'public' || value === 'all_hives' ? value : 'members';

/** The same HIVE calendar used by the old check-in, inside the current before-meeting flow. */
export function CheckInCalendar({ communityId, profileId, firstName, isOwner }: {
  communityId: string;
  profileId: string;
  firstName: string;
  isOwner: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [time, setTime] = useState('');
  const [visibility, setVisibility] = useState<EventAudience>('members');
  const [invited, setInvited] = useState<EventAudience>('members');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('events')
      .select('id,title,event_date,end_date,event_time,created_by,visibility,invited_scope')
      .eq('community_id', communityId).eq('event_type', 'custom')
      .gte('event_date', getLocalIsoDate(new Date()))
      .order('event_date').limit(50);
    if (loadError) throw loadError;
    setEvents((data ?? []) as CalendarEvent[]);
  }, [communityId]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    refresh().catch(() => { if (active) setError('Calendar dates could not load. Try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const startNew = (away: boolean) => {
    setEditing(null); setTitle(away ? `${firstName} out of town` : '');
    setDate(''); setEndDate(''); setAllDay(away); setTime('');
    setVisibility('members'); setInvited('members'); setError(null);
    setFormOpen(true); setExpanded(true);
  };
  const startEdit = (event: CalendarEvent) => {
    setEditing(event); setTitle(event.title); setDate(dateForInput(event.event_date));
    setEndDate(event.end_date ? dateForInput(event.end_date) : '');
    setAllDay(!event.event_time); setTime(humanTimeInput(event.event_time));
    setVisibility(scope(event.visibility)); setInvited(scope(event.invited_scope ?? event.visibility));
    setError(null); setFormOpen(true);
  };
  const save = async () => {
    const eventDate = parseAmericanDate(date);
    const ending = endDate.trim() ? parseAmericanDate(endDate) : null;
    const eventTime = allDay || !time.trim() ? null : parseTimeInput(time);
    if (!title.trim()) return setError('Add a name for this date.');
    if (!eventDate) return setError('Choose a valid start date.');
    if (endDate.trim() && (!ending || ending < eventDate)) return setError('Choose an end date on or after the start.');
    if (!allDay && time.trim() && !eventTime) return setError('Use a time like 7:30 PM.');
    setSaving(true); setError(null);
    try {
      const payload = {
        title: title.trim(), event_date: eventDate,
        end_date: ending && ending > eventDate ? ending : null,
        event_time: eventTime, visibility, invited_scope: invited,
      };
      if (editing) {
        let query = supabase.from('events').update(payload).eq('id', editing.id).eq('community_id', communityId);
        if (!isOwner) query = query.eq('created_by', profileId);
        const { data, error: updateError } = await query.select('id').maybeSingle();
        if (updateError || !data) throw updateError ?? new Error('Event update was not permitted');
        await invalidateEventQueries(communityId);
      } else {
        await createCalendarEvent({ ...payload, community_id: communityId });
      }
      await refresh();
      setFormOpen(false); setEditing(null);
    } catch {
      setError('That date did not save. Your details are still here; please try again.');
    } finally { setSaving(false); }
  };

  return <View style={{ borderWidth: 1, borderColor: '#e8d6b2', borderRadius: 16, padding: 16, backgroundColor: '#fffdf8', marginBottom: 22 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Calendar and away dates"
      accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold', color: '#3b3428', fontSize: 17 }}>Calendar & away dates</Text>
        <Text style={{ fontFamily: 'Lato_400Regular', color: '#665c4b', fontSize: 13, marginTop: 4 }}>
          Add or update HIVE events and dates you’ll be away
        </Text>
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} color={gold} size={18} />
    </Pressable>
    {expanded && <View style={{ marginTop: 14, gap: 10 }}>
      {loading ? <ActivityIndicator color={gold} /> : events.length ? events.map(event => <View key={event.id}
        style={{ borderWidth: 1, borderColor: '#eadfc9', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', color: ink }}>{event.title}</Text>
          <Text style={{ fontFamily: 'Lato_400Regular', color: '#665c4b', fontSize: 12 }}>
            {formatDateRangeShort(event.event_date, event.end_date)}
          </Text>
        </View>
        {(event.created_by === profileId || isOwner) && <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${event.title}`}
          onPress={() => startEdit(event)} style={{ padding: 8 }}><Text style={{ fontFamily: 'Lato_700Bold', color: gold }}>Edit</Text></Pressable>}
      </View>) : <Text style={{ fontFamily: 'Lato_400Regular', color: '#665c4b' }}>No upcoming HIVE dates added yet.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => startNew(false)} style={{ borderWidth: 1, borderColor: gold, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', color: ink }}>Add an event</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => startNew(true)} style={{ borderWidth: 1, borderColor: gold, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', color: ink }}>I’m out of town</Text>
        </Pressable>
      </View>
      {formOpen && <View style={{ borderTopWidth: 1, borderColor: '#eadfc9', paddingTop: 14, gap: 10 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: ink }}>{editing ? 'Update this date' : 'Add to HIVE calendar'}</Text>
        <TextInput accessibilityLabel="Event title" value={title} onChangeText={setTitle} placeholder="Event or away dates" style={inputStyle} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 190 }}><EventDatePicker value={date} onChange={setDate} /></View>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 190 }}><EventDatePicker value={endDate} onChange={setEndDate} label="End date" placeholder="Same day — or pick one" clearable /></View>
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allDay }} onPress={() => setAllDay(value => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: gold, fontSize: 18 }}>{allDay ? '☑' : '□'}</Text><Text style={{ color: ink }}>All day</Text>
        </Pressable>
        {!allDay && <TimeInput value={time} onChangeText={setTime} placeholder="Time (optional) — 7:30 PM" style={inputStyle} />}
        <EventScopeFields visibility={visibility} onVisibilityChange={setVisibility} invited={invited} onInvitedChange={setInvited} allowPublic={isOwner} />
        {error && <Text style={{ color: '#b42318' }}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={{ backgroundColor: gold, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, opacity: saving ? 0.7 : 1 }}>
            <Text style={{ color: '#fff', fontFamily: 'Lato_700Bold' }}>{saving ? 'Saving…' : editing ? 'Save update' : 'Add to calendar'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setFormOpen(false); setError(null); }} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ color: ink, fontFamily: 'Lato_700Bold' }}>Cancel</Text>
          </Pressable>
        </View>
      </View>}
      {error && !formOpen && <Text style={{ color: '#b42318' }}>{error}</Text>}
    </View>}
  </View>;
}
