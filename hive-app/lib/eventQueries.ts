import { supabase } from './supabase';
import { queryKeys } from './queryClient';
import type { Event } from '../types';

/** One definition for both prefetch and the screen that consumes this cache. */
export function communityEventsQueryOptions(communityId: string, today: string) {
  return {
    queryKey: queryKeys.events(communityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .or(`event_date.gte.${today},end_date.gte.${today}`)
        .eq('community_id', communityId)
        .or('status.is.null,status.eq.scheduled')
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data as Event[]) || [];
    },
    enabled: !!communityId,
    staleTime: 10 * 60 * 1000,
  } as const;
}
