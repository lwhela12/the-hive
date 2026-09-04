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
  /**
   * An open check-in an owner can send out from here, and how many are waiting.
   *
   * Nat, 2026-09-04: *"instead of going to my email and then previewing the
   * email and then going back into the app and previewing the survey, I want
   * everything to just happen in the app."* This is the row that does that —
   * she reads the check-in, presses send, and `open-check-in` mails whoever
   * has not answered. It is the replacement for `holdId`, which is a 6am email
   * asking her to come back to a screen.
   */
  openable?: { surveyId: string; waiting: number; hiveName: string };
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
  /**
   * The ROW is a fact and the fact is the same for everybody — that is Nat's
   * own design for this list. The WORDING is not. Three rows described jobs
   * only she can do, in the second person, to all sixteen members: *"previews
   * to you at 6am, nothing sends until you say go"* would have taught five
   * Production members that their check-in emails wait on somebody's approval.
   */
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
        // Only Nat ever has one of these; for anybody else it comes back empty
        // rather than erroring, which is what should happen.
        supabase
          .from('notifications')
          .select('id, created_at, metadata')
          .eq('user_id', profile.id)
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
          .eq('user_id', profile.id)
          .in('survey_id', surveys.map((s) => s.id));
        const answered = new Set((mine ?? []).map((r: any) => r.survey_id));

        /**
         * AND, for an owner: send it.
         *
         * One row per open check-in that still has somebody waiting, with the
         * number on it. Nat reads the check-in in the app and presses send
         * here; `open-check-in` mails whoever has not answered, each person's
         * own switch deciding, and writes everybody the in-app row.
         *
         * The number is worked out from the same two lists the sender uses —
         * who is in it, and who has answered — so the button cannot promise a
         * different count from the one that goes. It is confirmed against the
         * function's own dry run before anything sends, because a count read
         * when the panel opened is a count that can be minutes old.
         */
        if (isOwner) {
          const [{ data: everyone }, { data: allAnswers }] = await Promise.all([
            supabase.from('community_memberships').select('user_id, community_id'),
            supabase.from('survey_responses')
              .select('survey_id, user_id')
              .in('survey_id', surveys.map((s) => s.id)),
          ]);
          for (const survey of surveys) {
            if (!survey.due_date) continue;
            const due = String(survey.due_date).slice(0, 10);
            // Same window as the member's own row below: not before it opens.
            if (survey.community_id && shift(due, -2) > today) continue;
            const inIt = new Set(
              (everyone ?? [])
                .filter((m: any) => !survey.community_id || m.community_id === survey.community_id)
                .map((m: any) => m.user_id),
            );
            const done = new Set(
              (allAnswers ?? []).filter((r: any) => r.survey_id === survey.id).map((r: any) => r.user_id),
            );
            const waiting = [...inIt].filter((id) => !done.has(id)).length;
            if (waiting === 0) continue;
            push({
              key: `send_${survey.id}`,
              date: shift(due, -2),
              what: `Send it: ${survey.title}`,
              detail: `${waiting} of ${inIt.size} still to answer in ${
                survey.community_id ? nameOf(survey.community_id) : 'every HIVE'
              }.`,
              communityId: survey.community_id,
              openable: {
                surveyId: survey.id,
                waiting,
                hiveName: survey.community_id ? nameOf(survey.community_id) : 'every HIVE',
              },
            });
          }
        }
        for (const survey of surveys) {
          if (answered.has(survey.id)) continue;
          if (!survey.due_date) continue;
          const due = String(survey.due_date).slice(0, 10);
          /**
           * Only once it is actually open — a check-in sitting in your list for
           * a fortnight before it means anything teaches you to ignore the list.
           *
           * **Unless it belongs to no HIVE.** Nat, 2026-09-02: *"should my
           * What's next show what I still need to do?"* It should, and hers was
           * missing the one she had just made. A per-HIVE check-in is created
           * weeks ahead on a schedule, so it waits for its window; a HIVE-Wide
           * one exists because somebody deliberately opened it for everybody
           * and is about to send the link out. Existing IS its window.
           */
          if (survey.community_id && shift(due, -2) > today) continue;
          push({
            key: `survey_${survey.id}`,
            date: due,
            what: `Your own: ${survey.title}`,
            detail: survey.community_id
              ? nameOf(survey.community_id)
              : 'Everybody, whichever HIVEs they are in',
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
