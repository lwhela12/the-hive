import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { useDeepTrail } from '../../../lib/hooks/usePathTrail';
import { useAuth } from '../../../lib/hooks/useAuth';
import { SPACE_SKIN } from '../../../lib/pageSkin';
import { useSurveys, type SurveyAnswers } from '../../../lib/hooks/useSurveys';
import { AppHeader } from '../../../components/navigation/AppHeader';
import { EndOfMonthForm } from '../../../components/surveys/EndOfMonthForm';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { openSeasonSections } from '../../../lib/checkIns';
import { fetchCheckInActionItems } from '../../../lib/checkInActionItems';
import { hasMeaningfulActionItemText } from '../../../lib/actionItemDisplay';
import { applyCarryForwardStatuses, type CarryForwardItem } from '../../../lib/carryForward';
import { restoreEndOfMonthAnswers, saveEndOfMonth, type EndOfMonthAnswers } from '../../../lib/endOfMonth';
import { queryClient } from '../../../lib/queryClient';
import { formatDateShort } from '../../../lib/dateUtils';
import { endOfMonthContext, isOctoberNewsletterDeadlineDay } from '../../../lib/endOfMonthPeriod';
import { isOwnMonthEmailPreview, wasOwnMonthEmailSent } from '../../../lib/ownMonthEmail';
import { isQuarterPulseOpen, QUARTER_PULSE_QUESTIONS } from '../../../lib/quarterPulse';
import { showAlert } from '../../../lib/showAlert';
import type { Survey } from '../../../types';

type TaskRow = { id: string; description: string; due_date: string | null; related_board_post_id: string | null };
type Loaded = { scope: string; survey: Survey; todos: Record<string, CarryForwardItem[]>; initialAnswers: EndOfMonthAnswers; legacyDraftKeys: string[] };

/** One member page: each HIVE's open tasks, then the shared Buzz contribution. */
export default function EndOfMonthScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  useDeepTrail([{ label: 'End of the month' }]);
  const { on, from, review } = useLocalSearchParams<{ on?: string | string[]; from?: string; review?: string }>();
  const askedDate = Array.isArray(on) ? on[0] : on;
  const returnTo = from === 'meetings' ? '/meetings' : from === 'hive' ? '/hive' : '/hive-wide';
  const { loading: authLoading, profile, communityId, memberships } = useAuth();
  const { submitCheckInOccurrence } = useSurveys(communityId ?? undefined, profile?.id);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const currentPeriod = endOfMonthContext(now);
  const historicalReview = typeof review === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(review) && review < currentPeriod.period;
  const month = historicalReview ? review : currentPeriod.period;
  const reviewDate = historicalReview ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12) : currentPeriod.reviewDate;
  const activeMemberships = memberships.filter(m => m.community.slug === 'default' || m.community.slug === 'tech');
  const memberKey = activeMemberships.map(m => m.community_id).join(',');
  const scope = `${profile?.id ?? ''}:${month}:${askedDate ?? ''}:${historicalReview}:${memberKey}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mailState, setMailState] = useState<'idle' | 'checking' | 'sending'>('idle');
  const [confirmOwnMail, setConfirmOwnMail] = useState<{ surveyId: string; reviewPeriod: string } | null>(null);
  const mailBusy = useRef(false);
  const skin = SPACE_SKIN;

  useEffect(() => {
    if (authLoading || !profile || !activeMemberships.length) return;
    let cancelled = false;
    setLoaded(null); setFailure(null);
    (async () => {
      const { data, error } = await supabase.from('surveys').select('*').is('community_id', null)
        .eq('is_active', true).ilike('title', '%end of the month%').order('due_date', { ascending: true }).limit(1);
      if (error) throw error;
      const survey = data?.[0] as Survey | undefined;
      if (!survey) throw new Error('End of the month has not been set up yet.');
      const ids = activeMemberships.map(m => m.community_id);
      const ogId = activeMemberships.find(m => m.community.slug === 'default')?.community_id;
      const legacyDraftKeys = [...ids, 'month'].map(id => `survey-draft:${profile.id}:${survey.id}:${month}:${id}`);
      const draftKey = `survey-draft:${profile.id}:${survey.id}:${month}:continuous`;
      const [receipts, rosters, storedDrafts, combined, oldResponses] = await Promise.all([
        supabase.from('check_in_completions').select('community_id, answers').eq('survey_id', survey.id)
          .eq('user_id', profile.id).eq('occurrence', `month:${month}`),
        historicalReview ? Promise.resolve(ids.map(id => [id, []] as const)) : Promise.all(ids.map(async id => {
          const result = await fetchCheckInActionItems<TaskRow>(() => supabase.from('action_items')
            .select('id, description, due_date, related_board_post_id').eq('community_id', id).eq('assigned_to', profile.id)
            .or('completed.is.false,completed.is.null').is('archived_at', null).order('created_at', { ascending: false }).order('id'));
          if (result.error) throw new Error('Your to-dos could not load. Please try again.');
          return [id, result.data.filter(item => hasMeaningfulActionItemText(item.description)).map(item => ({
            id: item.id, type: 'action_item' as const, label: item.description, sourceLabel: 'To-do',
            detail: [`Assigned to ${profile.name}`, item.due_date ? `Due ${formatDateShort(item.due_date)}` : null].filter(Boolean).join(' · '),
            relatedBoardPostId: item.related_board_post_id,
          }))] as const;
        })),
        askedDate || historicalReview ? Promise.resolve([]) : AsyncStorage.multiGet(legacyDraftKeys),
        askedDate || historicalReview ? Promise.resolve(null) : AsyncStorage.getItem(draftKey),
        historicalReview ? supabase.from('survey_responses').select('community_id, answers').eq('survey_id', survey.id)
          .eq('user_id', profile.id).eq('response_period', month) : Promise.resolve({ data: [], error: null }),
      ]);
      if (receipts.error) throw receipts.error;
      if (oldResponses.error) throw oldResponses.error;
      const saved = Object.fromEntries((oldResponses.data ?? []).map(row => [row.community_id ?? 'month', row.answers as SurveyAnswers]));
      for (const row of receipts.data ?? []) saved[row.community_id ?? 'month'] = row.answers as SurveyAnswers;
      if (historicalReview && !saved.month) throw new Error('This completed review is unavailable. Please reopen Home.');
      const drafts: Record<string, SurveyAnswers> = {};
      storedDrafts.forEach(([, raw], index) => {
        if (!raw) return;
        try { drafts[[...ids, 'month'][index]] = JSON.parse(raw); } catch { /* Preserve a corrupt legacy draft on disk. */ }
      });
      let initialAnswers = restoreEndOfMonthAnswers(ids, saved, drafts, ogId);
      if (combined) {
        try {
          const draft = JSON.parse(combined) as EndOfMonthAnswers;
          if (draft.hives && draft.month) initialAnswers = restoreEndOfMonthAnswers(ids,
            { ...initialAnswers.hives, month: initialAnswers.month }, { ...draft.hives, month: draft.month }, ogId);
        } catch { /* Saved answers remain the fallback. */ }
      }
      if (!cancelled) setLoaded({ scope, survey, todos: Object.fromEntries(rosters), initialAnswers, legacyDraftKeys });
    })().catch(error => {
      if (!cancelled) setFailure(error instanceof Error ? error.message : 'Your check-in could not load. Please try again.');
    });
    return () => { cancelled = true; };
  }, [authLoading, profile?.id, memberKey, month, askedDate, historicalReview, attempt]);

  const current = loaded?.scope === scope ? loaded : null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(askedDate ?? '');
  const previewDate = dateMatch ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), 12) : reviewDate;
  const seasonal = openSeasonSections(activeMemberships.map(m => ({ id: m.community_id, slug: m.community.slug, name: m.community.name })), previewDate);

  const previewOwnMail = async () => {
    if (mailBusy.current || !profile?.is_owner || !current || askedDate || historicalReview) return;
    mailBusy.current = true; setMailState('checking');
    try {
      const { data, error } = await supabase.functions.invoke('open-check-in', {
        body: { survey_id: current.survey.id, dry_run: true, self_only: true },
      });
      if (error || !isOwnMonthEmailPreview(data, current.survey.id, month)) {
        showAlert('Nothing sent', 'Your private check-in email is not ready. Please try again later.');
        return;
      }
      setConfirmOwnMail({ surveyId: current.survey.id, reviewPeriod: month });
    } catch {
      showAlert('Nothing sent', 'Could not check your private email right now.');
    } finally {
      mailBusy.current = false; setMailState('idle');
    }
  };

  const sendOwnMail = async () => {
    const target = confirmOwnMail;
    setConfirmOwnMail(null);
    if (!target || mailBusy.current || !profile?.is_owner || !current
      || current.survey.id !== target.surveyId || currentScope.current !== scope
      || endOfMonthContext(new Date()).period !== target.reviewPeriod) {
      showAlert('Nothing sent', 'Please reopen this check-in before sending your email.');
      return;
    }
    mailBusy.current = true; setMailState('sending');
    try {
      const { data, error } = await supabase.functions.invoke('open-check-in', {
        body: { survey_id: target.surveyId, dry_run: false, self_only: true },
      });
      if (error || !wasOwnMonthEmailSent(data, target.surveyId, target.reviewPeriod)) {
        showAlert('Email not confirmed', 'Check your inbox before trying again.');
        return;
      }
      showAlert('Email sent', 'The End of the month check-in is on its way to your inbox.');
    } catch {
      showAlert('Email not confirmed', 'Check your inbox before trying again.');
    } finally {
      mailBusy.current = false; setMailState('idle');
    }
  };
  if (!isFocused) return null;

  return <View style={{ flex: 1, backgroundColor: skin.page }}>
    <AppHeader title="End of the month" onBackPress={() => router.replace(returnTo as never)} />
    {!authLoading && activeMemberships.length === 0
      ? <Text style={{ margin: 24, fontFamily: 'Lato_400Regular', color: skin.ink }}>This check-in is paused for your HIVE.</Text>
      : current ? <EndOfMonthForm key={`${scope}:${current.survey.id}`} sections={activeMemberships.map(m => ({
      community: m.community, todos: current.todos[m.community_id] ?? [],
      questions: seasonal.filter(section => section.communityId === m.community_id).flatMap(section => section.questions),
    }))} initialAnswers={current.initialAnswers} showQuarterAnnouncements={month === '2026-09'}
      showNewsletterDeadline={isOctoberNewsletterDeadlineDay(now)}
      sharedQuarterQuestions={isQuarterPulseOpen(reviewDate) ? QUARTER_PULSE_QUESTIONS : []}
      finalQuarter={reviewDate.getMonth() === 8}
      onOpen3Miq={() => router.push({ pathname: '/profile', params: { focus: 'miq', from: 'endofmonth' } })}
      onOpenHiveHelp={categoryId => router.push({ pathname: '/hive-wide-boards', params: { categoryId, from: 'endofmonth', open: String(Date.now()) } })}
      draftKey={`survey-draft:${profile!.id}:${current.survey.id}:${month}:continuous`}
      legacyDraftKeys={current.legacyDraftKeys} readOnly={!!askedDate || historicalReview} completedReview={historicalReview}
      onSave={async answers => {
        if (askedDate || historicalReview || currentScope.current !== scope || !profile) return { error: 'Please reopen this check-in before saving.' };
        const result = await saveEndOfMonth({ answers, communityIds: activeMemberships.map(m => m.community_id), todos: current.todos,
          applyTasks: items => applyCarryForwardStatuses(supabase as never, profile.id, items),
          save: (id, own) => submitCheckInOccurrence(current.survey.id, own, id, `month:${month}`),
        });
        if (!result.error) void queryClient.invalidateQueries({ queryKey: ['carryForwardContext'] });
        return result;
      }} onDone={() => router.replace(returnTo as never)} doneLabel={from === 'meetings' ? 'Back to Meetings' : 'Back to Home'} onEmailSettings={() => router.push('/settings' as never)}
      onEmailMe={profile?.is_owner && !askedDate && !historicalReview ? previewOwnMail : undefined} emailingMe={mailState !== 'idle'} />
      : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          {failure ? <><Text style={{ fontFamily: 'Lato_400Regular', color: skin.ink, lineHeight: 21 }}>{failure}</Text>
            <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ backgroundColor: skin.gold, padding: 14, borderRadius: 999 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#313130' }}>Try again</Text>
            </Pressable></> : <><ActivityIndicator color={skin.gold} /><Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft }}>Opening End of the month…</Text></>}
        </View>}
    <ConfirmDialog visible={!!confirmOwnMail} title="Email your check-in?"
      body={`Send one End of the month email to ${profile?.email ?? 'your account address'}. Its button opens this check-in.`}
      confirmLabel="Email me" onConfirm={() => { void sendOwnMail(); }} onCancel={() => setConfirmOwnMail(null)} />
  </View>;
}
