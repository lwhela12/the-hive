import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Pressable, Modal, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const cliveIcon = require('../../assets/Clive_logo.png');
import {
  applyCarryForwardStatuses,
  CARRY_FORWARD_ANSWER_KEY,
  CARRY_FORWARD_STATUS_OPTIONS,
  getCarryForwardStatusLabel,
  normalizeCarryForwardResponse,
  type CarryForwardItem,
  type CarryForwardResponseItem,
  type CarryForwardStatus,
} from '../../lib/carryForward';
import type { Survey, SurveyAnswers, SurveyQuestion } from '../../lib/hooks/useSurveys';
import { SurveyQuestionField } from './SurveyQuestionField';
import {
  getSeasonCheckInKind,
  isEndOfMonthCheckInSurvey,
  isPreMeetingCheckInSurvey,
} from '../../lib/checkIns';
import { supabase } from '../../lib/supabase';
import { clearSpotlight } from '../../lib/spotlight';
import { showAlert } from '../../lib/showAlert';
import { getCycleStart } from '../../lib/meetingCycle';
import { parseActionItemDescription } from '../../lib/actionItemDisplay';
import { useAuth } from '../../lib/hooks/useAuth';
import { Avatar } from '../ui/Avatar';
import { CloseButton } from '../ui/CloseButton';

import { ComposerBar } from '../ui/ComposerBar';
import { ThinkingBee } from '../ui/ThinkingBee';
interface SurveyModalProps {
  survey: Survey;
  initialAnswers?: SurveyAnswers;
  isEditingResponse?: boolean;
  carryForwardItems?: CarryForwardItem[];
  carryForwardLoading?: boolean;
  carryForwardError?: string | null;
  onSubmit: (answers: SurveyAnswers) => Promise<{ error: any }>;
  onClose: () => void;
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
  needs_attention: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    color: '#92400e',
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

function formatSurveyDueDate(dueDate: string) {
  const parsed = new Date(dueDate);
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
  initialAnswers,
  isEditingResponse = false,
  carryForwardItems = [],
  carryForwardLoading = false,
  carryForwardError = null,
  onSubmit,
  onClose,
}: SurveyModalProps) {
  const { width: recapWidth } = useWindowDimensions();
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
    setError(null);
    setDraftLoaded(false);

    AsyncStorage.getItem(DRAFT_KEY(survey.id)).then(raw => {
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
  }, [survey.id]);

  /**
   * "What did you get done?" answers itself.
   *
   * Nat, 2026-08-15: *"instead of having things on your to-do list, and then
   * you check them off, and then you have to remember what you did and say
   * that — there should be automation there. Things should be seeded and
   * pre-seeding. And then you can add in anything else you did, like maybe on
   * your list was 'call Circus Center', but then maybe you also called four
   * other gyms."*
   *
   * So the field arrives already holding the to-dos this person ticked off
   * since the last meeting, as plain editable text. They add whatever else they
   * did and send it. Nobody is asked to remember what the app already knows.
   *
   * It only ever fills a field the person has not touched — a saved answer or a
   * draft in progress always wins, so re-opening the check-in never overwrites
   * anything they wrote.
   */
  useEffect(() => {
    if (!draftLoaded) return;
    // The end-of-month check-in asks the same question of the same cycle
    // (lib/checkIns.ts, rebuilt 2026-08-27), so it gets the same pre-fill —
    // the field is `q_show_progress` on both, which is also the key the
    // meeting deck reads.
    if (!isPreMeetingCheckInSurvey(survey) && !isEndOfMonthCheckInSurvey(survey)) return;
    if (!viewerProfile?.id) return;
    const target = survey.questions.find((q) => q.id === 'q_show_progress');
    if (!target) return;
    if (String(answers.q_show_progress ?? '').trim()) return;

    let active = true;
    (async () => {
      // Since the meeting before this one. `getCycleStart` is the one anchor
      // the whole app measures a cycle from — it reads the calendar AND the
      // record of nights that actually happened, which is what stopped these
      // lists reaching back into the previous cycle (lib/meetingCycle.ts).
      const due = new Date(survey.due_date ?? Date.now());
      const since = await getCycleStart(
        survey.community_id,
        due.toISOString().slice(0, 10),
      );

      const { data: done } = await supabase
        .from('action_items')
        .select('description, completed_at')
        .eq('community_id', survey.community_id)
        .eq('assigned_to', viewerProfile.id)
        .eq('completed', true)
        .is('archived_at', null)
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: true })
        .limit(20);

      if (!active || !done?.length) return;
      const lines = done
        .map((item) => parseActionItemDescription(String(item.description ?? '')).text.trim())
        .filter(Boolean)
        .map((text) => `\u2022 ${text}`);
      if (!lines.length) return;
      setAnswers((prev) => (
        String(prev.q_show_progress ?? '').trim()
          ? prev
          : { ...prev, q_show_progress: lines.join('\n') }
      ));
    })();

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLoaded, survey.id, viewerProfile?.id]);

  const setAnswer = useCallback((questionId: string, value: any) => {
    setAnswers(prev => {
      const next = { ...prev, [questionId]: value };
      AsyncStorage.setItem(DRAFT_KEY(survey.id), JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [survey.id]);

  const handleSubmit = async () => {
    const missing = survey.questions.filter(q => q.required && !answers[q.id] && answers[q.id] !== 0);
    if (missing.length > 0) {
      setError(`Please answer: ${missing.map(q => `"${q.text.slice(0, 30)}..."`).join(', ')}`);
      return;
    }
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
    // Ticking a to-do off in the roster now actually ticks it off. Answers are
    // already saved by this point, so a task that will not move costs a warning
    // in the console and nothing else (see `applyCarryForwardStatuses`).
    if (viewerProfile?.id && carryForwardItems.length > 0) {
      await applyCarryForwardStatuses(
        supabase as never,
        viewerProfile.id,
        normalizeCarryForwardResponse(finalAnswers[CARRY_FORWARD_ANSWER_KEY]),
      );
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
    // How far it travels, chosen on the question itself. The safe end of the
    // ladder is the default, always: a wish only leaves its HIVE because
    // somebody said so.
    const hdReach = finalAnswers.q_hd_wish_reach === 'all_hives' ? 'all_hives' : 'hive';
    let hdWishFiled: boolean | null = null;
    if (hdWish && viewerProfile?.id) {
      try {
        // The same reach the picker offers: this HIVE's wishes plus every one
        // of yours that travels. Matching only on this HIVE would file a
        // second copy of a HIVE-Wide wish every time somebody picked one.
        const { data: existing } = await (supabase as any)
          .from('wishes')
          .select('id, description')
          .eq('user_id', viewerProfile.id)
          .eq('is_active', true)
          .or(`community_id.eq.${survey.community_id},share_scope.eq.all_hives`);
        const already = (existing ?? []).find(
          (wish: { description?: string }) => (wish.description ?? '').trim() === hdWish
        ) as { id: string } | undefined;
        // Unstar whatever holds the star first. One per member, enforced by a
        // partial unique index — see `lib/spotlight.ts`. Skipping this is what
        // made the very first one of these fail silently: a fulfilled wish
        // from July still held Nat's star, and the insert was refused.
        await clearSpotlight(viewerProfile.id);
        const { error: wishWriteError } = already
          ? await (supabase as any)
              .from('wishes')
              .update({ is_spotlight: true, share_scope: hdReach })
              .eq('id', already.id)
          : await (supabase as any).from('wishes').insert({
              user_id: viewerProfile.id,
              community_id: survey.community_id,
              description: hdWish,
              raw_input: hdWish,
              status: 'public',
              is_active: true,
              is_spotlight: true,
              share_scope: hdReach,
              extracted_from: 'onboarding',
            });
        if (wishWriteError) console.warn('Could not file the HD wish', wishWriteError);
        hdWishFiled = !wishWriteError;
      } catch (wishError) {
        console.warn('Could not file the HD wish from the check-in', wishError);
        hdWishFiled = false;
      }
    }
    setSubmitting(false);
    AsyncStorage.removeItem(DRAFT_KEY(survey.id)).catch(() => {});
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

  const renderCarryForwardContext = () => {
    if (carryForwardLoading) {
      return (
        <View style={{ backgroundColor: '#fffdf5', borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)', borderRadius: 16, padding: 16, marginBottom: 24, alignItems: 'center' }}>
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

    if (carryForwardItems.length === 0) return null;

    return (
      <View style={{ backgroundColor: '#fffdf5', borderWidth: 1, borderColor: 'rgba(222,193,129,0.55)', borderRadius: 18, padding: 16, marginBottom: 24 }}>
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 17, color: '#2d2d2d', marginBottom: 6 }}>
          Still on your roster
        </Text>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#7f715f', lineHeight: 19, marginBottom: 14 }}>
          HIVE found these open tasks, wishes, HD boards, threads, and recent POP notes. Mark what should happen next.
        </Text>

        <View style={{ gap: 12 }}>
          {carryForwardItems.map((item) => {
            const response = carryForwardResponsesByKey.get(carryForwardItemKey(item));
            const activeStatus = response?.status ?? 'keep_active';

            return (
              <View
                key={carryForwardItemKey(item)}
                style={{
                  backgroundColor: '#faf8f3',
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.38)',
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <View style={{ backgroundColor: '#fdf3dc', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#8a6b30' }}>
                      {item.sourceLabel}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', lineHeight: 19 }}>
                      {item.label}
                    </Text>
                    {item.detail ? (
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#6b7280', lineHeight: 17, marginTop: 3 }}>
                        {item.detail}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                  {CARRY_FORWARD_STATUS_OPTIONS.map((option) => {
                    const active = option.value === activeStatus;
                    const activeStyle = CARRY_FORWARD_STATUS_STYLE[option.value];
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => updateCarryForwardItem(item, { status: option.value })}
                        style={({ pressed }) => ({
                          backgroundColor: active ? activeStyle.backgroundColor : pressed ? '#fbf0d7' : '#fffdf5',
                          borderColor: active ? activeStyle.borderColor : 'rgba(222,193,129,0.42)',
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
                <ComposerBar
                  tone="light"
                  variant="form"
                  value={response?.note ?? ''}
                  onChangeText={(next) => updateCarryForwardItem(item, {
                    note: typeof next === 'function' ? next(response?.note ?? '') : next,
                  })}
                  placeholder={`Optional note for ${activeStatus ? getCarryForwardStatusLabel(activeStatus).toLowerCase() : 'this item'}...`}
                  minHeight={44}
                />
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderQuestion = (q: SurveyQuestion, index: number) => (
    <SurveyQuestionField
      key={q.id}
      question={q}
      index={index}
      value={answers[q.id]}
      onChange={(value) => setAnswer(q.id, value)}
      // A question that carries a second decision beside its answer — the HD
      // wish and how far it travels — writes that one itself, under its own
      // key, so it draft-saves and submits with everything else.
      answers={answers}
      onSetAnswer={setAnswer}
      communityId={survey.community_id}
    />
  );

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        <View style={{ backgroundColor: '#faf8f3', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '94%' }}>
          {/* Handle + close button */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 }}>
            {hasDraft ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="cloud-done-outline" size={13} color="#bd9348" />
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#bd9348' }}>Progress saved</Text>
              </View>
            ) : <View style={{ width: 80 }} />}
            <CloseButton
              onPress={onClose}
              accessibilityLabel="Close survey"
              color="#9a8060"
              size={22}
            />
          </View>

          {submitted ? (
            <View style={{ alignItems: 'center', padding: 48 }}>
              <Image source={cliveIcon} style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 16 }} contentFit="cover" cachePolicy="memory-disk" />
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', textAlign: 'center', marginBottom: 10 }}>All done!</Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
                {isEditingResponse
                  ? 'Your updated answers are saved. HIVE will be working from the latest version.'
                  : 'Your answers are saved for the meeting.'}
              </Text>
              <Pressable onPress={onClose} style={{ backgroundColor: '#bd9348', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>Back to HIVE</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}
            >
              {/* Header */}
              <View style={{ marginBottom: 28 }}>
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 8 }}>{survey.title}</Text>
                {survey.description && (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#6b7280', lineHeight: 21 }}>{survey.description}</Text>
                )}
                {survey.due_date && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#fdf3dc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>
                      📅 Due {formatSurveyDueDate(survey.due_date)}
                    </Text>
                  </View>
                )}
                <View style={{ height: 1, backgroundColor: 'rgba(222,193,129,0.3)', marginTop: 20 }} />
              </View>

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
                  <View style={{ backgroundColor: '#fdf3dc', borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 14, padding: 14, marginBottom: 22, gap: 10 }}>
                    <Pressable
                      onPress={() => collapsible && setSeasonRecapExpanded((v) => !v)}
                      disabled={!collapsible}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase', color: '#8a5a16' }}>
                        A little jog for your memory
                      </Text>
                      {collapsible && (
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>
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
                                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11.5, color: '#8a5a16', marginBottom: 2 }}>
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

              {draftLoaded && renderCarryForwardContext()}

              {/* A note block explains; it does not ask. So the numbers count
                  only the questions, and a person who reads "3 of 12" and then
                  counts the boxes finds twelve boxes. */}
              {draftLoaded && (() => {
                let asked = 0;
                return survey.questions.map((q) =>
                  renderQuestion(q, q.type === 'note' ? -1 : asked++)
                );
              })()}

              {error && (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#ef4444', marginBottom: 14 }}>{error}</Text>
              )}

              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                style={{ backgroundColor: '#bd9348', borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: submitting ? 0.7 : 1 }}
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
