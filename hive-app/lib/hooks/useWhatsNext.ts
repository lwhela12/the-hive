import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { hiveDisplayName } from '../hiveBrand';
import { checkInDisplayName, isEndOfMonthCheckInSurvey, isPreMeetingCheckInSurvey } from '../checkIns';

/**
 * What is coming, across every HIVE, in date order.
 *
 * Nat, 2026-09-02, on the standalone page this is a port of: *"what's next is
 * exactly what I was talking about needing... can we just fold that into the
 * HIVE app, somewhere in HIVE-Wide admin? Then we can roll it all into one
 * page."*
 *
 * Nothing here is stored. Every line is worked out from the meeting rows, the
 * open check-ins at the moment the panel opens — the two trackers this replaces
 * both rotted because they had to be fed, and a list
 * that can go stale is a list she will stop trusting.
 *
 * **Overdue does not disappear.** Her whole complaint about her calendar: *"if
 * it's in my calendar that I need to send something out on the first and then I
 * don't get to it on the first, then on the second I don't see it any more."*
 * A row past its date goes red and climbs; it never drops off.
 */

export type WhatsNextItem = {
  key: string;
  /** The date it is FOR, `YYYY-MM-DD`. */
  date: string;
  what: string;
  detail?: string;
  communityId: string | null;
  overdue: boolean;
  destination?: string;
};

const pacificToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

const shift = (dateOnly: string, days: number) =>
  new Date(Date.parse(`${dateOnly}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

const lastDayOfMonth = (dateOnly: string) => {
  const [y, m] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export function useWhatsNext() {
  const { memberships, profile } = useAuth();
  const isOwner = profile?.is_owner === true;
  const [items, setItems] = useState<WhatsNextItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    const hiveIds = memberships.map((m) => m.community_id);
    // An empty string against a uuid column is a hard 400, and the one on the
    // responses query would have made every answered check-in look outstanding.
    if (!profile?.id || hiveIds.length === 0) { setItems([]); setState('ready'); return; }

    const today = pacificToday();
    const found: WhatsNextItem[] = [];
    const push = (item: Omit<WhatsNextItem, 'overdue'>) =>
      found.push({ ...item, overdue: item.date < today });

    try {
      const [meetingsResult, surveysResult, completionsResult] = await Promise.all([
        supabase
          .from('events')
          .select('id, community_id, title, event_date, event_time, end_time, location, meet_link')
          .in('community_id', hiveIds)
          .eq('event_type', 'meeting')
          .eq('status', 'scheduled')
          .gte('event_date', today)
          .order('event_date', { ascending: true }),
        supabase
          .from('surveys')
          .select('id, community_id, title, due_date')
          /**
           * Your HIVEs' check-ins, AND the ones belonging to no HIVE.
           *
           * `.in()` against a nullable column yields NULL rather than true, so
           * a HIVE-Wide row can never come back from it — which meant the two
           * branches below written for exactly that row were unreachable, and
           * Nat's own End of the month never appeared on the list she had just
           * asked to see it on. `.or()` and `.in()` cannot both address one
           * column, so the `in` moves inside the `or`.
           */
          .or(`community_id.in.(${hiveIds.join(',')}),community_id.is.null`)
          .eq('is_active', true)
          .order('due_date', { ascending: true }),
        supabase
          .from('check_in_completions')
          .select('survey_id, community_id, occurrence')
          .eq('user_id', profile.id),
      ]);

      if (meetingsResult.error || surveysResult.error || completionsResult.error) {
        throw meetingsResult.error ?? surveysResult.error ?? completionsResult.error;
      }

      const nameOf = (id: string) =>
        hiveDisplayName(memberships.find((m) => m.community_id === id)?.community?.name);

      const meetings = (meetingsResult.data ?? []) as any[];
      const completions = (completionsResult.data ?? []) as any[];
      const tomorrow = shift(today, 1);

      // ---- Meetings, and the email each one drags behind it.
      for (const meeting of meetings) {
        const name = nameOf(meeting.community_id);
        push({
          key: `meeting_${meeting.id}`,
          date: meeting.event_date,
          what: `${name} meets`,
          detail: [meeting.event_time?.slice(0, 5), meeting.location].filter(Boolean).join(' · '),
          communityId: meeting.community_id,
        });
      }

      // ---- Check-ins that are open and unanswered.
      const surveys = (surveysResult.data ?? []) as any[];
      if (surveys.length) {
        const { data: mine } = await supabase
          .from('survey_responses')
          .select('survey_id')
          .eq('user_id', profile.id)
          .in('survey_id', surveys.map((s) => s.id));
        const answered = new Set((mine ?? []).map((r: any) => r.survey_id));


        for (const survey of surveys) {
          if (!survey.due_date) continue;
          const due = String(survey.due_date).slice(0, 10);
          const isBeforeWeMeet = isPreMeetingCheckInSurvey(survey);
          const isEndOfMonth = isEndOfMonthCheckInSurvey(survey);
          const dueMeetings = isBeforeWeMeet
            ? meetings.filter((meeting) => meeting.event_date === tomorrow
              && (!survey.community_id || meeting.community_id === survey.community_id))
            : [];
          const beforeComplete = isBeforeWeMeet && dueMeetings.length > 0
            && dueMeetings.every((meeting) => completions.some((completion) => (
              completion.survey_id === survey.id
              && completion.community_id === meeting.community_id
              && completion.occurrence === `meeting:${meeting.id}`
            )));
          const monthOccurrence = `month:${today.slice(0, 7)}`;
          const monthComplete = isEndOfMonth
            && [null, ...hiveIds].every((communityId) => completions.some((completion) => (
              completion.survey_id === survey.id
              && completion.community_id === communityId
              && completion.occurrence === monthOccurrence
            )));
          if (isBeforeWeMeet) {
            if (dueMeetings.length === 0 || beforeComplete) continue;
          } else if (isEndOfMonth) {
            if (shift(due, -2) > today || due < today || monthComplete) continue;
          } else if (answered.has(survey.id)) {
            continue;
          }
          /**
           * The survey page is always available from Meetings. What's Next is
           * different: it is attention, so it appears only in the useful window.
           */
          if (!isBeforeWeMeet && !isEndOfMonth && survey.community_id && shift(due, -2) > today) continue;
          push({
            key: `survey_${survey.id}`,
            date: isBeforeWeMeet ? tomorrow : due,
            what: `Your own: ${checkInDisplayName(survey.title)}`,
            detail: survey.community_id
              ? nameOf(survey.community_id)
              : 'Everybody, whichever HIVEs they are in',
            communityId: survey.community_id,
            destination: isBeforeWeMeet
              ? '/beforewemeet'
              : isEndOfMonth
                ? '/endofmonth'
                : survey.community_id
                  ? `/hive?hive=${survey.community_id}`
                  : '/meetings',
          });
        }
      }

      // ---- The end of the month, and the letter it feeds.
      const endOfMonth = lastDayOfMonth(today);
      push({
        key: 'end_of_month',
        date: shift(endOfMonth, -2),
        what: 'End of the month goes out',
        detail: isOwner
          ? 'What you want in the Buzz, and how the month went. The quarterly rides along the same day.'
          : 'A couple of minutes: what you want in the Buzz, and how the month went.',
        communityId: null,
      });
      push({
        key: 'buzz',
        date: shift(endOfMonth, 1),
        what: 'The Buzz goes out',
        detail: isOwner
          ? 'The 1st, every month, one letter for everybody. It recaps the month just gone.'
          : 'The 1st, every month. It recaps the month just gone.',
        communityId: null,
      });

      found.sort((a, b) => {
        // The thing you dropped furthest back sits at the top.
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return a.date.localeCompare(b.date);
      });
      setItems(found);
      setState('ready');
    } catch (error) {
      console.warn('[useWhatsNext] could not build the list:', error);
      // Loud, never an empty list that looks like a clear diary.
      setState('error');
    }
  }, [memberships, profile?.id, isOwner]);

  useEffect(() => { void load(); }, [load]);

  return { items, state, today: pacificToday(), refresh: load };
}
