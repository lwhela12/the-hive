import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { isPreMeetingCheckInSurvey, isEndOfMonthCheckInSurvey } from '../checkIns';

/**
 * Every HIVE, side by side, as facts rather than as a thing to maintain.
 *
 * The grid half of The Things We Know, brought into the app because Nat asked
 * for the whole page here (2026-09-02). Same rule as What's Next: nothing is
 * stored, everything is looked up, so it cannot quietly go stale the way the
 * Task Tracker sheet did.
 *
 * Two things it refuses to do, both learned on the standalone page:
 *
 * **It will not print a number it cannot stand behind.** OG's check-in is one
 * survey row reused every month — 24 answers on it stretching back to May,
 * against ten members. Answers are counted for the period the survey is FOR.
 *
 * **It will not print a zero where nothing was counted.** OG's and Tech's
 * End of the month is a wizard that records "done" in the member's own browser
 * (`the-hive:halfway-done:*`), so nothing reaches us. `null` means not counted,
 * which is a different and much kinder claim than "nobody did it".
 */

export type GridHive = {
  communityId: string;
  name: string;
  members: number;
  nextMeeting: { date: string; time: string | null; location: string | null; onMeet: boolean } | null;
  beforeWeMeet: { answered: number; of: number; due: string } | null;
  endOfMonth: { answered: number; of: number; due: string } | null;
  /** `false` when this HIVE's End of the month leaves no server record at all. */
  endOfMonthCounted: boolean;
  ceiling: string;
  honeyPot: boolean;
};

export type Grid = {
  hives: GridHive[];
  /** Real people, not the columns added up — several are in more than one. */
  peopleAcrossAllHives: number;
  state: 'loading' | 'ready' | 'error';
};

const pacificToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

export function useHiveGrid(): Grid & { refresh: () => Promise<void> } {
  const { memberships } = useAuth();
  const [hives, setHives] = useState<GridHive[]>([]);
  const [people, setPeople] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    const ids = memberships.map((m) => m.community_id);
    if (ids.length === 0) { setHives([]); setState('ready'); return; }
    const today = pacificToday();

    try {
      const [communities, everyMembership, surveys, meetings] = await Promise.all([
        supabase.from('communities')
          .select('id, name, slug, honey_pot_enabled, max_share_scope, meets_on_google_meet')
          .in('id', ids),
        supabase.from('community_memberships').select('user_id, community_id').in('community_id', ids),
        supabase.from('surveys')
          .select('id, community_id, title, due_date')
          .in('community_id', ids).eq('is_active', true),
        supabase.from('events')
          .select('community_id, event_date, event_time, location, meet_link')
          .in('community_id', ids).eq('event_type', 'meeting')
          .gte('event_date', today).order('event_date', { ascending: true }),
      ]);

      if (communities.error || everyMembership.error) {
        throw communities.error ?? everyMembership.error;
      }

      const surveyRows = (surveys.data ?? []) as any[];
      // One count per survey, for the period that survey is FOR. A survey whose
      // answers carry 'default' is a one-off and every row on it counts.
      const counted = new Map<string, number>();
      await Promise.all(surveyRows.map(async (survey) => {
        const { data } = await supabase
          .from('survey_responses').select('response_period').eq('survey_id', survey.id);
        const rows = (data ?? []) as { response_period: string | null }[];
        const oneOff = rows.some((r) => r.response_period === 'default');
        const period = String(survey.due_date).slice(0, 7);
        counted.set(survey.id, oneOff ? rows.length : rows.filter((r) => r.response_period === period).length);
      }));

      const rows: GridHive[] = (communities.data ?? []).map((community: any) => {
        const mine = surveyRows.filter((s) => s.community_id === community.id);
        const memberCount = (everyMembership.data ?? [])
          .filter((m: any) => m.community_id === community.id).length;
        const before = mine.find((s) => isPreMeetingCheckInSurvey(s, community))
          ?? mine.find((s) => /monthly\s+check-?in/i.test(s.title ?? ''));
        const month = mine.find((s) => isEndOfMonthCheckInSurvey(s, community));
        const meeting = (meetings.data ?? []).find((e: any) => e.community_id === community.id) as any;

        return {
          communityId: community.id,
          name: community.name,
          members: memberCount,
          nextMeeting: meeting
            ? {
                date: meeting.event_date,
                time: meeting.event_time?.slice(0, 5) ?? null,
                location: meeting.location ?? null,
                onMeet: !!meeting.meet_link && !!community.meets_on_google_meet,
              }
            : null,
          beforeWeMeet: before
            ? { answered: counted.get(before.id) ?? 0, of: memberCount, due: String(before.due_date).slice(0, 10) }
            : null,
          endOfMonth: month
            ? { answered: counted.get(month.id) ?? 0, of: memberCount, due: String(month.due_date).slice(0, 10) }
            : null,
          // Only a HIVE that files its End of the month into a survey row can
          // be counted. The others tick it off in their own browser.
          endOfMonthCounted: !!month,
          ceiling: community.max_share_scope ?? 'hive',
          honeyPot: community.honey_pot_enabled === true,
        };
      });

      // Sorted the way Nat says them, not the way the database returns them.
      const order = ['default', 'show', 'tech'];
      const slugOf = (id: string) =>
        (communities.data ?? []).find((c: any) => c.id === id)?.slug ?? '';
      rows.sort((a, b) => order.indexOf(slugOf(a.communityId)) - order.indexOf(slugOf(b.communityId)));

      setHives(rows);
      setPeople(new Set((everyMembership.data ?? []).map((m: any) => m.user_id)).size);
      setState('ready');
    } catch (error) {
      console.warn('[useHiveGrid] could not read the grid:', error);
      setState('error');
    }
  }, [memberships]);

  useEffect(() => { void load(); }, [load]);

  return { hives, peopleAcrossAllHives: people, state, refresh: load };
}
