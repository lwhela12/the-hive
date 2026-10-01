import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { buzzCalendarItems, eligibleSurveyMeeting, surveyCalendarWindow, type BuzzCalendarItem } from '../../lib/buzzCalendar';
import { formatDateShort, formatTimeRange } from '../../lib/dateUtils';
import { canShareEventDetailsOnHiveWide, isInvitedToEvent } from '../../lib/eventDisplay';
import { eligibleUpcomingEvent, pacificDay } from '../../supabase/functions/_shared/upcomingEvents';

export function BuzzCalendarPreview() {
  const { profile, memberships } = useAuth();
  const today = pacificDay(new Date());
  const eligibleIds = memberships.filter(member => member.community.slug === 'default' || member.community.slug === 'tech')
    .map(member => member.community_id).sort();
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ['buzzCalendarPreview', profile?.id, today, ...eligibleIds], enabled: !!profile && eligibleIds.length > 0, staleTime: 60_000,
    queryFn: async () => {
      // The next visible OG meeting closes this shared survey window. RLS
      // hides another HIVE's private meetings; never infer their details.
      const { data: meetings, error: meetingsError } = await supabase.from('events')
        .select('id,title,event_date,event_time,end_time,event_type,end_date,community_id,visibility,invited_scope,community:communities!inner(slug)')
        .in('community.slug', ['default', 'tech'])
        .eq('event_type', 'meeting').gte('event_date', today)
        .or('status.is.null,status.eq.scheduled')
        .order('event_date', { ascending: true }).limit(50);
      if (meetingsError) throw meetingsError;
      const visibleMeetings = (meetings ?? []) as BuzzCalendarItem[];
      const window = surveyCalendarWindow(today, visibleMeetings);
      const { data: events, error: eventsError } = await supabase
        // Home and the survey share the HIVE-Wide calendar. RLS limits rows,
        // while the explicit scope and source filters guard this shared view.
        .from('events')
        .select('id,title,event_date,event_time,end_time,event_type,end_date,community_id,visibility,invited_scope,community:communities!inner(slug)')
        .or(`event_date.gte.${window.start},end_date.gte.${window.start}`).lte('event_date', window.end)
        .in('visibility', ['all_hives', 'public'])
        .in('community.slug', ['default', 'tech'])
        .or('status.is.null,status.eq.scheduled,status.eq.completed')
        .order('event_date').limit(500);
      if (eventsError) throw eventsError;
      const shared = ((events ?? []) as BuzzCalendarItem[])
        .filter(event => eligibleUpcomingEvent(event, 'hive_wide', window.start, window.end));
      const memberMeetings = visibleMeetings.filter(event => eligibleSurveyMeeting(event, eligibleIds, window.start, window.end));
      return { meetingDate: window.meetingDate, rows: buzzCalendarItems([...shared, ...memberMeetings], []) };
    },
  });
  const rows = query.data?.rows ?? [];
  const shown = expanded ? rows : rows.slice(0, 5);
  return <View style={{ borderTopWidth: 1, borderColor: '#e7d5ad', paddingTop: 14, gap: 8 }}>
    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#514635' }}>Already on the calendar</Text>
    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#706553', lineHeight: 18 }}>
      {query.isError ? 'The upcoming window could not load.' : query.data
        ? (query.data.meetingDate ? `From today through the next OG meeting on ${formatDateShort(query.data.meetingDate)}, including that day.`
          : 'No OG meeting is visible; showing the next 45 days.')
        : 'Loading the upcoming window.'} HIVE-Wide and Public events, plus OG and Tech meetings visible to you. The Buzz uses Public events only.
    </Text>
    {query.isLoading ? <Text style={{ color: '#706553' }}>Loading the calendar…</Text>
      : query.isError ? <Pressable accessibilityRole="button" onPress={() => query.refetch()} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: '#815e25', fontFamily: 'Lato_700Bold' }}>Couldn’t load the calendar. Try again</Text>
        </Pressable>
      : shown.length === 0 ? <Text style={{ color: '#706553', fontFamily: 'Lato_400Regular' }}>No upcoming events or meetings to show.</Text>
      : shown.map(item => <View key={item.id} style={{ gap: 3 }}>
          <Text style={{ color: '#313130', fontFamily: 'Lato_700Bold', fontSize: 13, lineHeight: 19 }}>{item.title}</Text>
          <Text style={{ color: '#706553', fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 18 }}>
            {formatDateShort(item.event_date)}{item.event_time && (canShareEventDetailsOnHiveWide(item) || isInvitedToEvent(item, eligibleIds))
              ? ` · ${formatTimeRange(item.event_time, item.end_time)}` : ''}
          </Text>
        </View>)}
    {rows.length > 5 && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: '#815e25', fontFamily: 'Lato_700Bold', fontSize: 12 }}>{expanded ? 'Show fewer' : `Show all ${rows.length}`}</Text>
    </Pressable>}
  </View>;
}
