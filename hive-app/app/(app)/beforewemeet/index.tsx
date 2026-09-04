import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/hooks/useAuth';
import { usePageSkin } from '../../../lib/pageSkin';
import { useSurveys, type SurveyAnswers } from '../../../lib/hooks/useSurveys';
import { SurveyModal } from '../../../components/surveys/SurveyModal';
import {
  buildMergedPreMeeting,
  mergedPreMeetingQuestions,
  splitMergedAnswers,
  MERGED_PRE_MEETING_TITLE,
  type MergedPreMeeting,
} from '../../../lib/checkIns';
import { hiveDisplayName } from '../../../lib/hiveBrand';
import { fetchCarryForwardItems } from '../../../lib/hooks/useCarryForwardContext';
import type { CarryForwardItem } from '../../../lib/carryForward';
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
  const { loading: authLoading, profile, communityId, memberships } = useAuth();
  const skin = usePageSkin();
  const { myResponses, submitPerHiveResponses } = useSurveys(communityId ?? undefined, profile?.id);

  const [row, setRow] = useState<Survey | null>(null);
  const [merged, setMerged] = useState<MergedPreMeeting | null>(null);
  const [todos, setTodos] = useState<CarryForwardItem[]>([]);
  const [state, setState] = useState<'looking' | 'ready' | 'none' | 'broken'>('looking');

  const hiveIds = useMemo(
    () => memberships.map((m) => m.community_id).filter(Boolean),
    [memberships],
  );

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;

    void (async () => {
      // The open merged check-in. Looked UP rather than carried in the address,
      // so next month's row answers the link she has already texted people.
      // Named explicitly: `community_id is null` alone now matches End of the
      // month too, and the soonest-due one is not necessarily this one.
      const [{ data: rows, error: rowError }, { data: hiveSurveys, error: hiveError }] =
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
            .select('id, community_id, title, questions')
            .in('community_id', hiveIds.length ? hiveIds : ['00000000-0000-0000-0000-000000000000']),
        ]);

      if (cancelled) return;
      // Not-loaded, empty and failed are three different states, and only one
      // of them gets the reassuring copy.
      if (rowError || hiveError) { setState('broken'); return; }

      const found = (rows ?? [])[0] as Survey | undefined;
      if (!found) { setState('none'); return; }

      const questionsFor = (id: string): SurveyQuestion[] => {
        const mine = (hiveSurveys ?? []).filter((s: any) => s.community_id === id);
        // The pre-meeting one, not the end-of-month one that lives beside it.
        const pre = mine.find((s: any) => !/end of the month|halfway|midpoint|quarterly|end-of-year/i
          .test(String(s.title ?? '')));
        return ((pre?.questions ?? []) as SurveyQuestion[]);
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
      setRow(found);
      setMerged(built);
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
            return items.map((item: CarryForwardItem) => ({
              ...item,
              id: `${m.community_id}:${item.id}`,
              sourceLabel: `${where} · ${item.sourceLabel}`,
            }));
          } catch {
            return [] as CarryForwardItem[];
          }
        }),
      );
      if (!cancelled) setTodos(rosters.flat());
    })();

    return () => { cancelled = true; };
  }, [authLoading, profile, memberships, hiveIds]);

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
    if (!row || !merged) return null;
    return {
      ...row,
      description: merged.description,
      questions: mergedPreMeetingQuestions(merged).map(({ question, key }) => ({
        ...question,
        id: key,
      })),
    } as Survey;
  }, [row, merged]);

  const onSubmit = useCallback(async (answers: SurveyAnswers) => {
    if (!row || !merged) return { error: 'No check-in open' };
    return submitPerHiveResponses(
      row.id,
      splitMergedAnswers(merged, answers) as { communityId: string; answers: SurveyAnswers }[],
    );
  }, [row, merged, submitPerHiveResponses]);

  if (state === 'ready' && forThisReader) {
    const mine = myResponses.get(forThisReader.id);
    return (
      <SurveyModal
        survey={forThisReader}
        initialAnswers={mine?.answers}
        isEditingResponse={!!mine}
        carryForwardItems={todos}
        onSubmit={onSubmit}
        onClose={done}
      />
    );
  }

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
