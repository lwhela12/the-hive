import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/hooks/useAuth';
import { SPACE_SKIN } from '../../../lib/pageSkin';
import { useSurveys, type SurveyAnswers } from '../../../lib/hooks/useSurveys';
import { AppHeader } from '../../../components/navigation/AppHeader';
import { EndOfMonthForm } from '../../../components/surveys/EndOfMonthForm';
import { openSeasonSections } from '../../../lib/checkIns';
import { fetchCheckInActionItems } from '../../../lib/checkInActionItems';
import { hasMeaningfulActionItemText } from '../../../lib/actionItemDisplay';
import { applyCarryForwardStatuses, type CarryForwardItem } from '../../../lib/carryForward';
import { restoreEndOfMonthAnswers, saveEndOfMonth, type EndOfMonthAnswers } from '../../../lib/endOfMonth';
import { queryClient } from '../../../lib/queryClient';
import type { Survey } from '../../../types';

type TaskRow = { id: string; description: string; due_date: string | null; related_board_post_id: string | null };
type Loaded = { scope: string; survey: Survey; todos: Record<string, CarryForwardItem[]>; initialAnswers: EndOfMonthAnswers; legacyDraftKeys: string[] };

/** One member page: each HIVE's open tasks, then the shared Buzz contribution. */
export default function EndOfMonthScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { on, from } = useLocalSearchParams<{ on?: string | string[]; from?: string }>();
  const askedDate = Array.isArray(on) ? on[0] : on;
  const returnTo = from === 'meetings' ? '/meetings' : from === 'hive' ? '/hive' : '/hive-wide';
  const { loading: authLoading, profile, communityId, memberships } = useAuth();
  const { submitCheckInOccurrence } = useSurveys(communityId ?? undefined, profile?.id);
  const month = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }).slice(0, 7);
  const memberKey = memberships.map(m => m.community_id).join(',');
  const scope = `${profile?.id ?? ''}:${month}:${askedDate ?? ''}:${memberKey}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const skin = SPACE_SKIN;

  useEffect(() => {
    if (authLoading || !profile || !memberships.length) return;
    let cancelled = false;
    setLoaded(null); setFailure(null);
    (async () => {
      const { data, error } = await supabase.from('surveys').select('*').is('community_id', null)
        .eq('is_active', true).ilike('title', '%end of the month%').order('due_date', { ascending: true }).limit(1);
      if (error) throw error;
      const survey = data?.[0] as Survey | undefined;
      if (!survey) throw new Error('End of the month has not been set up yet.');
      const ids = memberships.map(m => m.community_id);
      const legacyDraftKeys = [...ids, 'month'].map(id => `survey-draft:${profile.id}:${survey.id}:${month}:${id}`);
      const draftKey = `survey-draft:${profile.id}:${survey.id}:${month}:continuous`;
      const [receipts, rosters, storedDrafts, combined] = await Promise.all([
        supabase.from('check_in_completions').select('community_id, answers').eq('survey_id', survey.id)
          .eq('user_id', profile.id).eq('occurrence', `month:${month}`),
        Promise.all(ids.map(async id => {
          const result = await fetchCheckInActionItems<TaskRow>(() => supabase.from('action_items')
            .select('id, description, due_date, related_board_post_id').eq('community_id', id).eq('assigned_to', profile.id)
            .or('completed.is.false,completed.is.null').is('archived_at', null).order('created_at', { ascending: false }).order('id'));
          if (result.error) throw new Error('Your to-dos could not load. Please try again.');
          return [id, result.data.filter(item => hasMeaningfulActionItemText(item.description)).map(item => ({
            id: item.id, type: 'action_item' as const, label: item.description, sourceLabel: 'To-do',
            detail: item.due_date ? `Due ${item.due_date}` : null, relatedBoardPostId: item.related_board_post_id,
          }))] as const;
        })),
        askedDate ? Promise.resolve([]) : AsyncStorage.multiGet(legacyDraftKeys),
        askedDate ? Promise.resolve(null) : AsyncStorage.getItem(draftKey),
      ]);
      if (receipts.error) throw receipts.error;
      const saved = Object.fromEntries((receipts.data ?? []).map(row => [row.community_id ?? 'month', row.answers as SurveyAnswers]));
      const drafts: Record<string, SurveyAnswers> = {};
      storedDrafts.forEach(([, raw], index) => {
        if (!raw) return;
        try { drafts[[...ids, 'month'][index]] = JSON.parse(raw); } catch { /* Preserve a corrupt legacy draft on disk. */ }
      });
      let initialAnswers = restoreEndOfMonthAnswers(ids, saved, drafts);
      if (combined) {
        try {
          const draft = JSON.parse(combined) as EndOfMonthAnswers;
          if (draft.hives && draft.month) initialAnswers = restoreEndOfMonthAnswers(ids,
            { ...initialAnswers.hives, month: initialAnswers.month }, { ...draft.hives, month: draft.month });
        } catch { /* Saved answers remain the fallback. */ }
      }
      if (!cancelled) setLoaded({ scope, survey, todos: Object.fromEntries(rosters), initialAnswers, legacyDraftKeys });
    })().catch(error => {
      if (!cancelled) setFailure(error instanceof Error ? error.message : 'Your check-in could not load. Please try again.');
    });
    return () => { cancelled = true; };
  }, [authLoading, profile?.id, memberKey, month, askedDate, attempt]);

  const current = loaded?.scope === scope ? loaded : null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(askedDate ?? '');
  const previewDate = dateMatch ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])) : new Date();
  const seasonal = openSeasonSections(memberships.map(m => ({ id: m.community_id, slug: m.community.slug, name: m.community.name })), previewDate);
  if (!isFocused) return null;

  return <View style={{ flex: 1, backgroundColor: skin.page }}>
    <AppHeader title="End of the month" tone="wide" onBackPress={() => router.replace(returnTo as never)} />
    {current ? <EndOfMonthForm key={`${scope}:${current.survey.id}`} sections={memberships.map(m => ({
      community: m.community, todos: current.todos[m.community_id] ?? [],
      questions: seasonal.filter(section => section.communityId === m.community_id).flatMap(section => section.questions),
    }))} initialAnswers={current.initialAnswers} draftKey={`survey-draft:${profile!.id}:${current.survey.id}:${month}:continuous`}
      legacyDraftKeys={current.legacyDraftKeys} readOnly={!!askedDate}
      onSave={async answers => {
        if (askedDate || currentScope.current !== scope || !profile) return { error: 'Please reopen this check-in before saving.' };
        const result = await saveEndOfMonth({ answers, communityIds: memberships.map(m => m.community_id), todos: current.todos,
          applyTasks: items => applyCarryForwardStatuses(supabase as never, profile.id, items),
          save: (id, own) => submitCheckInOccurrence(current.survey.id, own, id, `month:${month}`),
        });
        if (!result.error) void queryClient.invalidateQueries({ queryKey: ['carryForwardContext'] });
        return result;
      }} onDone={() => router.replace(returnTo as never)} doneLabel={from === 'meetings' ? 'Back to Meetings' : 'Back to Home'} onEmailSettings={() => router.push('/settings' as never)} />
      : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          {failure ? <><Text style={{ fontFamily: 'Lato_400Regular', color: skin.ink, lineHeight: 21 }}>{failure}</Text>
            <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ backgroundColor: skin.gold, padding: 14, borderRadius: 999 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#313130' }}>Try again</Text>
            </Pressable></> : <><ActivityIndicator color={skin.gold} /><Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft }}>Opening End of the month…</Text></>}
        </View>}
  </View>;
}
