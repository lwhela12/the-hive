import { supabase } from './supabase';
import { invalidateEventQueries } from './queryClient';

/**
 * The one create path for calendar events. The Edge Function owns membership,
 * visibility and date-range rules; callers only assemble the form payload.
 */
export async function createCalendarEvent(event: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('create-event', { body: event });
  if (error) throw error;
  await invalidateEventQueries(typeof event.community_id === 'string' ? event.community_id : null);
  return data;
}
