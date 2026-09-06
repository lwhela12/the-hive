import { fetchCheckInActionItems } from '../../lib/checkInActionItems';
import { personalHardOutError } from '../../lib/personalHardOut';
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Pressable, Modal, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const cliveIcon = require('../../assets/Clive_logo.png');
import {
  applyCarryForwardStatuses,
  CARRY_FORWARD_ANSWER_KEY,
  CARRY_FORWARD_STATUS_OPTIONS,
  normalizeCarryForwardResponse,
  type CarryForwardItem,
  type CarryForwardResponseItem,
  type CarryForwardStatus,
} from '../../lib/carryForward';
import type { Survey, SurveyAnswers, SurveyQuestion } from '../../lib/hooks/useSurveys';
import { SurveyQuestionField } from './SurveyQuestionField';
import {
  checkInDisplayName,
  getSeasonCheckInKind,
  isEndOfMonthCheckInSurvey,
  isPreMeetingCheckInSurvey,
} from '../../lib/checkIns';
import { supabase } from '../../lib/supabase';
import { clearSpotlight } from '../../lib/spotlight';
import { fileCheckInWish } from '../../lib/checkInWish';
import { showAlert } from '../../lib/showAlert';
import { getCycleStart } from '../../lib/meetingCycle';
import { fetchCheckInActivityContext, type ActivityContext } from '../../lib/checkInActivityContext';
import { hasMeaningfulActionItemText, parseActionItemDescription } from '../../lib/actionItemDisplay';
import { useAuth } from '../../lib/hooks/useAuth';
import { Avatar } from '../ui/Avatar';
import { CloseButton } from '../ui/CloseButton';

import { ComposerBar } from '../ui/ComposerBar';
import { ThinkingBee } from '../ui/ThinkingBee';
import { accentPalette, hiveSeal, HIVE_GOLD } from '../../lib/hiveBrand';
interface SurveyModalProps {
  survey: Survey;
  /** Data scope can differ from the shared check-in’s visual identity. */
  answerCommunityId?: string | null;
  initialAnswers?: SurveyAnswers;
  /** Isolate drafts by member, HIVE and meeting/month occurrence. */
  draftScope?: string;
  closeLabel?: string;
  introduction?: React.ReactNode;
  timingLabel?: string;
  /** Only rendered after a successful save and its follow-up writes finish. */
  renderSuccess?: (close: () => void) => React.ReactNode;
  isEditingResponse?: boolean;
  carryForwardItems?: CarryForwardItem[];
  /**
   * The roster, BROKEN UP and drawn beside the questions it belongs to.
   *
   * Keyed by the id of the `note` question that heads a section: whatever is
   * listed under that key is drawn immediately after that note instead of in
   * one block at the top.
   *
   * Nat, 2026-09-04, on the merged check-in walked with three HIVEs' worth of
   * to-dos in it: *"deff break it up per hive."* Fourteen cards stood between
   * the top of the page and the first question. One HIVE's roster is a helpful
   * preamble; three HIVEs' rosters stacked together is a wall.
   *
   * DISPLAY ONLY. `carryForwardItems` stays the full flat list, because that is
   * what the saved answer is built from — grouping how it is drawn must never
   * change what is stored.
   */
  carryForwardSections?: Record<string, CarryForwardItem[]>;
  carryForwardLoading?: boolean;
  carryForwardError?: string | null;
  onSubmit: (answers: SurveyAnswers) => Promise<{ error: any }>;
  onClose: () => void;
  /**
   * The accent of the HIVE this modal was opened from.
   *
   * Whether it is USED is decided here, not by the caller: a survey that
   * belongs to no HIVE — the HIVE-Wide End of the month, `community_id` null —
   * stays honey gold however blue the page behind it is. Encoding that once
   * means no caller can get it wrong by passing the HIVE it happens to be on.
   */
  hiveAccent?: string;
  /**
   * The SLUG of the HIVE this modal was opened from, for its seal.
   *
   * Same rule as `hiveAccent` above, and decided here for the same reason: a
   * survey belonging to no HIVE wears the HIVE-Wide seal, whichever HIVE the
   * page behind it happens to be. Optional, because a caller that does not know
   * gets the HIVE-Wide one, which says "HIVE" honestly rather than putting
   * somebody else's costume on the check-in.
   */
  hiveSlug?: string | null;
}

const DRAFT_KEY = (surveyId: string) => `survey-draft:${surveyId}`;

const carryForwardItemKey = (item: Pick<CarryForwardItem, 'type' | 'id'>) => `${item.type}:${item.id}`;

const CARRY_FORWARD_STATUS_STYLE: Record<CarryForwardStatus, {
  backgroundColor: string;
  borderColor: string;
  color: string;
}> = {
  keep_active: {
    backgroundColor: '#fdf3dc',
    borderColor: '#dec181',
    color: '#8a6b30',
  },

  done: {
    backgroundColor: '#ecfdf3',
    borderColor: '#86efac',
    color: '#166534',
  },
  archive: {
    backgroundColor: '#f3f4f6',
    borderColor: '#d1d5db',
    color: '#4b5563',
  },
};

function buildCarryForwardResponse(
  answers: Record<string, any>,
  items: CarryForwardItem[]
): CarryForwardResponseItem[] {
  const current = normalizeCarryForwardResponse(answers[CARRY_FORWARD_ANSWER_KEY]);
  const currentByKey = new Map(current.map(item => [carryForwardItemKey(item), item]));

  return items.map((item) => {
    const existing = currentByKey.get(carryForwardItemKey(item));
    return {
      ...item,
      status: existing?.status ?? 'keep_active',
      note: existing?.note ?? null,
    };
  });
}

/**
 * A wish's recap text: its title, unless the title is old seed data that got
 * hard-cut mid-word (no trailing punctuation, description carries on past
 * it) — then the description instead, cleanly truncated at a word boundary.
 * Nat, 2026-08-13, looking at the recap: several wishes read "...Climby
 * things where I have ch" — `title` really is stored that way in the
 * database (cut at a character count, not a word), not something this recap
 * did to it. Scoped to this recap only; the stored titles are untouched.
 */
function cleanWishText(title: string | null | undefined, description: string | null | undefined) {
  const cleanTitle = (title ?? '').trim();
  const cleanDescription = (description ?? '').trim();
  const titleLooksCut = cleanTitle.length > 0
    && cleanDescription.startsWith(cleanTitle)
    && cleanDescription.length > cleanTitle.length
    && !/[\s.!?]$/.test(cleanTitle);
  const text = titleLooksCut ? cleanDescription : (cleanTitle || cleanDescription);
  if (text.length <= 80) return text;
  const cut = text.slice(0, 80);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : 80)}…`;
}

/** Turn "September HIVE Help — Pick up trash..." into the one useful line. */
function hiveHelpFocus(title: string | null | undefined): string {
  const clean = (title ?? '').trim();
  return clean.replace(/^.*?HIVE Help(?:ers)?\s*[—–-]\s*/i, '').trim() || clean;
}

function formatSurveyDueDate(dueDate: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
  const parsed = new Date(dateOnly ? `${dueDate}T12:00:00Z` : dueDate);
  if (dateOnly && !Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  }
  if (Number.isNaN(parsed.getTime())) return dueDate;

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SurveyModal({
  survey,
  answerCommunityId = survey.community_id,
  initialAnswers,
  draftScope,
  closeLabel = "Back to HIVE",
  introduction,
  timingLabel,
  renderSuccess,
  isEditingResponse = false,
  carryForwardItems = [],
  carryForwardSections,
  carryForwardLoading = false,
  carryForwardError = null,
  onSubmit,
  onClose,
  hiveAccent = HIVE_GOLD,
  hiveSlug,
}: SurveyModalProps) {
  /**
   * Nat, 2026-09-01: every survey still wore honey gold inside Tech HIVE and
   * Production HIVE — the number chips, the selected answers, the submit
   * button — in a HIVE whose whole shell is blue or purple.
   *
   * Read off the SURVEY, not off the screen behind it. Gold returns its exact
   * hand-tuned family, so OG HIVE does not move a pixel.
   */
  const accent = survey.community_id == null ? HIVE_GOLD : hiveAccent;
  const tint = accentPalette(accent);
  /**
   * The seal at the top of the check-in (Nat, 2026-09-04).
   *
   * The same choice the accent makes one line up: a check-in belonging to no
   * HIVE is HIVE-Wide, so it wears the black-and-gold seal rather than the HIVE
   * whose page it was opened from.
   */
  const seal = hiveSeal(survey.community_id == null ? null : hiveSlug);
  const { width: recapWidth } = useWindowDimensions();
  const draftId = draftScope ?? survey.id;
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Expo tabs retain their screens after navigation; dismiss the portal itself.
  const [closed, setClosed] = useState(false);
  const handleClose = useCallback(() => { setClosed(true); onClose(); }, [onClose]);
  const [error, setError] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  // Memory jogger (Nat, 2026-08-13, twice: "werent we goint to preseeed it
  // with activities and granted wishes and stuff?") — a quiet recap of the
  // season's hangs and granted wishes, shown once above the opening
  // question so "how did the last three months go?" isn't a blank stare.
  const seasonKind = getSeasonCheckInKind(survey);
  const { profile: viewerProfile } = useAuth();
  type SeasonRecapGrantee = { userId: string; name: string; avatarUrl: string | null; wishes: string[] };
  type SeasonRecapMonth = { label: string; hangs: string[] };
  const [seasonRecap, setSeasonRecap] = useState<{ hangMonths: SeasonRecapMonth[]; hangCount: number; granted: SeasonRecapGrantee[] } | null>(null);
  useEffect(() => {
    if (!seasonKind) return;
    let active = true;
    (async () => {
      const end = new Date(survey.due_date ?? Date.now());
      const start = new Date(end);
      start.setMonth(start.getMonth() - (seasonKind === 'year' ? 12 : 3));

      // A HIVE younger than the lookback should never claim a history it
      // doesn't have — Nat, 2026-08-13: "Prod & Tech dont evne start until
      // sept, so we dont want to ask 'how its been since jan'." Their
      // year-end window starts at their own creation date this year; next
      // year they'll have a full twelve months and this clamp does nothing.
      const { data: community } = await supabase
        .from('communities')
        .select('created_at')
        .eq('id', survey.community_id)
        .single();
      const createdAt = community?.created_at ? new Date(community.created_at) : null;
      if (createdAt && createdAt > start) start.setTime(createdAt.getTime());

      const startIso = start.toISOString().slice(0, 10);
      const endIso = end.toISOString().slice(0, 10);

      // 24, not 12 — a year-end lookback for an established HIVE can
      // genuinely outrun the old cap (Nat, 2026-08-13: "we'll have to go
      // allll the way back to Jan!!! that's a lot"). The card below
      // collapses long lists so this doesn't turn into a wall of text.
      const [{ data: events }, { data: wishes }] = await Promise.all([
        supabase
          .from('events')
          .select('id, title, event_date')
          .eq('community_id', survey.community_id)
          .gte('event_date', startIso)
          .lte('event_date', endIso)
          .neq('event_type', 'meeting')
          .neq('event_type', 'birthday')
          .order('event_date', { ascending: true })
          .limit(24),
        supabase
          .from('wishes')
          .select('id, title, description, fulfilled_at, user_id, user:profiles!user_id(name, avatar_url), granters:wish_granters(granter_id)')
          .eq('community_id', survey.community_id)
          .eq('status', 'fulfilled')
          .gte('fulfilled_at', startIso)
          .lte('fulfilled_at', endIso)
          .order('fulfilled_at', { ascending: true })
          .limit(24),
      ]);
      if (!active) return;

      // Migration 178 opened fulfilled wishes to the whole HIVE — before it,
      // only a wish's own owner could see it granted at all, so a recap of
      // "what the HIVE granted" silently showed just Nat's own four (Nat,
      // 2026-08-13, reacting to that exact gap). Grouped by whose wish it
      // was, with a face — "Name; wish" read flat to her ("its not doing it
      // for me"); a little avatar bubble per person, wishes listed under it,
      // is the version she asked for outright ("a profile bubble of the
      // person & then a list of all of their granted wishes").
      const byPerson = new Map<string, SeasonRecapGrantee>();
      for (const wish of (wishes ?? []) as any[]) {
        const text = cleanWishText(wish.title, wish.description);
        if (!text) continue;
        const helped = viewerProfile?.id
          && (wish.granters ?? []).some((g: any) => g.granter_id === viewerProfile.id);
        const line = helped ? `${text} — you helped grant this` : text;
        const existing = byPerson.get(wish.user_id);
        if (existing) {
          existing.wishes.push(line);
        } else {
          byPerson.set(wish.user_id, {
            userId: wish.user_id,
            name: wish.user?.name ?? 'A HIVE member',
            avatarUrl: wish.user?.avatar_url ?? null,
            wishes: [line],
          });
        }
      }

      // Grouped by month, not one long list — Nat, 2026-08-13, on the EOY
      // recap: "can we break these up by date? or by month?" A year of
      // hangs read flat is a wall; a month header every few items is a
      // calendar.
      const hangsByMonth = new Map<string, string[]>();
      for (const event of (events ?? []) as any[]) {
        if (/\b(out of town|away|trip|travel|galavant)/i.test(event.title)) continue;
        const monthLabel = new Date(`${event.event_date}T00:00:00`)
          .toLocaleDateString('en-US', { month: 'long', year: seasonKind === 'year' ? '2-digit' : undefined });
        const bucket = hangsByMonth.get(monthLabel);
        if (bucket) bucket.push(event.title);
        else hangsByMonth.set(monthLabel, [event.title]);
      }

      setSeasonRecap({
        hangMonths: Array.from(hangsByMonth, ([label, hangs]) => ({ label, hangs })),
        hangCount: (events ?? []).filter((event: any) => !/\b(out of town|away|trip|travel|galavant)/i.test(event.title)).length,
        granted: Array.from(byPerson.values()),
      });
    })().catch((err) => console.warn('Could not load season recap', err));
    return () => { active = false; };
  }, [seasonKind, survey.community_id, survey.due_date, viewerProfile?.id]);
  const SEASON_RECAP_COLLAPSE_THRESHOLD = 6;
  const [seasonRecapExpanded, setSeasonRecapExpanded] = useState(false);
  const carryForwardResponses = useMemo(() => (
    normalizeCarryForwardResponse(answers[CARRY_FORWARD_ANSWER_KEY])
  ), [answers]);
  const carryForwardResponsesByKey = useMemo(() => {
    const next = new Map<string, CarryForwardResponseItem>();
    carryForwardResponses.forEach((item) => next.set(carryForwardItemKey(item), item));
    return next;
  }, [carryForwardResponses]);

  // Restore saved draft on open
  useEffect(() => {
    let active = true;
    setAnswers({});
    setSubmitted(false);
    setClosed(false);
    setError(null);
    setDraftLoaded(false);

    AsyncStorage.getItem(DRAFT_KEY(draftId)).then(raw => {
      if (!active) return;
      if (raw) {
        try { setAnswers(JSON.parse(raw)); } catch {}
      } else {
        setAnswers(initialAnswers ?? {});
      }
      setDraftLoaded(true);
    });

    return () => {
      active = false;
    };
  }, [draftId]);

  const isStaple = isPreMeetingCheckInSurvey(survey) || isEndOfMonthCheckInSurvey(survey);
  const [completedContext, setCompletedContext] = useState<{ id: string; text: string; helperName?: string }[]>([]);
  const [contextState, setContextState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    setCompletedContext([]); setContextState('loading');
    if (!isStaple || !survey.community_id || !viewerProfile?.id) { setContextState('ready'); return; }
    (async () => {
      const since = await getCycleStart(survey.community_id, new Date(survey.due_date ?? Date.now()).toISOString().slice(0, 10));
      const [own, helpers] = await Promise.all([
        fetchCheckInActionItems<{ id: string; description: string }>(() => supabase.from('action_items').select('id, description').eq('community_id', survey.community_id).eq('assigned_to', viewerProfile.id).eq('completed', true).is('archived_at', null).gte('completed_at', since.toISOString()).order('completed_at', { ascending: false }).order('id')),
        fetchCheckInActionItems<{ id: string; description: string; assignee: { name: string } | null }>(() => supabase.from('action_items').select('id, description, assignee:profiles!assigned_to(name)').eq('community_id', survey.community_id).eq('related_user_id', viewerProfile.id).neq('assigned_to', viewerProfile.id).eq('completed', true).is('archived_at', null).gte('completed_at', since.toISOString()).order('completed_at', { ascending: false }).order('id')),
      ]);
      if (!active) return;
      if (own.error || helpers.error) { setContextState('error'); return; }
      setCompletedContext([
        ...(own.data ?? []).filter(item => hasMeaningfulActionItemText(item.description)).map(item => ({ id: item.id, text: parseActionItemDescription(item.description).text })),
        ...(helpers.data ?? []).filter(item => hasMeaningfulActionItemText(item.description)).map((item: any) => ({ id: item.id, text: parseActionItemDescription(item.description).text, helperName: item.assignee?.name ?? 'A HIVE member' })),
      ]);
      setContextState('ready');
    })().catch(() => { if (active) setContextState('error'); });
    return () => { active = false; };
  }, [survey.community_id, survey.due_date, viewerProfile?.id, isStaple]);

  const activityKey = `${survey.id}:${survey.community_id}:${viewerProfile?.id ?? ''}`;
  const [activity, setActivity] = useState<{ key: string; state: 'ready' | 'error'; data?: ActivityContext } | null>(null);
  useEffect(() => {
    let active = true;
    setActivity(null);
    if (!isStaple || !survey.community_id || !viewerProfile?.id) return;
    fetchCheckInActivityContext(survey.community_id).then(data => {
      if (active) setActivity({ key: activityKey, state: 'ready', data });
    }).catch(() => { if (active) setActivity({ key: activityKey, state: 'error' }); });
    return () => { active = false; };
  }, [activityKey, isStaple, survey.community_id, viewerProfile?.id]);
  // Gate synchronously as well as cancelling requests: never flash another HIVE's context.
  const currentActivity = activity?.key === activityKey ? activity : null;

  const setAnswer = useCallback((questionId: string, value: any) => {
    setAnswers(prev => {
      const next = { ...prev, [questionId]: value };
      AsyncStorage.setItem(DRAFT_KEY(draftId), JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [draftId]);

  const handleSubmit = async () => {
    const missing = survey.questions.filter(q => q.required && !answers[q.id] && answers[q.id] !== 0);
    if (missing.length > 0) {
      setError(`Please answer: ${missing.map(q => `"${q.text.slice(0, 30)}..."`).join(', ')}`);
      return;
    }
    const departureError = survey.questions.some(q => q.id === 'q_hard_out') ? personalHardOutError(answers.q_hard_out) : null;
    if (departureError) { setError(departureError); return; }
    setSubmitting(true);
    setError(null);
    const finalAnswers: SurveyAnswers = carryForwardItems.length > 0
      ? {
          ...answers,
          [CARRY_FORWARD_ANSWER_KEY]: buildCarryForwardResponse(answers, carryForwardItems),
        }
      : answers;
    const { error: submitError } = await onSubmit(finalAnswers);
    if (submitError) {
      setSubmitting(false);
      setError('Could not save your responses. Please try again.');
      return;
    }
    // Keep the draft available to retry if task updates fail after the answers save.
    if (viewerProfile?.id && carryForwardItems.length > 0) {
      const taskResult = await applyCarryForwardStatuses(
        supabase as never,
        viewerProfile.id,
        normalizeCarryForwardResponse(finalAnswers[CARRY_FORWARD_ANSWER_KEY]),
      );
      if (taskResult.error) {
        setSubmitting(false);
        setError('Your answers are saved, but your to-do updates could not save. Please submit again to retry.');
        return;
      }
    }
    /**
     * The HD wish becomes a real wish, not a sentence in a survey.
     *
     * Nat's rule for the whole check-in is that an answer has to become a
     * THING. "This month's HD" on the HummDinger bubble reads the `wishes`
     * table, so an HD typed into a box and left there would show the room a
     * blank card over a member who had already written the answer.
     *
     * It is filed as the spotlight — that is what "your focus" means — and
     * only when it is new. Picking one you already have selects it; it does
     * not make a second copy of it.
     *
     * Everything above this line is already saved. A wish that fails to file
     * costs a warning and nothing else: the check-in is in, and the member is
     * never told their answers were lost when they were not.
     */
    const hdWish = typeof finalAnswers.q_hd_wish === 'string' ? finalAnswers.q_hd_wish.trim() : '';
    let hdWishFiled: boolean | null = null;
    if (hdWish && viewerProfile?.id) {
      try {
        await fileCheckInWish(supabase, viewerProfile.id, answerCommunityId, finalAnswers, clearSpotlight);
        hdWishFiled = true;
      } catch (wishError) {
        console.warn('Could not file the HD wish from the check-in', wishError);
        hdWishFiled = false;
      }
    }
    setSubmitting(false);
    AsyncStorage.removeItem(DRAFT_KEY(draftId)).catch(() => {});
    setSubmitted(true);
    /**
     * If the wish did not file, SAY so.
     *
     * The first version of this swallowed the failure into a console warning
     * and showed the same cheerful confirmation. Nat submitted an HD, was told
     * everything was in, and found "HD Wishes (0)" on her own profile — the
     * app had lost something she wrote and reported success. The check-in
     * really is saved, so that is what the message leads with; the second
     * sentence is the honest half, and it says where to put it instead.
     */
    if (hdWishFiled === false) {
      showAlert(
        'Your check-in is in',
        'Your HD wish did not save with it. Add it on your profile and it will be there for the meeting.'
      );
    }
  };

  const answeredCount = survey.questions.filter(q => q.type !== 'note' && answers[q.id] !== undefined && answers[q.id] !== '').length;
  const hasDraft = answeredCount > 0;

  const updateCarryForwardItem = (
    item: CarryForwardItem,
    patch: Partial<Pick<CarryForwardResponseItem, 'status' | 'note'>>
  ) => {
    const current = normalizeCarryForwardResponse(answers[CARRY_FORWARD_ANSWER_KEY]);
    const targetKey = carryForwardItemKey(item);
    let found = false;
    const next = current.map((entry) => {
      if (carryForwardItemKey(entry) !== targetKey) return entry;
      found = true;
      return {
        ...entry,
        ...patch,
      };
    });

    if (!found) {
      next.push({
        ...item,
        status: patch.status ?? 'keep_active',
        note: patch.note ?? null,
      });
    }

    setAnswer(CARRY_FORWARD_ANSWER_KEY, next);
  };

  // A wish is reviewed where the member chooses their meeting focus. Keep
  // the original answer keys so existing drafts and saved status notes survive.
  const hasWishQuestion = survey.questions.some(q => q.id === 'q_hd_wish');
  const wishReviewItems = carryForwardItems.filter(item => item.type === 'wish');
  const renderCarryForwardControls = (item: CarryForwardItem) => {
    const response = carryForwardResponsesByKey.get(carryForwardItemKey(item));
    const activeStatus = response?.status ?? 'keep_active';
    return <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
        {CARRY_FORWARD_STATUS_OPTIONS.filter(option => item.type === 'action_item' ? option.value === 'archive' : item.type !== 'wish').map((option) => {
          const active = option.value === activeStatus;
          const activeStyle = CARRY_FORWARD_STATUS_STYLE[option.value];
          return (
            <Pressable
              key={option.value}
              onPress={() => updateCarryForwardItem(item, { status: item.type === 'action_item' && active ? 'keep_active' : option.value })}
              style={({ pressed }) => ({
                backgroundColor: active ? activeStyle.backgroundColor : pressed ? '#fbf0d7' : '#fffdf5',
                borderColor: active ? activeStyle.borderColor : tint.line(0.42),
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: active ? activeStyle.color : '#8a6b30' }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>



      {/* The shared message bar, so a note on your roster looks and
          behaves like every other box you write in — mic inside the
          box's own border rather than on a strip welded underneath. */}
      {(!['wish', 'action_item'].includes(item.type) || !!response?.note) && <ComposerBar
        tone="light"
        variant="form"
        value={response?.note ?? ''}
        onChangeText={(next) => updateCarryForwardItem(item, {
          note: typeof next === 'function' ? next(response?.note ?? '') : next,
        })}
        placeholder="Your note…"
        minHeight={44}
      />}
    </View>;
  };

  const renderCarryForwardContext = (
    items: CarryForwardItem[] = carryForwardItems,
    heading = hiveSlug === 'show' || hiveSlug === 'production' ? 'Your Production HIVE jobs' : 'Still to do',
  ) => {
    if (carryForwardLoading) {
      return (
        <View style={{ backgroundColor: '#fffdf5', borderWidth: 1, borderColor: tint.line(0.45), borderRadius: 16, padding: 16, marginBottom: 24, alignItems: 'center' }}>
          <ThinkingBee />
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#7f715f', marginTop: 8 }}>
            Gathering your open HIVE things...
          </Text>
        </View>
      );
    }

    if (carryForwardError) {
      return (
        <View style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 16, padding: 14, marginBottom: 24 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#991b1b' }}>
            {carryForwardError}
          </Text>
        </View>
      );
    }

    const visibleItems = hasWishQuestion ? items.filter(item => item.type !== 'wish') : items;
    const archivedItems = visibleItems.filter(item => item.type === 'action_item' && carryForwardResponsesByKey.get(carryForwardItemKey(item))?.status === 'archive');
    const rosterItems = visibleItems.filter(item => {
      const status = carryForwardResponsesByKey.get(carryForwardItemKey(item))?.status;
      return item.type !== 'action_item' || (status !== 'archive' && (!isStaple || status !== 'done'));
    });
    if (rosterItems.length === 0 && archivedItems.length === 0) return null;

    return (
      <View style={{ backgroundColor: '#fffdf5', borderWidth: 1, borderColor: tint.line(0.55), borderRadius: 18, padding: 16, marginBottom: 24 }}>
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 17, color: '#2d2d2d', marginBottom: 6 }}>
          {heading}
        </Text>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#7f715f', lineHeight: 19, marginBottom: 14 }}>
          Tick off anything else you’ve finished.
        </Text>

        <View style={{ gap: 12 }}>
          {rosterItems.map((item) => {
            const parsed = item.type === 'action_item' ? parseActionItemDescription(item.label) : null;
            const detail = [parsed?.elaboration, parsed?.reLabel, item.detail].filter(Boolean).join(' · ');
            return (
              <View
                key={carryForwardItemKey(item)}
                style={{
                  backgroundColor: '#faf8f3',
                  borderWidth: 1,
                  borderColor: tint.line(0.38),
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  {item.type === 'action_item' ? <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Mark done: ${parseActionItemDescription(item.label).text}`}
                    accessibilityState={{ checked: carryForwardResponsesByKey.get(carryForwardItemKey(item))?.status === 'done' }}
                    onPress={() => updateCarryForwardItem(item, { status: carryForwardResponsesByKey.get(carryForwardItemKey(item))?.status === 'done' ? 'keep_active' : 'done' })}
                    style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                  ><Ionicons name={carryForwardResponsesByKey.get(carryForwardItemKey(item))?.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={tint.accent} /></Pressable> : <View style={{ backgroundColor: tint.wash, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#8a6b30' }}>
                      {item.sourceLabel}
                    </Text>
                  </View>}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', lineHeight: 19 }}>
                      {item.type === 'action_item' ? parseActionItemDescription(item.label).text : item.label}
                    </Text>
                    {detail ? (
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#6b7280', lineHeight: 17, marginTop: 3 }}>
                        {detail}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {renderCarryForwardControls(item)}
              </View>
            );
          })}
          {archivedItems.map(item => <View key={carryForwardItemKey(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ flex: 1, color: '#6b7280' }}>Archived · {parseActionItemDescription(item.label).text}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Undo archive: ${parseActionItemDescription(item.label).text}`} onPress={() => updateCarryForwardItem(item, { status: 'keep_active' })} style={{ padding: 12 }}><Text style={{ color: tint.ink }}>Undo</Text></Pressable>
          </View>)}
        </View>
      </View>
    );
  };

  const renderQuestion = (q: SurveyQuestion, index: number) => (
    <View key={q.id}>
      {isStaple && q.id === 'q_hive_help_recap' && (
        <View style={{ padding: 12, gap: 4, backgroundColor: tint.wash, borderWidth: 1, borderColor: tint.line(0.35), borderRadius: 12 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: tint.ink }}>
            This month’s HIVE Help
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', color: '#5c5648' }}>
            {!currentActivity ? 'Loading…' : currentActivity.state === 'error' ? 'Focus unavailable right now.' : hiveHelpFocus(currentActivity.data?.help?.title) || 'No focus recorded this month.'}
          </Text>
        </View>
      )}
    <SurveyQuestionField
      wishReviewItems={q.id === 'q_hd_wish' ? wishReviewItems : undefined}
      renderWishReview={q.id === 'q_hd_wish' ? renderCarryForwardControls : undefined}
      hangEvents={currentActivity?.data?.hangs}
      question={q.id === 'q_hard_out' ? { ...q, text: 'Do you have a hard out?' } : isStaple && q.id === 'q_hangs_recap' ? { ...q, type: 'hangs' } : q}
      index={index}
      value={answers[q.id]}
      onChange={(value) => setAnswer(q.id, value)}
      // A question that carries a second decision beside its answer — the HD
      // wish and how far it travels — writes that one itself, under its own
      // key, so it draft-saves and submits with everything else.
      answers={answers}
      onSetAnswer={setAnswer}
      communityId={answerCommunityId}
      accent={accent}
    />
    </View>
  );

  return (
    <Modal visible={!closed} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable onPress={handleClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        <View style={{ backgroundColor: '#faf8f3', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '94%' }}>
          {/* Handle + close button */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 }}>
            {hasDraft ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="cloud-done-outline" size={13} color={tint.accent} />
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: tint.accent }}>Progress saved</Text>
              </View>
            ) : <View style={{ width: 80 }} />}
            <CloseButton
              onPress={handleClose}
              accessibilityLabel="Close survey"
              color="#9a8060"
              size={22}
            />
          </View>

          {submitted ? (
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {renderSuccess ? renderSuccess(handleClose) : <View style={{ alignItems: 'center', padding: 48 }}>
              <Image source={cliveIcon} style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 16 }} contentFit="cover" cachePolicy="memory-disk" />
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', textAlign: 'center', marginBottom: 10 }}>All done!</Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
                {isEditingResponse
                  ? 'Your updated answers are saved. HIVE will be working from the latest version.'
                  : 'Your check-in answers are saved.'}
              </Text>
              <Pressable onPress={handleClose} style={{ backgroundColor: tint.accent, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>{closeLabel}</Text>
              </Pressable>
            </View>}
            </ScrollView>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}
            >
              {/* Header */}
              <View style={{ marginBottom: 28 }}>
                <Image
                  source={seal}
                  style={{ width: 56, height: 56, marginBottom: 12 }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  accessibilityLabel=""
                />
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 8 }}>{checkInDisplayName(survey.title)}</Text>
                {survey.description && (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#6b7280', lineHeight: 21 }}>{survey.description}</Text>
                )}
                {(timingLabel || survey.due_date) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: tint.wash, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: tint.accent }}>
                      📅 {timingLabel ?? `Due ${formatSurveyDueDate(survey.due_date!)}`}
                    </Text>
                  </View>
                )}
                <View style={{ height: 1, backgroundColor: tint.line(0.3), marginTop: 20 }} />
              </View>

              {draftLoaded && introduction}

              {seasonRecap && (seasonRecap.hangCount > 0 || seasonRecap.granted.length > 0) && (() => {
                const grantedCount = seasonRecap.granted.reduce((sum, person) => sum + person.wishes.length, 0);
                const total = seasonRecap.hangCount + grantedCount;
                // Columns on a laptop, a stacked list on a phone (Nat,
                // 2026-08-13: "on the laptop view, they could read left to
                // right & cell phone view a vertical list").
                const monthsSideBySide = recapWidth >= 640;
                // A year-end recap can genuinely run long; collapse it to a
                // one-line count with a tap to open (Nat, 2026-08-13: "maybe
                // we have a 'jog my memroy' screen that collapses or
                // something?"). A quarter's usual handful stays open.
                const collapsible = total > SEASON_RECAP_COLLAPSE_THRESHOLD;
                const showFull = !collapsible || seasonRecapExpanded;
                return (
                  <View style={{ backgroundColor: tint.wash, borderWidth: 1, borderColor: tint.line(0.5), borderRadius: 14, padding: 14, marginBottom: 22, gap: 10 }}>
                    <Pressable
                      onPress={() => collapsible && setSeasonRecapExpanded((v) => !v)}
                      disabled={!collapsible}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', color: tint.ink }}>
                        A little jog for your memory
                      </Text>
                      {collapsible && (
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: tint.accent }}>
                          {showFull ? 'Hide ▲' : `${seasonRecap.hangCount} hangs · ${grantedCount} granted ▾`}
                        </Text>
                      )}
                    </Pressable>
                    {showFull && (
                      <>
                        {/* One line per item, not one run-on sentence (Nat,
                            2026-08-13: "you know how i feel about long form
                            stuff"). */}
                        {seasonRecap.hangMonths.length > 0 && (
                          <View style={{ gap: 6 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#5c5648' }}>What happened:</Text>
                            <View style={{ flexDirection: monthsSideBySide ? 'row' : 'column', flexWrap: 'wrap', gap: monthsSideBySide ? 16 : 10 }}>
                              {seasonRecap.hangMonths.map((month) => (
                                <View key={month.label} style={monthsSideBySide ? { minWidth: 150, flexGrow: 1 } : undefined}>
                                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11.5, color: tint.ink, marginBottom: 2 }}>
                                    {month.label}
                                  </Text>
                                  {month.hangs.map((hang) => (
                                    <Text key={hang} style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#5c5648', lineHeight: 18 }}>
                                      • {hang}
                                    </Text>
                                  ))}
                                </View>
                              ))}
                            </View>
                          </View>
                        )}
                        {seasonRecap.granted.length > 0 && (
                          <View style={{ gap: 8 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#5c5648' }}>💛 Wishes granted:</Text>
                            {seasonRecap.granted.map((person) => (
                              <View key={person.userId} style={{ flexDirection: 'row', gap: 8 }}>
                                <Avatar name={person.name} url={person.avatarUrl} size={26} />
                                <View style={{ flex: 1, gap: 2 }}>
                                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#5c5648' }}>
                                    {person.name}
                                  </Text>
                                  {person.wishes.map((wish) => (
                                    <Text key={wish} style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#5c5648', lineHeight: 18 }}>
                                      • {wish}
                                    </Text>
                                  ))}
                                </View>
                              </View>
                            ))}
                          </View>
                        )}
                      </>
                    )}
                  </View>
                );
              })()}

              {isStaple && (() => {
                const own = completedContext.filter(item => !item.helperName);
                const helpers = completedContext.filter(item => !!item.helperName);
                const newlyDone = carryForwardItems.filter(item => item.type === 'action_item' && carryForwardResponsesByKey.get(carryForwardItemKey(item))?.status === 'done' && !own.some(done => done.id === item.id));
                return <>
                  {contextState === 'error' && <Text style={{ color: '#92400e', marginBottom: 12 }}>Completed work couldn’t load. Your to-dos are below.</Text>}
                  {(own.length > 0 || newlyDone.length > 0) && <View style={{ backgroundColor: tint.wash, borderRadius: 16, padding: 16, marginBottom: 18, gap: 12 }}>
                    <Text style={{ color: tint.ink, fontFamily: 'LibreBaskerville_700Bold', fontSize: 17 }}>You got this done</Text>
                    {own.map(item => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 }}>
                      <Ionicons name="checkmark-circle" size={24} color={tint.accent} /><Text style={{ color: '#5c5648', flex: 1, lineHeight: 21 }}>{item.text}</Text>
                    </View>)}
                    {newlyDone.map(item => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: true }} accessibilityLabel={`Mark still to do: ${parseActionItemDescription(item.label).text}`} onPress={() => updateCarryForwardItem(item, { status: 'keep_active' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
                      <Ionicons name="checkmark-circle" size={24} color={tint.accent} /><Text style={{ color: '#5c5648', flex: 1, lineHeight: 21 }}>{parseActionItemDescription(item.label).text}</Text>
                    </Pressable>)}
                  </View>}
                  {helpers.length > 0 && <View style={{ padding: 16, marginBottom: 18, gap: 10 }}>
                    <Text style={{ color: tint.ink, fontFamily: 'Lato_700Bold' }}>A little help from your HIVE</Text>
                    {helpers.map(item => <Text key={item.id} style={{ color: '#5c5648', lineHeight: 21 }}>{item.helperName} · {item.text}</Text>)}
                  </View>}
                </>;
              })()}
              {/* Grouped? Then each section draws its own, below its heading. */}
              {draftLoaded && (!carryForwardSections || carryForwardLoading || carryForwardError) && renderCarryForwardContext()}

              {/* A note block explains; it does not ask. So the numbers count
                  only the questions, and a person who reads "3 of 12" and then
                  counts the boxes finds twelve boxes. */}
              {draftLoaded && (() => {
                let asked = introduction ? 1 : 0;
                return survey.questions.map((q) => {
                  const redundantHiveHeading = q.type === 'note' && q.id.startsWith('note_hive_') && survey.questions.filter(question => question.type === 'note' && question.id.startsWith('note_hive_')).length === 1 && !!survey.community_id;
                  const drawn = redundantHiveHeading ? null : renderQuestion(q, q.type === 'note' ? -1 : asked++);
                  const mine = carryForwardSections?.[q.id];
                  if (!mine?.length) return drawn;
                  // This HIVE's own open things, under this HIVE's heading and
                  // above its own questions.
                  return (
                    <Fragment key={`${q.id}_section`}>
                      {drawn}
                      {renderCarryForwardContext(mine)}
                    </Fragment>
                  );
                });
              })()}

              {error && (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#ef4444', marginBottom: 14 }}>{error}</Text>
              )}

              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                style={{ backgroundColor: tint.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: submitting ? 0.7 : 1 }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: 'white' }}>
                  {submitting ? 'Saving...' : isEditingResponse ? 'Update answers' : 'Submit answers'}
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
