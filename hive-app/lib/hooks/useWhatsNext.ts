import { useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { hiveDisplayName } from '../hiveBrand';
import { checkInDisplayName, isEndOfMonthCheckInSurvey, isPreMeetingCheckInSurvey } from '../checkIns';
import { formatDateRangeShort, formatTimeRange } from '../dateUtils';
import {
  eventAudienceLabel,
  canShareEventDetailsOnHiveWide,
  isInvitedToEvent,
  isUpcomingEventVisibleOnHiveWide,
} from '../eventDisplay';
import { queryKeys } from '../queryClient';
import { whatsNextIsOverdue } from '../whatsNextFormat';

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
  /** The inclusive final day of a multi-day window. */
  endDate?: string | null;
  what: string;
  detail?: string;
  communityId: string | null;
  overdue: boolean;
  destination?: string;
};

/** Admin sees the full cross-HIVE operating list; Home is the shared calendar. */
export type WhatsNextView = 'admin' | 'hiveWideUpcomingEvents';

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

export function useWhatsNext(view: WhatsNextView = 'admin') {
  const { memberships, profile } = useAuth();
  const isOwner = profile?.is_owner === true;
  const profileId = profile?.id ?? '';
  const hiveIds = useMemo(
    () => memberships.map((membership) => membership.community_id).sort(),
    [memberships],
  );
  const today = pacificToday();
  const enabled = !!profileId && hiveIds.length > 0;

  const query = useQuery({
    queryKey: queryKeys.whatsNext(profileId, hiveIds.join(','), isOwner, view),
    enabled,
    staleTime: 0,
    queryFn: async () => {
    const found: WhatsNextItem[] = [];
    const push = (item: Omit<WhatsNextItem, 'overdue'>) =>
      found.push({ ...item, overdue: whatsNextIsOverdue(item.date, today, item.endDate) });

      const [meetingsResult, eventsResult, surveysResult, completionsResult] = await Promise.all([
        supabase
          .from('events')
          .select('id, community_id, title, event_date, event_time, end_time, location, meet_link, visibility, invited_scope, community:communities(name)')
          .eq('event_type', 'meeting')
          .eq('status', 'scheduled')
          .gte('event_date', today)
          .order('event_date', { ascending: true }),
        // Ordinary calendar events belong in the shared diary too. HIVE-Wide
        // previously fetched them and then rendered none of them, so an event
        // could say "Seen by HIVE-Wide" while never appearing in HIVE-Wide's
        // replacement for Upcoming Events. No community filter here: event RLS
        // already returns this person's own-HIVE rows plus anything deliberately
        // opened to all HIVEs. Invitation scope decides whether joining details
        // such as a location may travel with the date.
        supabase
          .from('events')
          .select('id, community_id, title, event_date, end_date, event_time, end_time, location, visibility, invited_scope, event_type, community:communities(name)')
          .eq('event_type', 'custom')
          .or(`event_date.gte.${today},end_date.gte.${today}`)
          .or('status.is.null,status.eq.scheduled')
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true }),
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
          .eq('user_id', profileId),
      ]);

      if (meetingsResult.error || eventsResult.error || surveysResult.error || completionsResult.error) {
        throw meetingsResult.error ?? eventsResult.error ?? surveysResult.error ?? completionsResult.error;
      }

      const nameOf = (id: string, fallbackName?: string | null) =>
        hiveDisplayName(memberships.find((m) => m.community_id === id)?.community?.name ?? fallbackName);

      const meetings = (meetingsResult.data ?? []) as any[];
      const completions = (completionsResult.data ?? []) as any[];
      const tomorrow = shift(today, 1);

      // ---- Meetings, and the email each one drags behind it.
      for (const meeting of meetings) {
        if (view === 'hiveWideUpcomingEvents' && !isUpcomingEventVisibleOnHiveWide(meeting)) continue;
        const name = nameOf(meeting.community_id, meeting.community?.name);
        const canShowDetails = view === 'hiveWideUpcomingEvents'
          ? canShareEventDetailsOnHiveWide(meeting)
          : isInvitedToEvent(meeting, hiveIds);
        push({
          key: `meeting_${meeting.id}`,
          date: meeting.event_date,
          what: `${name} meets`,
          detail: canShowDetails
            ? [
              meeting.event_time ? formatTimeRange(meeting.event_time, meeting.end_time) : null,
              meeting.location,
            ].filter(Boolean).join(' · ')
            : '',
          communityId: meeting.community_id,
        });
      }

      // ---- Calendar events a member can see, across all HIVEs.
      for (const event of (eventsResult.data ?? []) as any[]) {
        if (view === 'hiveWideUpcomingEvents' && !isUpcomingEventVisibleOnHiveWide(event)) continue;
        const canShowDetails = view === 'hiveWideUpcomingEvents'
          ? canShareEventDetailsOnHiveWide(event)
          : isInvitedToEvent(event, hiveIds);
        const sourceName = hiveDisplayName(event.community?.name);
        const timing = event.event_time
          ? formatTimeRange(event.event_time, event.end_time)
          : 'All day';
        const range = event.end_date && event.end_date > event.event_date
          ? formatDateRangeShort(event.event_date, event.end_date)
          : null;
        push({
          key: `event_${event.id}`,
          date: event.event_date,
          endDate: event.end_date,
          what: event.title,
          detail: canShowDetails
            ? [
              eventAudienceLabel(event, sourceName),
              range,
              timing,
              event.location,
            ].filter(Boolean).join(' · ')
            : '',
          communityId: event.community_id,
        });
      }

      // Home's Upcoming Events is only the HIVE-Wide/Public calendar. The
      // broader Admin view below retains check-ins and operational deadlines.
      if (view === 'hiveWideUpcomingEvents') {
        found.sort((a, b) => a.date.localeCompare(b.date));
        return found;
      }

      // ---- Check-ins that are open and unanswered.
      const surveys = (surveysResult.data ?? []) as any[];
      if (surveys.length) {
        const { data: mine } = await supabase
          .from('survey_responses')
          .select('survey_id')
          .eq('user_id', profileId)
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
          ? 'The 1st week of every month, one letter for everybody. It recaps the month just gone.'
          : 'The 1st week of every month. It recaps the month just gone.',
        communityId: null,
      });

      found.sort((a, b) => {
        // The thing you dropped furthest back sits at the top.
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return a.date.localeCompare(b.date);
      });
      return found;
    },
  });

  // Expo keeps routes mounted. Re-entering HIVE-Wide/Admin must therefore ask
  // the canonical rows again; a one-time effect is how edited events looked
  // stale even though the database was already right.
  useFocusEffect(useCallback(() => {
    if (enabled) void query.refetch();
  }, [enabled, query.refetch]));

  return {
    items: query.data ?? [],
    state: !enabled ? 'ready' as const : query.isLoading ? 'loading' as const : query.isError ? 'error' as const : 'ready' as const,
    today,
    refresh: query.refetch,
  };
}
