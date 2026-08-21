import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

/**
 * Every HIVE's meeting days, for the HIVE-Wide calendar.
 *
 * Nat's parked idea, her words (2026-08-12): "A genuinely HIVE-Wide calendar,
 * with a coloured bee per HIVE's meeting day." The calendar's whole job is to
 * show ALL the HIVEs' meetings at once — which the ordinary events query
 * cannot do, because a meeting event only crosses HIVE lines when somebody
 * marked it all_hives or public, and nearly none are.
 *
 * So this asks the database function `hive_wide_meeting_days` (migration 176)
 * instead. That function is deliberately narrow: it hands back the day, the
 * time, the title and whose meeting it is, and nothing else — never the Meet
 * link, the location or the description, which stay inside their own HIVE.
 * A HIVE whose sharing ceiling is "this HIVE only" sends its title back as
 * null; the calendar still shows its bee and just says "Meeting".
 */
export type HiveWideMeetingDay = {
  id: string;
  /** Null when that HIVE keeps its words at home — say "Meeting" instead. */
  title: string | null;
  /** YYYY-MM-DD, no timezone attached. */
  event_date: string;
  /** HH:MM:SS, or null for a meeting with a day but no time yet. */
  event_time: string | null;
  /** When it finishes, if anybody said (migration 202/203). */
  end_time?: string | null;
  community_id: string;
};

/**
 * One month of meeting days, cached per month so walking back and forth with
 * the arrows costs one fetch per month, not one per tap.
 *
 * `fromDate`/`toDate` are inclusive YYYY-MM-DD strings — the calendar passes
 * the first and last day of the month it is showing.
 */
export function useHiveWideMeetings(fromDate: string, toDate: string) {
  const query = useQuery({
    // An inline key rather than a queryKeys entry: queryKeys lives in
    // lib/queryClient.ts, and nothing ever needs to invalidate this from
    // elsewhere — a meeting schedule changes rarely and the 5-minute staleness
    // is plenty (2026-08-12).
    queryKey: ['hiveWideMeetingDays', fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('hive_wide_meeting_days', {
        from_date: fromDate,
        to_date: toDate,
      });
      if (error) throw error;
      return (data ?? []) as HiveWideMeetingDay[];
    },
  });

  return {
    meetings: query.data ?? [],
    loading: query.isLoading,
    // The calendar draws an empty month rather than an error state — same
    // manner as the rest of HIVE-Wide, where one failed query never blanks
    // the page. The warning is for whoever is debugging, not the member.
    failed: query.isError,
  };
}
