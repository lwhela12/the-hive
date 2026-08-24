import { supabase } from './supabase';

/**
 * The one create path for calendar events. The Edge Function owns membership,
 * visibility and date-range rules; callers only assemble the form payload.
 */
export async function createCalendarEvent(event: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('create-event', { body: event });
  if (error) throw error;
  return data;
}
