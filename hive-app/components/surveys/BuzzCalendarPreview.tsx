import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { buzzCalendarItems, type BuzzCalendarItem } from '../../lib/buzzCalendar';
import { formatDateShort, formatTimeRange } from '../../lib/dateUtils';

export function BuzzCalendarPreview() {
  const { profile, memberships } = useAuth();
  const month = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }).slice(0, 7);
  const ids = memberships.map(membership => membership.community_id).sort();
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ['buzzCalendarPreview', profile?.id, ids, month], enabled: !!profile && ids.length > 0, staleTime: 60_000,
    queryFn: async () => {
      const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
      const { data: events, error: eventsError } = await supabase
        // This is the editorial/public newsletter runway. It is not a member's
        // calendar, so a visible event is still not eligible unless it was
        // explicitly marked public. Production is an absolute sealed HIVE and
        // is excluded at the query boundary even if an old row were mis-scoped.
        .from('events')
        .select('id,title,event_date,event_time,end_time,event_type,end_date,community_id,visibility,invited_scope,community:communities!inner(slug)')
        .gte('event_date', `${month}-01`).lte('event_date', `${month}-${end}`)
        .eq('visibility', 'public').eq('invited_scope', 'public')
        .neq('community.slug', 'show')
        .or('status.is.null,status.eq.scheduled,status.eq.completed')
        .order('event_date').limit(200);
      if (eventsError) throw eventsError;
      // Birthdays identify members and do not belong in a public editorial
      // queue. The newsletter has no reason to pre-fill private calendar facts.
      return buzzCalendarItems((events ?? []) as BuzzCalendarItem[], [], month);
    },
  });
  const rows = query.data ?? [];
  const shown = expanded ? rows : rows.slice(0, 5);
  return <View style={{ borderTopWidth: 1, borderColor: '#e7d5ad', paddingTop: 14, gap: 8 }}>
    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#514635' }}>Already on the calendar</Text>
    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#706553', lineHeight: 18 }}>Public events already on the calendar — ideas for the Buzz, before the final lineup is chosen.</Text>
    {query.isLoading ? <Text style={{ color: '#706553' }}>Loading the calendar…</Text>
      : query.isError ? <Pressable accessibilityRole="button" onPress={() => query.refetch()} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: '#815e25', fontFamily: 'Lato_700Bold' }}>Couldn’t load the calendar. Try again</Text>
        </Pressable>
      : shown.length === 0 ? <Text style={{ color: '#706553', fontFamily: 'Lato_400Regular' }}>No calendar items to show for this month.</Text>
      : shown.map(item => <View key={item.id} style={{ gap: 3 }}>
          <Text style={{ color: '#313130', fontFamily: 'Lato_700Bold', fontSize: 13, lineHeight: 19 }}>{item.title}</Text>
          <Text style={{ color: '#706553', fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 18 }}>
            {formatDateShort(item.event_date)}{item.event_time ? ` · ${formatTimeRange(item.event_time, item.end_time)}` : ''}
          </Text>
        </View>)}
    {rows.length > 5 && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: '#815e25', fontFamily: 'Lato_700Bold', fontSize: 12 }}>{expanded ? 'Show fewer' : `Show all ${rows.length}`}</Text>
    </Pressable>}
  </View>;
}
