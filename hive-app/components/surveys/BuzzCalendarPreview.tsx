import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { buzzCalendarItems, eligibleSurveyEvent, surveyCalendarWindow, surveyEventVisibilityLabel, type BuzzCalendarItem } from '../../lib/buzzCalendar';
import { formatDateShort, formatTimeRange } from '../../lib/dateUtils';
import { canShareEventDetailsOnHiveWide, isInvitedToEvent } from '../../lib/eventDisplay';
import { pacificDay } from '../../supabase/functions/_shared/upcomingEvents';

export function BuzzCalendarPreview() {
  const { profile, memberships } = useAuth();
  const today = pacificDay(new Date());
  const eligibleIds = memberships.filter(member => member.community.slug === 'default' || member.community.slug === 'tech')
    .map(member => member.community_id).sort();
  const query = useQuery({
    queryKey: ['buzzCalendarPreview', profile?.id, today, ...eligibleIds], enabled: !!profile && eligibleIds.length > 0, staleTime: 60_000,
    queryFn: async () => {
      // The next visible OG meeting closes this shared survey window. RLS
      // hides another HIVE's private meetings; never infer their details.
      const { data: meetings, error: meetingsError } = await supabase.from('events')
        .select('id,title,event_date,event_time,end_time,event_type,end_date,community_id,visibility,invited_scope,community:communities!inner(slug)')
        .eq('community.slug', 'default')
        .eq('event_type', 'meeting').gte('event_date', today)
        .or('status.is.null,status.eq.scheduled')
        .order('event_date', { ascending: true }).limit(50);
      if (meetingsError) throw meetingsError;
      const visibleMeetings = (meetings ?? []) as BuzzCalendarItem[];
      const window = surveyCalendarWindow(today, visibleMeetings);
      const events: BuzzCalendarItem[] = [];
      for (let offset = 0; ; offset += 500) {
        // RLS limits rows. The client filter below keeps OG/Tech private rows
        // inside their own memberships and shared rows at their stated reach.
        const { data, error } = await supabase.from('events')
          .select('id,title,event_date,event_time,end_time,event_type,end_date,community_id,visibility,invited_scope,community:communities!inner(slug)')
          .or(`event_date.gte.${window.start},end_date.gte.${window.start}`).lte('event_date', window.end)
          .in('community.slug', ['default', 'tech'])
          .or('status.is.null,status.eq.scheduled,status.eq.completed')
          .order('event_date').order('id').range(offset, offset + 499);
        if (error) throw error;
        events.push(...((data ?? []) as BuzzCalendarItem[]));
        if ((data ?? []).length < 500) break;
      }
      return buzzCalendarItems(events.filter(event => eligibleSurveyEvent(event, eligibleIds, window.start, window.end)), []);
    },
  });
  const rows = query.data ?? [];
  return <View style={{ borderTopWidth: 1, borderColor: '#e7d5ad', paddingTop: 14, gap: 8 }}>
    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#514635' }}>Upcoming events:</Text>
    {query.isLoading ? <Text style={{ color: '#706553' }}>Loading the calendar…</Text>
      : query.isError ? <Pressable accessibilityRole="button" onPress={() => query.refetch()} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: '#815e25', fontFamily: 'Lato_700Bold' }}>Couldn’t load the calendar. Try again</Text>
        </Pressable>
      : rows.length === 0 ? <Text style={{ color: '#706553', fontFamily: 'Lato_400Regular' }}>No upcoming events to show.</Text>
      : rows.map(item => <View key={item.id} style={{ gap: 3 }}>
          <Text style={{ color: '#313130', fontFamily: 'Lato_700Bold', fontSize: 13, lineHeight: 19 }}>{item.title}</Text>
          <Text style={{ color: '#706553', fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 18 }}>
            {formatDateShort(item.event_date)}{item.event_time && (canShareEventDetailsOnHiveWide(item) || isInvitedToEvent(item, eligibleIds))
              ? ` · ${formatTimeRange(item.event_time, item.end_time)}` : ''} · Seen by: {surveyEventVisibilityLabel(item)}
          </Text>
        </View>)}
  </View>;
}
