import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { hiveDisplayName } from '../hiveBrand';

/**
 * What is coming, across every HIVE, in date order.
 *
 * Nat, 2026-09-02, on the standalone page this is a port of: *"what's next is
 * exactly what I was talking about needing... can we just fold that into the
 * HIVE app, somewhere in HIVE-Wide admin? Then we can roll it all into one
 * page."*
 *
 * Nothing here is stored. Every line is worked out from the meeting rows, the
 * open check-ins and the held sends at the moment the panel opens — the two
 * trackers this replaces both rotted because they had to be fed, and a list
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
  /** A held send only Nat can release. Carries the hold id. */
  holdId?: string;
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
  const [items, setItems] = useState<WhatsNextItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    const hiveIds = memberships.map((m) => m.community_id);
    if (hiveIds.length === 0) { setItems([]); setState('ready'); return; }

    const today = pacificToday();
    const found: WhatsNextItem[] = [];
    const push = (item: Omit<WhatsNextItem, 'overdue'>) =>
      found.push({ ...item, overdue: item.date < today });

    try {
      const [meetingsResult, surveysResult, holdsResult] = await Promise.all([
        supabase
          .from('events')
          .select('id, community_id, title, event_date, event_time, end_time, location, meet_link')
          .in('community_id', hiveIds)
          .eq('event_type', 'meeting')
          .gte('event_date', today)
          .order('event_date', { ascending: true }),
        supabase
          .from('surveys')
          .select('id, community_id, title, due_date')
          .in('community_id', hiveIds)
          .eq('is_active', true)
          .order('due_date', { ascending: true }),
        // Only Nat ever has one of these; for anybody else it comes back empty
        // rather than erroring, which is what should happen.
        supabase
          .from('notifications')
          .select('id, created_at, metadata')
          .eq('user_id', profile?.id ?? '')
          .eq('metadata->>check_in_approval', 'pending')
          .order('created_at', { ascending: false }),
      ]);

      if (meetingsResult.error || surveysResult.error) throw meetingsResult.error ?? surveysResult.error;

      const nameOf = (id: string) =>
        hiveDisplayName(memberships.find((m) => m.community_id === id)?.community?.name);

      // ---- Written, addressed, waiting on her. Always the top of the list.
      for (const row of (holdsResult.data ?? []) as any[]) {
        const meta = row.metadata ?? {};
        const to = Number(meta.check_in_recipients ?? 0);
        push({
          key: `hold_${row.id}`,
          // The day it was HELD, so one waiting three days reads as three days late.
          date: String(row.created_at).slice(0, 10),
          what: `Say go: ${meta.check_in_subject ?? 'a check-in'}`,
          detail: `${to} ${to === 1 ? 'person' : 'people'} in ${meta.check_in_hive_name ?? 'a HIVE'}. Nothing has gone yet.`,
          communityId: meta.check_in_community ?? null,
          holdId: row.id,
        });
      }

      // ---- Meetings, and the email each one drags behind it.
      for (const meeting of (meetingsResult.data ?? []) as any[]) {
        const name = nameOf(meeting.community_id);
        push({
          key: `meeting_${meeting.id}`,
          date: meeting.event_date,
          what: `${name} meets`,
          detail: [meeting.event_time?.slice(0, 5), meeting.location].filter(Boolean).join(' · '),
          communityId: meeting.community_id,
        });
        // Three days counting the meeting day — same sum the sender does.
        const opens = shift(meeting.event_date, -2);
        if (opens >= today) {
          push({
            key: `open_${meeting.id}`,
            date: opens,
            what: `Before we meet opens · ${name}`,
            detail: 'Previews to you at 6am. Nothing sends until you say go.',
            communityId: meeting.community_id,
          });
        }
      }

      // ---- Check-ins that are open and unanswered.
      const surveys = (surveysResult.data ?? []) as any[];
      if (surveys.length) {
        const { data: mine } = await supabase
          .from('survey_responses')
          .select('survey_id')
          .eq('user_id', profile?.id ?? '')
          .in('survey_id', surveys.map((s) => s.id));
        const answered = new Set((mine ?? []).map((r: any) => r.survey_id));
        for (const survey of surveys) {
          if (answered.has(survey.id)) continue;
          const due = String(survey.due_date).slice(0, 10);
          // Only once it is actually open — a check-in sitting in your list for
          // a fortnight before it means anything teaches you to ignore the list.
          if (shift(due, -2) > today) continue;
          push({
            key: `survey_${survey.id}`,
            date: due,
            what: `Your own: ${survey.title}`,
            detail: nameOf(survey.community_id),
            communityId: survey.community_id,
          });
        }
      }

      // ---- The end of the month, and the letter it feeds.
      const endOfMonth = lastDayOfMonth(today);
      push({
        key: 'end_of_month',
        date: shift(endOfMonth, -2),
        what: 'End of the month goes out',
        detail: 'What you want in the Buzz, and how the month went. The quarterly rides along the same day.',
        communityId: null,
      });
      push({
        key: 'buzz',
        date: shift(endOfMonth, 1),
        what: 'The Buzz goes out',
        detail: 'The 1st, every month, one letter for everybody. It recaps the month just gone.',
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
  }, [memberships, profile?.id]);

  useEffect(() => { void load(); }, [load]);

  return { items, state, today: pacificToday(), refresh: load };
}
