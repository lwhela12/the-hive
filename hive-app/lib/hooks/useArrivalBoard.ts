import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import {
  getSurveyAvailableAt,
  getSurveyResponsePeriod,
  isMonthlyCheckInSurvey,
  type Survey,
  type SurveyAnswers,
  type SurveyResponse,
} from './useSurveys';
import { isPreMeetingCheckInSurvey } from '../checkIns';
import { selectActiveArrivalCheckIn } from '../arrivalSurveySelection';

const POLL_INTERVAL_MS = 20 * 1000;

export type ArrivalBoardMember = {
  id: string;
  name: string;
  avatar_url: string | null;
};

export type ArrivalBoardMeeting = {
  event_date: string;
  event_time: string | null;
  end_time?: string | null;
  title: string;
};

export function getTextAnswer(answers: SurveyAnswers, key: string) {
  const value = answers[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function getNumberAnswer(answers: SurveyAnswers, key: string) {
  const value = answers[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function getMonthNameFromPeriod(period?: string | null) {
  const match = (period ?? '').match(/^(\d{4})-(\d{2})$/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
    : new Date();
  return date.toLocaleString('en-US', { month: 'long' });
}

export function formatMeetingDate(meeting: ArrivalBoardMeeting | null) {
  if (!meeting?.event_date) return '';
  const [year, month, day] = meeting.event_date.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
  const date = new Date(year, month - 1, day);
  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return meeting.event_time
    ? `${dateLabel} · ${formatEventTimeRange(meeting.event_time, meeting.end_time)}`
    : dateLabel;
}

// "17:30:00" reads like a stopwatch — render times as "5:30 PM".
export function formatEventTime(raw: string) {
  const [hour, minute] = raw.split(':').map(Number);
  if (!Number.isFinite(hour)) return raw;
  return new Date(2000, 0, 1, hour, minute || 0).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// And when it finishes, if anybody said. The AM/PM is said once when both ends
// share it (Nat 2026-08-21: "i couldnt add window, like 5-7").
export function formatEventTimeRange(start: string, end?: string | null) {
  const startText = formatEventTime(start);
  if (!end) return startText;
  const endText = formatEventTime(end);
  const startPeriod = startText.slice(-2);
  return startPeriod === endText.slice(-2)
    ? `${startText.slice(0, -3)}\u2013${endText}`
    : `${startText}\u2013${endText}`;
}

// "Will we see you at the meeting?" — parsed loosely so copy tweaks to the
// options don't break the logic.
export type MeetingAttendance = 'in_person' | 'remote' | 'missing' | 'unknown';
export function getAttendance(response?: SurveyResponse): MeetingAttendance {
  const raw = String((response?.answers as Record<string, unknown> | undefined)?.q_attendance ?? '').toLowerCase();
  if (!raw) return 'unknown';
  if (raw.includes('miss') || raw.includes("can't") || raw.includes('cant')) return 'missing';
  if (raw.includes('remote') || raw.includes('joining') || raw.includes('zoom')) return 'remote';
  return 'in_person';
}

// Arrival order: first to check in takes the 1 spot, and the order reshuffles
// naturally every meeting. Not-yet-checked-in members trail alphabetically.
export function getCheckInOrder(
  members: ArrivalBoardMember[],
  responsesByUser: Map<string, SurveyResponse>
) {
  const checkedIn = members
    .filter((member) => responsesByUser.has(member.id))
    .sort((a, b) => {
      const aTime = responsesByUser.get(a.id)?.submitted_at ?? '';
      const bTime = responsesByUser.get(b.id)?.submitted_at ?? '';
      return aTime.localeCompare(bTime);
    });
  const notYet = members.filter((member) => !responsesByUser.has(member.id));
  return [...checkedIn, ...notYet];
}

// Energy is answered on a 1–10 scale; show one ⚡ per point so the bolts
// match the number people picked (5 bolts for a "10" read as confusing).
export const ENERGY_DOTS_MAX = 10;
export function getEnergyDots(level: number) {
  return Math.min(ENERGY_DOTS_MAX, Math.max(1, Math.round(level)));
}

export function getLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Live data behind the Arrival Board: community members, the active monthly
 * check-in survey, everyone's response for the current period, and the next
 * scheduled meeting. Shared by the Arrival Board screen and the Meeting
 * Helper deck. Polls every ~20s while `pollingEnabled` (default true) and
 * refreshes when the browser tab regains focus (the TV use case).
 */
export function useArrivalBoard(options: { pollingEnabled?: boolean } = {}) {
  const { pollingEnabled = true } = options;
  const { communityId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [responsePeriod, setResponsePeriod] = useState<string | null>(null);
  const [members, setMembers] = useState<ArrivalBoardMember[]>([]);
  const [responsesByUser, setResponsesByUser] = useState<Map<string, SurveyResponse>>(new Map());
  const [nextMeeting, setNextMeeting] = useState<ArrivalBoardMeeting | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const loadingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!communityId || loadingRef.current) return;
    loadingRef.current = true;

    try {
      const today = getLocalIsoDate(new Date());
      const [surveysRes, membersRes, meetingRes] = await Promise.all([
        supabase
          .from('surveys')
          .select('*')
          /**
           * THIS HIVE'S OWN CHECK-INS, AND THE SHARED ONES.
           *
           * Until 2026-09-04 this asked only for `community_id = <this HIVE>`,
           * which is exactly right while every pre-meeting check-in belonged to
           * a HIVE. The merged "Before we meet" belongs to none of them — one
           * check-in covering every HIVE a member is in — so the moment the
           * per-HIVE rows are switched off at the October cutover, this query
           * would have found nothing and the deck would have opened on meeting
           * night to an empty room with everybody's answers sitting right
           * there. That is the failure this file already carries a scar from
           * once, in the comment above.
           *
           * The RESPONSE query below needs no change at all, which is the whole
           * point of the merged check-in writing one row per HIVE: it still
           * asks for this HIVE's answers by `community_id` and still gets a
           * whole person back.
           */
          .or(`community_id.eq.${communityId},community_id.is.null`)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('community_memberships')
          .select('profiles!user_id(id, name, avatar_url)')
          .eq('community_id', communityId),
        supabase
          .from('events')
          .select('event_date, event_time, end_time, title')
          .eq('community_id', communityId)
          .eq('event_type', 'meeting')
          .gte('event_date', today)
          .or('status.is.null,status.eq.scheduled')
          .order('event_date', { ascending: true })
          .limit(1),
      ]);

      // The room lights up from whichever check-in this HIVE runs before a
      // meeting. OG and Tech have a monthly one; Production has a pre-meeting
      // one with a title of its own, and without this fallback its deck would
      // have opened on Tuesday showing an empty room while every member had
      // in fact checked in.
      const activeSurveys = (surveysRes.data ?? []) as Survey[];
      const activeCheckIn = selectActiveArrivalCheckIn(
        activeSurveys,
        communityId,
        (survey) => isPreMeetingCheckInSurvey(survey) || isMonthlyCheckInSurvey(survey),
      );
      const period = activeCheckIn ? (meetingRes.data?.[0]?.event_date?.slice(0, 7) ?? getSurveyResponsePeriod(activeCheckIn)) : null;

      const memberRows = ((membersRes.data ?? []) as unknown as { profiles: ArrivalBoardMember | ArrivalBoardMember[] | null }[])
        .map((row) => (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles))
        .filter((member): member is ArrivalBoardMember => !!member?.id && !!member.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      /**
       * THE ROOM RESETS AFTER *THIS* HIVE'S MEETING, NOT AFTER THE CHECK-IN'S.
       *
       * Once the meeting day has passed the cards gray out and stay gray until
       * people check in for the next one. That used to be read off the
       * check-in's `due_date`, which was the same date while every HIVE had a
       * check-in of its own.
       *
       * The merged "Before we meet" breaks that: one row covers three HIVEs
       * meeting on three different days, and its due date is the SOONEST of
       * them. In a week where Tech meets Tuesday and another HIVE meets
       * Thursday, Thursday's deck would have opened to a gray room with every
       * answer already in it — the check-in's date had passed, so the board
       * called the cycle over on a night that had not happened yet. Found
       * before the cutover rather than on the night.
       *
       * The meeting query above already asks for THIS HIVE's next meeting from
       * today onward, so an upcoming meeting IS a live cycle. The old rule is
       * kept for a HIVE with nothing on the books, where there is no meeting to
       * read and the check-in's own date is the only date there is.
       */
      const hasUpcomingMeeting = !!meetingRes.data?.[0];
      const meetingDayIso = activeCheckIn?.due_date
        ? getLocalIsoDate(new Date(new Date(activeCheckIn.due_date).getTime() - 12 * 60 * 60 * 1000))
        : null;
      const cycleOver = hasUpcomingMeeting
        ? false
        : (!!meetingDayIso && today > meetingDayIso);

      const byUser = new Map<string, SurveyResponse>();
      if (activeCheckIn && period && !cycleOver) {
        const { data: responseRows } = await supabase
          .from('survey_responses')
          .select('*')
          .eq('survey_id', activeCheckIn.id)
          .eq('community_id', communityId);

        // Legacy responses may not carry a response_period; count them for this
        // period only if they were submitted after the check-in window opened.
        const windowOpenedAt = getSurveyAvailableAt(activeCheckIn);
        ((responseRows ?? []) as SurveyResponse[]).forEach((response) => {
          const matchesPeriod = response.response_period
            ? response.response_period === period
            : !windowOpenedAt || new Date(response.submitted_at) >= windowOpenedAt;
          if (!matchesPeriod) return;

          const existing = byUser.get(response.user_id);
          if (!existing || response.submitted_at > existing.submitted_at) {
            byUser.set(response.user_id, response);
          }
        });
      }

      setSurvey(activeCheckIn);
      setResponsePeriod(period);
      setMembers(memberRows);
      setResponsesByUser(byUser);
      setNextMeeting((meetingRes.data?.[0] as ArrivalBoardMeeting | undefined) ?? null);
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.warn('Could not load the Arrival Board', error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Simple + reliable live updates: poll every ~20 seconds while enabled.
  useEffect(() => {
    if (!pollingEnabled) return;
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollingEnabled, refresh]);

  // Refresh whenever the browser tab regains focus (the TV use case).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return {
    loading,
    survey,
    responsePeriod,
    members,
    responsesByUser,
    nextMeeting,
    lastUpdatedAt,
    refresh,
  };
}
