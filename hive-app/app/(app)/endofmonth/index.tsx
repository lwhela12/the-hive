import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/hooks/useAuth';
import { usePageSkin } from '../../../lib/pageSkin';
import { useSurveys, type SurveyAnswers } from '../../../lib/hooks/useSurveys';
import { AppHeader } from '../../../components/navigation/AppHeader';
import { SurveyModal } from '../../../components/surveys/SurveyModal';
import { CheckInHiveCard } from '../../../components/surveys/CheckInHiveCard';
import { CheckInAction } from '../../../components/surveys/CheckInAction';
import { checkInQuestions, PLATE_QUESTION, type MeetingPreview } from '../../../lib/checkInPresentation';
import {
  buildMergedEndOfMonth,
  mergedPreMeetingQuestions,
  splitMergedAnswers,
  type MergedCheckIn,
} from '../../../lib/checkIns';
import { fetchCarryForwardItems } from '../../../lib/hooks/useCarryForwardContext';
import { CARRY_FORWARD_ANSWER_KEY, type CarryForwardItem } from '../../../lib/carryForward';
import { hiveDisplayName, hiveAccent } from '../../../lib/hiveBrand';
import type { Survey, SurveyQuestion } from '../../../types';

/**
 * End of the month: app.the-hive.app/endofmonth
 *
 * One link, everybody, whichever HIVEs you are in. Nat, 2026-09-02: *"we need
 * one singular End of the month check-in survey, cos that's what I'll send out
 * to everyone."*
 *
 * **It draws the survey itself rather than sending you to a HIVE's Home.**
 *
 * The first version handed off to `/hive?openSurveyId=…`, the way the check-in
 * emails do, and Nat found it dead within the hour: *"I copy and pasted this
 * link into a new browser a few times, and every time it just keeps bringing me
 * back here."* Home is a HIVE's page. It waits for a HIVE before it opens
 * anything, and a new browser arrives signed out, lands at HIVE-Wide after
 * login, and waits there forever — Home's own guard even bounces you up to
 * `/hive-wide` first.
 *
 * That was the wrong destination on principle as well as in practice: this
 * check-in belongs to no HIVE (`community_id is null`, migration 225), so
 * routing it through one HIVE's Home was asking a question that has no answer.
 * Nothing here needs a HIVE, so nothing here asks for one.
 */
export default function EndOfMonthScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  /**
   * `?on=2026-09-29` — read this check-in as it will look on a given day.
   *
   * A section that only exists for three days a quarter is a section nobody
   * sees until the three days, which is a bad moment to find out it is wrong.
   * This is the door to looking early, and it changes nothing else: the
   * questions come from the same builder, the answers save to the same rows.
   *
   * Owner-only would be a lie — there is nothing here worth gating. A member
   * who types a date into the address bar sees next quarter's questions
   * slightly early, which is the same thing as reading the survey.
   */
  const { on, from, hive } = useLocalSearchParams<{ on?: string | string[]; from?: string; hive?: string }>();
  const askedDate = Array.isArray(on) ? on[0] : on;
  const returnTo = from === 'meetings' ? '/meetings' : from === 'hive' ? '/hive' : '/hive-wide';
  const requestedHiveSlug = typeof hive === 'string' ? hive : null;
  const originHandled = useRef<string | null>(null);
  /**
   * `useSurveys` NEEDS its arguments, and the failure without them is silent.
   *
   * This called `useSurveys()` bare for its first hour. The query is
   * `enabled: !!communityId`, so with no arguments it never fired — no request,
   * no console error — and `submitResponse` returned "Not authenticated"
   * before touching the database. Every member who filled this in would have
   * been told "Could not save your responses. Please try again", and trying
   * again would never have worked. Caught by an audit before anybody saw it.
   *
   * `communityId` is only for the CACHE KEY and for a HIVE's own check-ins;
   * this survey belongs to no HIVE and `submitResponse` now files it as such
   * whatever HIVE the reader happens to be standing in.
   */
  const { loading: authLoading, profile, communityId, memberships } = useAuth();
  const originMembership = (from === 'meetings' || from === 'hive') && requestedHiveSlug
    ? memberships.find(item => item.community.slug === requestedHiveSlug)
    : null;
  const skin = usePageSkin();
  const { myResponses, submitCheckInOccurrence } =
    useSurveys(communityId ?? undefined, profile?.id);

  const [meetings, setMeetings] = useState<MeetingPreview[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, SurveyAnswers>>({});
  const [todos, setTodos] = useState<Record<string, CarryForwardItem[]>>({});
  const month = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }).slice(0, 7);
  const [survey, setSurvey] = useState<Survey | null>(null);
  /**
   * The check-in as this person sees it today.
   *
   * On most days it is the row exactly as it is stored. In the three days
   * before a quarter or the year ends it also carries a section per HIVE
   * holding that HIVE's season questions — see `buildMergedEndOfMonth`. Nat,
   * 2026-09-04: *"next month, the only 'end of the month' survey avail will
   * also have 'end of the quarter' questions...so it'll be slightly different &
   * then go back to normal."*
   */
  const [merged, setMerged] = useState<MergedCheckIn | null>(null);
  const [state, setState] = useState<'looking' | 'ready' | 'none' | 'broken'>('looking');

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;

    void (async () => {
      // The open HIVE-Wide check-in. Looked UP rather than carried in the
      // address, so next month's row answers the link she has already texted
      // people — an id in a URL is a link that expires quietly.
      /**
       * There is more than one HIVE-Wide check-in now.
       *
       * This used to take the soonest active row with no HIVE, which was safe
       * while End of the month was the only one. The merged "Before we meet"
       * (2026-09-04) also belongs to no HIVE, so the bare query would hand
       * whichever happened to be due first — and this screen would quietly
       * open the wrong check-in. It asks for the one it is named after.
       */
      const { data, error } = await supabase
        .from('surveys')
        .select('*')
        .is('community_id', null)
        .eq('is_active', true)
        .ilike('title', '%end of the month%')
        .order('due_date', { ascending: true })
        .limit(1);

      if (cancelled) return;
      // Not-loaded, empty and failed are three different states, and only one
      // of them gets the reassuring copy. Dropping `error` collapsed a network
      // failure into "nothing has gone wrong", which is the worst of the three
      // things this screen could say.
      if (error) { setState('broken'); return; }
      const found = (data ?? [])[0] as Survey | undefined;
      if (!found) { setState('none'); return; }

      const built = buildMergedEndOfMonth(
        [PLATE_QUESTION, ...checkInQuestions((found.questions ?? []) as SurveyQuestion[], true)],
        memberships.map((m) => ({
          id: m.community_id,
          slug: m.community?.slug ?? null,
          name: m.community?.name ?? null,
        })),
        // The date drives which season is open, and nothing else.
        (() => {
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(askedDate ?? '');
          return match
            ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
            : new Date();
        })(),
      );
      for (const m of memberships) {
        if (!built.sections.some(s => s.communityId === m.community_id)) built.sections.push({
          communityId: m.community_id, slug: m.community?.slug ?? '', name: hiveDisplayName(m.community?.name), questions: [],
        });
      }
      const [{ data: receipts, error: receiptError }, rosters, nextMeetings] = await Promise.all([
        supabase.from('check_in_completions').select('community_id, occurrence, answers')
          .eq('survey_id', found.id).eq('user_id', profile.id).eq('occurrence', `month:${month}`),
        Promise.all(memberships.map(async m => ({ id: m.community_id, items: await fetchCarryForwardItems(m.community_id, profile.id, found) }))),
        supabase.from('events').select('id, community_id, event_date, event_time').eq('event_type', 'meeting').eq('status', 'scheduled').gte('event_date', new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })).in('community_id', memberships.map(m => m.community_id)).order('event_date'),
      ]);
      if (cancelled) return;
      if (receiptError || nextMeetings.error) { setState('broken'); return; }
      setMeetings(nextMeetings.data ?? []);
      setSaved(Object.fromEntries((receipts ?? []).map(r => [r.community_id ?? 'month', r.answers as SurveyAnswers])));
      setTodos(Object.fromEntries(rosters.map(r => [r.id, r.items])));
      setMerged(built);
      // The row that goes on screen. With no season open this is the stored
      // row untouched, which is the point: 361 days a year nothing changes.
      setSurvey(built.sections.length
        ? {
            ...found,
            description: built.description,
            questions: mergedPreMeetingQuestions(built).map((entry) => ({
              ...entry.question,
              id: entry.key,
            })) as SurveyQuestion[],
          }
        : found);
      setState('ready');
    })();

    return () => { cancelled = true; };
  }, [authLoading, profile, memberships, askedDate, month]);

  useEffect(() => {
    if (!isFocused) { originHandled.current = null; return; }
    if (state !== 'ready' || !requestedHiveSlug) return;
    const originKey = `${profile?.id ?? ''}:${requestedHiveSlug}`;
    if (originHandled.current === originKey) return;
    originHandled.current = originKey;
    const membership = memberships.find(item => item.community.slug === requestedHiveSlug);
    if (membership) setSelected(membership.community_id);
  }, [isFocused, memberships, profile?.id, requestedHiveSlug, state]);

  const done = useCallback(() => {
    // Home rather than back: a link out of a text message has nothing behind it.
    router.replace(returnTo as never);
  }, [returnTo, router]);

  const onSubmit = useCallback(async (answers: SurveyAnswers) => {
    if (!survey || !profile || !selected || !merged) return { error: 'No check-in open' };
    // Date previews are read-only; never file future seasonal answers into this month.
    if (askedDate) return { error: 'Preview only' };
    if (selected !== 'month') {
      const own = splitMergedAnswers({ ...merged, personal: [], sections: merged.sections.filter(s => s.communityId === selected) }, Object.fromEntries(Object.entries(answers).map(([key, value]) => [`${selected}:${key}`, value])), [])[0];
      if (!own) return { error: 'No section' };
      if (answers[CARRY_FORWARD_ANSWER_KEY]) own.answers[CARRY_FORWARD_ANSWER_KEY] = answers[CARRY_FORWARD_ANSWER_KEY];
      for (const key of ['q_hd_wish_id', 'q_hd_wish_reach', 'q_hd_wish_mode', 'q_hd_granted_wish_ids']) {
        if (answers[key] !== undefined) own.answers[key] = answers[key];
      }
      const { error } = await submitCheckInOccurrence(survey.id, own.answers as SurveyAnswers, selected, `month:${month}`);
      if (!error) { setSaved(previous => ({ ...previous, [selected]: answers })); }
      return { error };
    }

    /**
     * The month goes in the one HIVE-Wide row; a season goes in its HIVE's.
     *
     * Every reader of a season answer — the deck, a HIVE's own recap — filters
     * by `community_id`, so a section's answers have to land on that HIVE's
     * row. The questions about the month do not: they are one answer for one
     * person, and the Buzz reads them off the row belonging to no HIVE.
     */
    const result = await submitCheckInOccurrence(survey.id, answers, null, `month:${month}`);
    if (result.error) return result;

    setSaved(previous => ({ ...previous, month: answers }));
    return { error: null };
  }, [survey, merged, selected, month, askedDate, submitCheckInOccurrence, profile?.id]);

  if (!isFocused) return null;

  if (state === 'ready' && survey && merged && selected) {
    const part = selected === 'month'
      ? { ...merged, sections: [] }
      : { ...merged, personal: [], sections: merged.sections.filter(s => s.communityId === selected) };
    return (
      <SurveyModal
        key={`${survey.id}:${month}:${selected}`}
        answerCommunityId={selected === 'month' ? null : selected}
        survey={{ ...survey, community_id: originMembership?.community_id ?? survey.community_id,
          description: selected === 'month' ? 'Your month, and anything for the Buzz.' : 'Just this HIVE. Review your commitments, then save.',
          questions: mergedPreMeetingQuestions(part).map(e => e.question) }}
        draftScope={`${profile?.id}:${survey.id}:${askedDate ?? month}:${selected}`}
        initialAnswers={saved[selected]}
        isEditingResponse={!!saved[selected]}
        carryForwardItems={todos[selected] ?? []}
        onSubmit={onSubmit}
        closeLabel="Back to check-ins"
        hiveSlug={originMembership?.community?.slug}
        hiveAccent={hiveAccent(originMembership?.community)}
        onClose={() => setSelected(null)}
      />
    );
  }
  if (state === 'ready' && survey && merged) return (
    <View style={{ flex: 1, backgroundColor: skin.page }}>
      <AppHeader title="End of the month" />
      <ScrollView style={{ backgroundColor: skin.page }} contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Text style={{ color: skin.inkSoft, fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21 }}>{askedDate ? 'Read-only date preview.' : 'One sitting. Review each HIVE, then finish with your month and the Buzz.'}</Text>
        {memberships.map(m => <CheckInHiveCard key={m.community_id} community={m.community}
          event={meetings.find(event => event.community_id === m.community_id)} onPress={() => setSelected(m.community_id)}
          status={saved[m.community_id] ? 'Saved — review' : 'Review commitments'} />)}
        <CheckInAction title="Email settings" role="link" variant="secondary" onPress={() => router.push('/settings' as never)} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <CheckInAction title={saved.month ? 'Your month — saved' : 'Finish: your month + the Buzz'}
            disabled={!askedDate && memberships.some(m => !saved[m.community_id])}
            onPress={() => setSelected('month')} />
          <CheckInAction title="Done for now" variant="secondary" onPress={done} />
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: skin.page, padding: 24 }}>
      {state === 'broken' ? (
        <Text
          style={{ fontFamily: 'Lato_700Bold', fontSize: 14, lineHeight: 21, color: '#c0392b', textAlign: 'center' }}
        >
          This did not load, so it is not telling you there is nothing here. Have another go in a
          minute.
        </Text>
      ) : state === 'none' ? (
        <Text
          style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: skin.inkSoft, textAlign: 'center' }}
        >
          End of the month has not been set up yet.
        </Text>
      ) : (
        <>
          <ActivityIndicator color={skin.gold} />
          <Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft, fontSize: 14, marginTop: 12 }}>
            Opening End of the month…
          </Text>
        </>
      )}
    </View>
  );
}
