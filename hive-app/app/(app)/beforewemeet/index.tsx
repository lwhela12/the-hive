import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/hooks/useAuth';
import { usePageSkin } from '../../../lib/pageSkin';
import { useSurveys, type SurveyAnswers } from '../../../lib/hooks/useSurveys';
import { AppHeader } from '../../../components/navigation/AppHeader';
import { LegacyCheckInAnswers } from '../../../components/surveys/LegacyCheckInAnswers';
import { SurveyModal } from '../../../components/surveys/SurveyModal';
import { SharedPlate } from '../../../components/surveys/SharedPlate';
import { CheckInHiveCard } from '../../../components/surveys/CheckInHiveCard';
import { checkInQuestions, groupCheckInHives, pacificToday, type MeetingPreview } from '../../../lib/checkInPresentation';
import {
  buildMergedPreMeeting,
  mergedPreMeetingQuestions,
  splitMergedAnswers,
  MERGED_PRE_MEETING_TITLE,
  type MergedPreMeeting,
} from '../../../lib/checkIns';
import { meetingOccurrence } from '../../../supabase/functions/_shared/checkInSession';
import { hiveDisplayName, hiveAccent } from '../../../lib/hiveBrand';
import { fetchCarryForwardItems } from '../../../lib/hooks/useCarryForwardContext';
import { CARRY_FORWARD_ANSWER_KEY, type CarryForwardItem } from '../../../lib/carryForward';
import type { Survey, SurveyQuestion } from '../../../types';

/**
 * Before we meet: app.the-hive.app/beforewemeet
 *
 * Nat, 2026-09-04: *"We're going to make 2 check ins: end of the month &
 * 'before the meeting'. I want those to show all the hives people are in, so
 * it doesn't matter if you're in 1 hive or 3, you only get 1 survey at the end
 * of the month & 1 survey the week of meetings & you can look through all of
 * the to do lists & stuff, and update everything."*
 *
 * The sibling of `/endofmonth`, and built the same way: one link, everybody,
 * no HIVE required to open it. Where they differ is that this one is assembled
 * per reader — the personal questions once at the top, then a short section for
 * each HIVE they belong to, carrying that HIVE's own questions and that HIVE's
 * own to-dos.
 *
 * ## Where the questions come from
 *
 * Each HIVE's own pre-meeting survey row, read live. Those rows stay as the
 * question source — they are already the source of truth (OG's exist nowhere
 * else), they are already editable in Admin's survey editor, and keeping them
 * means a question Nat edits shows up here with no deploy. At the October
 * cutover they are switched OFF so they never send or appear on their own; a
 * member sees exactly two check-ins, which is the promise.
 *
 * ## Where the answers go
 *
 * One `survey_responses` row per HIVE, against THIS survey, each carrying that
 * HIVE's answers under their bare ids plus a copy of the personal ones. Every
 * reader that matters — the Arrival Board, each HIVE's deck, `seal-meeting` —
 * already filters answers by `community_id`, so each HIVE's night reads its own
 * row and sees a whole person. See `splitMergedAnswers`, and migration 228 for
 * the uniqueness rule that allows it.
 */
export default function BeforeWeMeetScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { loading: authLoading, profile, communityId, memberships } = useAuth();
  const skin = usePageSkin();
  const { myResponses, submitCheckInOccurrence } = useSurveys(communityId ?? undefined, profile?.id);

  const [plate, setPlate] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState<Record<string, SurveyAnswers>>({});
  const [meetings, setMeetings] = useState<MeetingPreview[]>([]);
  const [saved, setSaved] = useState<Record<string, SurveyAnswers>>({});
  const [row, setRow] = useState<Survey | null>(null);
  const [merged, setMerged] = useState<MergedPreMeeting | null>(null);
  const [todos, setTodos] = useState<CarryForwardItem[]>([]);
  const [todosByHive, setTodosByHive] = useState<Record<string, CarryForwardItem[]>>({});
  const [state, setState] = useState<'looking' | 'ready' | 'none' | 'broken'>('looking');
  const [today, setToday] = useState(pacificToday);
  const [lookingAhead, setLookingAhead] = useState(false);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const scope = `${profile?.id ?? ''}:${memberships.map(m => m.community_id).sort().join(':')}:${today}`;
  const ready = !authLoading && !!profile && state === 'ready' && loadedScope === scope;
  const groups = groupCheckInHives(memberships, meetings, today);

  useEffect(() => {
    setToday(pacificToday());
    const timer = setInterval(() => setToday(pacificToday()), 30_000);
    return () => clearInterval(timer);
  }, [isFocused]);

  const hiveIds = useMemo(
    () => memberships.map((m) => m.community_id).filter(Boolean),
    [memberships],
  );

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;
    setState('looking');
    setLoadedScope(null);
    setSelected(null);
    setReview({});
    setPlate(undefined);
    setTodos([]);
    setTodosByHive({});
    setLookingAhead(false);

    void (async () => {
      // The open merged check-in. Looked UP rather than carried in the address,
      // so next month's row answers the link she has already texted people.
      // Named explicitly: `community_id is null` alone now matches End of the
      // month too, and the soonest-due one is not necessarily this one.
      const [
        { data: rows, error: rowError },
        { data: hiveSurveys, error: hiveError },
        { data: pastMeetings, error: pastError },
        { data: upcoming, error: upcomingError },
      ] =
        await Promise.all([
          supabase
            .from('surveys')
            .select('*')
            .is('community_id', null)
            .eq('is_active', true)
            .ilike('title', MERGED_PRE_MEETING_TITLE)
            .order('due_date', { ascending: true })
            .limit(1),
          // Every HIVE's own pre-meeting questions, live.
          supabase
            .from('surveys')
            .select('id, community_id, title, questions, created_at')
            .in('community_id', hiveIds.length ? hiveIds : ['00000000-0000-0000-0000-000000000000']),
          /**
           * Which HIVEs have already met.
           *
           * A first-night deck is onboarding — it fills your intro, seeds your
           * HummDinger and votes on how the HIVE will run — and it is the wrong
           * list for every meeting after the first. Tech carries both decks:
           * "Before our first meeting" and a recurring one. Nothing was
           * choosing between them by anything but age, so Tech would have been
           * asked to introduce itself again in October.
           */
          supabase
            .from('events')
            .select('community_id')
            .eq('event_type', 'meeting')
            .lt('event_date', today)
            .in('community_id', hiveIds.length ? hiveIds : ['00000000-0000-0000-0000-000000000000']),
          supabase.from('events').select('id, community_id, event_date, event_time')
            .eq('event_type', 'meeting').eq('status', 'scheduled')
            .gte('event_date', today)
            .in('community_id', hiveIds.length ? hiveIds : ['00000000-0000-0000-0000-000000000000'])
            .order('event_date'),
        ]);

      if (cancelled) return;
      // Not-loaded, empty and failed are three different states, and only one
      // of them gets the reassuring copy.
      if (rowError || hiveError || pastError || upcomingError) { setState('broken'); return; }

      const found = (rows ?? [])[0] as Survey | undefined;
      if (!found) { setState('none'); return; }

      /**
       * WHICH OF A HIVE'S ROWS HOLDS ITS PRE-MEETING QUESTIONS.
       *
       * This asked for the first row that was NOT an end-of-month or a season
       * one, which is a coin flip the moment a HIVE has two — and Tech has two:
       * "Before our first meeting" and a retired "Monthly Check-in: POP +
       * Learned". Whichever the database returned first would have decided what
       * Tech's section of the merged check-in asks, and nothing on screen would
       * have said which had won.
       *
       * So it asks POSITIVELY for a pre-meeting title, and takes the newest of
       * them — a HIVE that has designed a second one has designed a
       * replacement. The old negative test stays as the last resort, for a HIVE
       * whose questions live under a title nobody has registered yet.
       */
      const notPreMeeting = /end of the month|halfway|midpoint|quarterly|end-of-year/i;
      const isPreMeetingTitle = /before (our first meeting|we meet)|monthly\s+check-?in/i;
      const isFirstNight = /before our first meeting/i;
      const hasMet = new Set(
        ((pastMeetings ?? []) as { community_id: string }[]).map((row) => row.community_id),
      );
      const questionsFor = (id: string): SurveyQuestion[] => {
        const mine = (hiveSurveys ?? [])
          .filter((s: any) => s.community_id === id)
          .sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
        const pre = mine.filter((s: any) => isPreMeetingTitle.test(String(s.title ?? '')));
        // A HIVE that has met wants the deck for a room that has met. One that
        // has not gets its first night, which is the only time that deck is
        // right — and after that night this flips on its own, with no deploy.
        const wanted = hasMet.has(id)
          ? (pre.find((s: any) => !isFirstNight.test(String(s.title ?? ''))) ?? pre[0])
          : (pre.find((s: any) => isFirstNight.test(String(s.title ?? ''))) ?? pre[0]);
        const chosen = wanted
          ?? mine.find((s: any) => !notPreMeeting.test(String(s.title ?? '')));
        return checkInQuestions((chosen?.questions ?? []) as SurveyQuestion[]);
      };

      const built = buildMergedPreMeeting(
        memberships.map((m) => ({
          id: m.community_id,
          slug: m.community?.slug ?? null,
          name: m.community?.name ?? null,
          questions: questionsFor(m.community_id),
        })),
      );

      if (built.sections.length === 0) { setState('none'); return; }
      const ordered = groupCheckInHives(memberships, (upcoming ?? []) as MeetingPreview[], today);
      const next = [...ordered.prominent, ...ordered.future].map(item => item.event!) as MeetingPreview[];
      const { data: receipts, error: receiptError } = await supabase.from('check_in_completions')
        .select('community_id, occurrence, answers').eq('survey_id', found.id).eq('user_id', profile.id);
      if (cancelled) return;
      if (receiptError) { setState('broken'); return; }
      const hydrated: Record<string, SurveyAnswers> = {};
      for (const event of next) {
        const receipt = receipts?.find(r => r.community_id === event.community_id && r.occurrence === meetingOccurrence(event.id));
        if (receipt) hydrated[event.community_id] = receipt.answers as SurveyAnswers;
      }
      setSaved(hydrated);
      setMeetings(next);
      setRow(found);
      setMerged(built);
      setLoadedScope(scope);
      setState('ready');

      /**
       * Their open to-dos, from every HIVE at once — the half of Nat's ask that
       * is not a question: *"you can look through all of the to do lists &
       * stuff, and update everything."*
       *
       * Each item keeps its HIVE's name on its `sourceLabel`, so a roster
       * covering three HIVEs still says which room each job came out of. A HIVE
       * whose roster fails to load is left out rather than failing the screen —
       * the questions are the point, the roster is the help.
       */
      const rosters = await Promise.all(
        memberships.map(async (m) => {
          try {
            const items = await fetchCarryForwardItems(m.community_id, profile.id, found);
            const where = hiveDisplayName(m.community?.name);
            return {
              communityId: m.community_id,
              slug: (m.community?.slug ?? '').trim().toLowerCase(),
              items: items.map((item: CarryForwardItem) => ({
                ...item,
                sourceLabel: `${where} · ${item.sourceLabel}`,
              })),
            };
          } catch {
            return { communityId: m.community_id, slug: '', items: [] as CarryForwardItem[] };
          }
        }),
      );
      if (cancelled) return;
      /**
       * Grouped under each HIVE's own section heading, not stacked at the top.
       *
       * Walked with three HIVEs on 2026-09-04 and it was fourteen to-do cards
       * before the first question. Nat: *"deff break it up per hive."* The key
       * is the id of the `note` that heads each section, which is what
       * `mergedPreMeetingQuestions` names it.
       */
      const bySection: Record<string, CarryForwardItem[]> = {};
      for (const roster of rosters) {
        if (roster.items.length) bySection[`note_hive_${roster.slug}`] = roster.items;
      }
      setTodos(rosters.flatMap((roster) => roster.items));
      setTodosByHive(bySection);
    })();

    return () => { cancelled = true; };
  }, [authLoading, profile, memberships, hiveIds, today, scope]);

  const done = useCallback(() => {
    router.replace('/hive-wide' as never);
  }, [router]);

  /**
   * The survey handed to the modal is assembled for THIS reader.
   *
   * Its questions carry the scoped keys (`<hive id>:<question id>`) as their
   * ids, so two HIVEs both asking "will we see you" keep their own answers —
   * the collision that would otherwise let one section silently mirror another.
   * `splitMergedAnswers` puts the bare ids back on the way out.
   */
  const forThisReader: Survey | null = useMemo(() => {
    if (!row || !merged || !selected) return null;
    return {
      ...row,
      community_id: selected,
      due_date: meetings.find(m => m.community_id === selected)?.event_date ?? row.due_date,
      description: merged.description,
      questions: mergedPreMeetingQuestions({ ...merged, sections: merged.sections.filter(s => s.communityId === selected) }).map(({ question, key }) => ({
        ...question,
        id: question.id,
      })),
    } as Survey;
  }, [row, merged, selected, meetings]);

  const onSubmit = useCallback(async (answers: SurveyAnswers) => {
    const event = meetings.find(m => m.community_id === selected);
    if (!row || !merged || !selected || !event || !profile) return { error: 'No upcoming meeting' };
    const own = splitMergedAnswers({ ...merged, sections: merged.sections.filter(s => s.communityId === selected) }, Object.fromEntries(Object.entries(answers).map(([key, value]) => [`${selected}:${key}`, value])), [])[0];
    if (!own) return { error: 'No section' };
    // Preserve historic numeric energy; capacity has its own string key.
    for (const id of ['q_energy_level', 'q_energy_mode', 'q_feeling_today', 'q_plate']) {
      const original = review[selected] ?? saved[selected];
      if (original?.[id] !== undefined) own.answers[id] = original[id];
    }
    if (plate !== undefined) own.answers.q_plate = plate;
    if (answers[CARRY_FORWARD_ANSWER_KEY]) own.answers[CARRY_FORWARD_ANSWER_KEY] = answers[CARRY_FORWARD_ANSWER_KEY];
    const { error } = await submitCheckInOccurrence(row.id, own.answers as SurveyAnswers, selected, meetingOccurrence(event.id));
    if (!error) { setSaved(previous => ({ ...previous, [selected]: own.answers as SurveyAnswers })); setReview(previous => { const next = { ...previous }; delete next[selected]; return next; }); }
    return { error };
  }, [row, merged, selected, meetings, profile, submitCheckInOccurrence, plate, saved, review]);

  if (!isFocused) return null;

  if (ready && forThisReader && selected) {
    const mine = review[selected] ?? saved[selected];
    const section = merged?.sections.find(s => s.communityId === selected);
    return (
      <SurveyModal
        key={`${row?.id}:${selected}:${meetings.find(m => m.community_id === selected)?.id}`}
        draftScope={`${profile?.id}:${row?.id}:${selected}:${meetings.find(m => m.community_id === selected)?.id}`}
        survey={forThisReader}
        initialAnswers={mine}
        isEditingResponse={!!mine}
        carryForwardItems={section ? todosByHive[`note_hive_${section.slug}`] ?? [] : []}
        carryForwardSections={section ? { [`note_hive_${section.slug}`]: todosByHive[`note_hive_${section.slug}`] ?? [] } : {}}
        onSubmit={onSubmit}
        closeLabel="Back to check-ins"
        hiveSlug={memberships.find(m => m.community_id === selected)?.community?.slug}
        hiveAccent={hiveAccent(memberships.find(m => m.community_id === selected)?.community)}
        onClose={() => setSelected(null)}
      />
    );
  }

  const renderHive = ({ member, event }: (typeof groups.prominent)[number]) => {
    const section = merged?.sections.find(s => s.communityId === member.community_id);
    return <View key={member.community_id}><CheckInHiveCard community={member.community} event={event}
      disabled={!event || !section} onPress={() => setSelected(member.community_id)}
      status={!section ? 'Check-in questions not available yet' : saved[member.community_id] ? 'Saved — review' : event ? 'Ready to fill in' : 'Date to be confirmed'} />
      {row && profile && <LegacyCheckInAnswers surveyId={row.id} userId={profile.id} communityId={member.community_id} onReview={answers => { setReview(r => ({ ...r, [member.community_id]: answers })); if (event && section) setSelected(member.community_id); }} />}
    </View>;
  };

  if (ready && merged) return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} style={{ backgroundColor: skin.page }}>
      <AppHeader title="Before we meet" tone="wide" />
      {groups.prominent.length > 0 ? <Text style={{ color: skin.ink, fontFamily: 'Lato_700Bold', fontSize: 18 }}>Today & tomorrow</Text> : <Text style={{ color: skin.inkSoft }}>No meetings today or tomorrow.</Text>}
      {groups.prominent.map(renderHive)}
      {groups.future.length > 0 && <>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: lookingAhead }} onPress={() => setLookingAhead(value => !value)} style={{ paddingVertical: 12 }}>
          <Text style={{ color: skin.gold, fontFamily: 'Lato_700Bold' }}>{lookingAhead ? '▾' : '▸'} Looking ahead · Optional ({groups.future.length})</Text>
        </Pressable>
        {lookingAhead && groups.future.map(renderHive)}
      </>}
      {groups.missing.map(renderHive)}
      <SharedPlate scope={`check-in-plate:${profile?.id}:${row?.id}:${meetings.map(m => m.id).sort().join(':')}`} onChange={setPlate} />
      <Pressable accessibilityRole="button" onPress={done}><Text style={{ color: skin.gold }}>Done for now</Text></Pressable>
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: skin.page, padding: 24 }}>
      {state === 'broken' ? (
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, lineHeight: 21, color: '#c0392b', textAlign: 'center' }}>
          This did not load, so it is not telling you there is nothing here. Have another go in a
          minute.
        </Text>
      ) : state === 'none' ? (
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: skin.inkSoft, textAlign: 'center' }}>
          There is no Before we meet check-in open just now. Nothing has gone wrong — it opens in
          the days before your HIVE meets.
        </Text>
      ) : (
        <>
          <ActivityIndicator color={skin.gold} />
          <Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft, fontSize: 14, marginTop: 12 }}>
            Opening Before we meet…
          </Text>
        </>
      )}
    </View>
  );
}
