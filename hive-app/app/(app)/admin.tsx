import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
  Modal,
  useWindowDimensions,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from '../../components/ui/SafeArea';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { EventAudienceToggle, type EventAudience } from '../../components/events/EventAudienceToggle';
import { useAuth } from '../../lib/hooks/useAuth';
import { queryKeys } from '../../lib/queryClient';
import {
  ANNUAL_DUES_AMOUNT,
  QUARTERLY_DUES_AMOUNT,
  getCurrentDuesPeriod,
  getDuesAmountForCoverage,
  type DuesCoverage,
} from '../../lib/dues';
import {
  HONEY_POT_PAYMENT_METHOD_OPTIONS,
  fetchHoneyPotLedger,
  recordHoneyPotTransaction,
  type HoneyPotLedgerEntry,
  type HoneyPotPaymentMethod,
} from '../../lib/honeyPot';
import { Avatar } from '../../components/ui/Avatar';
import { MemberProfileLink } from '../../components/ui/MemberProfileLink';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { AppHeader } from '../../components/navigation';
import {
  HiveMemberPanels,
  NewsletterPanel,
  PANEL_HAIRLINE,
  PANEL_INSET,
  hivePanelSkin,
} from '../../components/admin/GodModePanels';
import { WhatsNextPanel } from '../../components/admin/WhatsNextPanel';
import { EmailTemplatesPanel } from '../../components/admin/EmailTemplatesPanel';
import { HIVE_GOLD, accentOnDark, accentWash, hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
// Admin is always seen from the cosmos, whichever HIVE you happen to belong to,
// so its boxes take the space skin's ink and card values rather than asking
// `usePageSkin()` where the reader is standing.
import { SPACE_SKIN } from '../../lib/pageSkin';
import { SpaceGlobe } from '../../components/ui/SpaceGlobe';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
import { ModalBackdrop } from '../../components/ui/ModalBackdrop';
import { HoneyPotLedger } from '../../components/hive/HoneyPotLedger';
import { useSurveys } from '../../lib/hooks/useSurveys';
import {
  CARRY_FORWARD_ANSWER_KEY,
  getCarryForwardStatusLabel,
  normalizeCarryForwardResponse,
  type CarryForwardResponseItem,
} from '../../lib/carryForward';
import type { Survey, SurveyAnswers, SurveyQuestion, SurveyResponse } from '../../lib/hooks/useSurveys';
import { parseAmericanDate } from '../../lib/dateUtils';
import { getWishQuickTitle } from '../../lib/wishDisplay';
import type { Profile, UserRole, Event, Wish } from '../../types';

import { ComposerBar } from '../../components/ui/ComposerBar';
import { ThinkingBee } from '../../components/ui/ThinkingBee';
// Every statement on this screen used to be an `Alert.alert`, which in a browser
// draws nothing whatsoever — so "Please enter an email" and "Failed to create
// event" were both delivered to nobody. The two `Alert.alert` calls left are the
// native halves of a question, and each already has a `window.confirm` beside it
// for the web.
import { showAlert } from '../../lib/showAlert';
import { userFacingError } from '../../lib/userFacingError';
type MemberRow = {
  id: string;
  role: UserRole;
  profiles: Profile;
};

type SurveyResponseWithUser = SurveyResponse & {
  user?: Pick<Profile, 'id' | 'name' | 'email' | 'avatar_url'> | null;
};

type PopPreviewTextItem = {
  memberName: string;
  text: string;
};

type PopPreviewCarryForwardItem = {
  memberName: string;
  item: CarryForwardResponseItem;
};

type SurveyPopPreview = {
  energyAverage: number | null;
  energyCount: number;
  modes: { label: string; count: number }[];
  progress: PopPreviewTextItem[];
  obstacles: PopPreviewTextItem[];
  priorities: PopPreviewTextItem[];
  meetingTopics: PopPreviewTextItem[];
  carryForward: PopPreviewCarryForwardItem[];
  hasContent: boolean;
};

// The three roles and their labels moved out with the member editor above —
// they live as `ROLES` in `components/admin/GodModePanels.tsx` now, beside the
// buttons that set them, with a line each saying what the role actually does.

const DUES_QUARTERS = [1, 2, 3, 4] as const;

const formatMemberList = (names: string[]) => {
  if (names.length === 0) return 'members';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
};

const getDuesAmountLabel = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

// The invite machinery that used to sit here — pending-invite types, the
// dedupe helpers, `sendInvite` and `revokeInvite` — was dead code: defined,
// fetched into state, and rendered by nothing since the per-HIVE members panel
// moved to `components/admin/GodModePanels.tsx` on 2026-08-03. The live invite
// list, with its Resend and Revoke buttons, is in that file. Removed 2026-08-11
// so nobody hunts for the invite UI here again.

type HoneyPotFeedback = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

const HONEY_POT_FEEDBACK_STYLE: Record<HoneyPotFeedback['tone'], {
  backgroundColor: string;
  borderColor: string;
  color: string;
}> = {
  success: {
    backgroundColor: '#ecfdf3',
    borderColor: '#86efac',
    color: '#166534',
  },
  error: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    color: '#991b1b',
  },
  info: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    color: '#475569',
  },
};

/*
 * THE SURVEY BUILDER IS GONE. Nat, 2026-08-12: "Survey builder? kill it.
 * We'll just chat here." (She'd already said it on 2026-08-06: "honestly, I
 * wouldn't use this to make one anyway — I would just message you here, like
 * this, to create one.") Making or rewording a survey is now a thing she asks
 * for in chat and it appears as a row in `surveys` — the check-in Launch
 * buttons in GodModePanels insert theirs the same way. What used to live here:
 * the "Edit questions & schedule" mode of the Questions & answers sheet, with
 * its title/description boxes, due-date and time pickers, "Sync to next HIVE
 * meeting", the drag-to-reorder question list, the question-type pills, and
 * the "Use 2-3 min monthly template" button (the template itself lives on as
 * the live survey rows it seeded). The Responses side of that sheet — reading
 * what members answered — is untouched, and members answer surveys exactly as
 * before.
 */

const DEFAULT_RESPONSE_PERIOD = 'default';
const MONTHLY_CHECK_IN_PATTERN = /monthly\s+check-?in/i;

// Old questions saved before ids were mandatory get one on the way into the
// responses sheet, so React keys and answer lookups stay stable.
const createSurveyQuestionId = () => `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const cloneQuestion = (question: SurveyQuestion): SurveyQuestion => ({
  ...question,
  options: question.options ? [...question.options] : undefined,
});

function parseSurveyDueAt(dueDate?: string | null) {
  if (!dueDate) return null;
  const parsed = new Date(dueDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSurveyResponsePeriodForSurvey(survey: Survey) {
  const label = `${survey.title} ${survey.description ?? ''}`;
  if (!MONTHLY_CHECK_IN_PATTERN.test(label)) return DEFAULT_RESPONSE_PERIOD;

  const periodDate = parseSurveyDueAt(survey.due_date) ?? new Date();
  return `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`;
}

function sortSurveyResponsePeriods(a: string, b: string) {
  if (a === DEFAULT_RESPONSE_PERIOD && b !== DEFAULT_RESPONSE_PERIOD) return 1;
  if (b === DEFAULT_RESPONSE_PERIOD && a !== DEFAULT_RESPONSE_PERIOD) return -1;
  return b.localeCompare(a);
}

function formatSurveyResponsePeriod(period?: string | null) {
  if (!period || period === DEFAULT_RESPONSE_PERIOD) return 'Default';

  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) return period;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function formatSurveySubmittedAt(submittedAt?: string | null) {
  if (!submittedAt) return '';
  const parsed = new Date(submittedAt);
  if (Number.isNaN(parsed.getTime())) return submittedAt;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function hasSurveyAnswer(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function formatSurveyAnswer(value: unknown) {
  if (!hasSurveyAnswer(value)) return 'No answer';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value.trim() || 'No answer';

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getAnsweredQuestionCount(
  answers: SurveyAnswers,
  questions: SurveyQuestion[]
) {
  const questionIds = new Set(questions.map(question => question.id));
  const answeredKnown = questions.filter(question => hasSurveyAnswer(answers[question.id])).length;
  const answeredUnknown = Object.entries(answers)
    .filter(([questionId, answer]) => !questionIds.has(questionId) && hasSurveyAnswer(answer))
    .length;

  return answeredKnown + answeredUnknown;
}

function getResponseMemberName(
  response: SurveyResponseWithUser,
  memberProfilesById: Map<string, Profile>
) {
  return response.user?.name ?? memberProfilesById.get(response.user_id)?.name ?? 'Unknown member';
}

function getTextAnswer(answers: SurveyAnswers, key: string) {
  const value = answers[key];
  return typeof value === 'string' ? value.trim() : '';
}

function buildSurveyPopPreview(
  responses: SurveyResponseWithUser[],
  memberProfilesById: Map<string, Profile>
): SurveyPopPreview {
  const energyValues: number[] = [];
  const modeCounts = new Map<string, number>();
  const progress: PopPreviewTextItem[] = [];
  const obstacles: PopPreviewTextItem[] = [];
  const priorities: PopPreviewTextItem[] = [];
  const meetingTopics: PopPreviewTextItem[] = [];
  const carryForward: PopPreviewCarryForwardItem[] = [];

  responses.forEach((response) => {
    const memberName = getResponseMemberName(response, memberProfilesById);
    const answers = response.answers ?? {};
    const energy = answers.q_energy_level;
    if (typeof energy === 'number' && Number.isFinite(energy)) {
      energyValues.push(energy);
    }

    const mode = getTextAnswer(answers, 'q_energy_mode');
    if (mode) modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);

    const progressText = getTextAnswer(answers, 'q_pop_progress');
    if (progressText) progress.push({ memberName, text: progressText });

    const obstaclesText = getTextAnswer(answers, 'q_pop_obstacles');
    if (obstaclesText) obstacles.push({ memberName, text: obstaclesText });

    const prioritiesText = getTextAnswer(answers, 'q_pop_priorities');
    if (prioritiesText) priorities.push({ memberName, text: prioritiesText });

    const meetingTopicText = getTextAnswer(answers, 'q_meeting_topic');
    if (meetingTopicText) meetingTopics.push({ memberName, text: meetingTopicText });

    normalizeCarryForwardResponse(answers[CARRY_FORWARD_ANSWER_KEY]).forEach((item) => {
      carryForward.push({ memberName, item });
    });
  });

  const energyAverage = energyValues.length
    ? energyValues.reduce((sum, value) => sum + value, 0) / energyValues.length
    : null;
  const modes = Array.from(modeCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    energyAverage,
    energyCount: energyValues.length,
    modes,
    progress,
    obstacles,
    priorities,
    meetingTopics,
    carryForward,
    hasContent: (
      energyValues.length > 0
      || modes.length > 0
      || progress.length > 0
      || obstacles.length > 0
      || priorities.length > 0
      || meetingTopics.length > 0
      || carryForward.length > 0
    ),
  };
}

// Plain-text version of the POP preview for pasting into a Google Slides text box.
// Mirrors buildSurveyPopPreview sections; arrival-board answers (q_name_today,
// q_feeling_today, q_feeling_note) are never part of the preview, so they stay out.
function buildPopPreviewClipboardText(preview: SurveyPopPreview): string {
  const sections: string[] = [];

  const energyLines: string[] = [];
  if (preview.energyAverage !== null) {
    energyLines.push(
      `Average ${preview.energyAverage.toFixed(1)} from ${preview.energyCount} response${preview.energyCount === 1 ? '' : 's'}.`
    );
  }
  if (preview.modes.length > 0) {
    energyLines.push(preview.modes.map(mode => `${mode.label}: ${mode.count}`).join(' - '));
  }
  if (energyLines.length > 0) {
    sections.push(['ENERGY', ...energyLines].join('\n'));
  }

  const pushTextSection = (title: string, items: PopPreviewTextItem[]) => {
    if (items.length === 0) return;
    sections.push([title, ...items.map(item => `${item.memberName}: ${item.text}`)].join('\n'));
  };

  pushTextSection('PROGRESS', preview.progress);
  pushTextSection('OBSTACLES', preview.obstacles);
  pushTextSection('PRIORITIES', preview.priorities);
  pushTextSection('MEETING TOPICS', preview.meetingTopics);

  if (preview.carryForward.length > 0) {
    const carryForwardLines = preview.carryForward.flatMap(({ memberName, item }) => {
      const line = `${memberName}: ${getCarryForwardStatusLabel(item.status)} - ${item.sourceLabel}: ${item.label}`;
      return item.note ? [line, `  ${item.note}`] : [line];
    });
    sections.push(['CARRY-FORWARD', ...carryForwardLines].join('\n'));
  }

  return sections.join('\n\n');
}

function PopPreviewList({ title, items }: { title: string; items: PopPreviewTextItem[] }) {
  if (items.length === 0) return null;

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30' }}>
        {title}
      </Text>
      {items.map((item, index) => (
        <Text key={`${title}-${item.memberName}-${index}`} style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#2d2d2d', lineHeight: 18 }}>
          <Text style={{ fontFamily: 'Lato_700Bold' }}>{item.memberName}: </Text>
          {item.text}
        </Text>
      ))}
    </View>
  );
}

function CarryForwardPreviewList({ items }: { items: PopPreviewCarryForwardItem[] }) {
  if (items.length === 0) return null;

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30' }}>
        Carry-forward decisions
      </Text>
      {items.map(({ memberName, item }, index) => (
        <View key={`${memberName}-${item.type}-${item.id}-${index}`} style={{ gap: 2 }}>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#2d2d2d', lineHeight: 18 }}>
            <Text style={{ fontFamily: 'Lato_700Bold' }}>{memberName}: </Text>
            {getCarryForwardStatusLabel(item.status)} - {item.sourceLabel}: {item.label}
          </Text>
          {item.note ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#6b7280', lineHeight: 17, marginLeft: 10 }}>
              {item.note}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * The folder's edge, and a small gold arrow while there is more of it than the
 * screen can hold.
 *
 * Nat, comparing her laptop with her phone on 2026-08-06: *"See how the tabs are
 * attached to the folder? That's how we want it."* The phone had stopped doing
 * that — the tabs became free-floating chips that wrapped onto a line of their
 * own, on the reasoning that a tab which has wrapped is attached to nothing.
 * True, and the answer is to stop it wrapping rather than to stop it being a
 * tab. `OG HIVE · Members (11) · Meeting · Check-ins · + New Member` wants about
 * 440 points and a 375-point phone gives the box 343, so the row slides sideways
 * along the panel's top edge and stays welded to it.
 *
 * Nat, 2026-08-06: *"I don't like having to scroll to the side to see other
 * tabs, how do we fix that? Do we write at an angle? Stack the words on top of
 * each other? Make the font smaller?"* Angled words are hard to read and stacked
 * ones make a tab taller than the row it is attached to, so both trade one
 * awkwardness for another. Fewer and shorter tabs is the fix, and it is what the
 * rest of that morning did: the Surveys box went entirely, and Meeting tools
 * became Meeting. The strip stays as the safety net — *"the scroll on the OG
 * HIVE box didn't bother me"* — and a HIVE with a short name and few members
 * now fits without it.
 *
 * The arrow is the whole point of the wrapper: a strip that scrolls with no sign
 * it scrolls is how the first tab ended up looking clipped rather than reachable.
 * It appears only while there is genuinely something further right, and goes when
 * you get there. Same idea as the tab row on App Feedback, which met the same
 * wall a day earlier.
 */
function PanelTabStrip({ edge, children }: { edge: string; children: ReactNode }) {
  const scrollRef = useRef<ScrollView>(null);
  const [visibleWidth, setVisibleWidth] = useState(0);
  const [rowWidth, setRowWidth] = useState(0);
  const [scrolledBy, setScrolledBy] = useState(0);
  // Four points of slack, so a rounding difference between the row and the box
  // never leaves an arrow pointing at nothing.
  const moreToTheLeft = scrolledBy > 4;
  const moreToTheRight = rowWidth - visibleWidth - scrolledBy > 4;
  const move = (direction: -1 | 1) => {
    const distance = Math.max(120, visibleWidth * 0.7);
    const max = Math.max(0, rowWidth - visibleWidth);
    scrollRef.current?.scrollTo({
      x: Math.max(0, Math.min(max, scrolledBy + direction * distance)),
      animated: true,
    });
  };
  const arrow = (direction: -1 | 1) => (
    <Pressable
      onPress={() => move(direction)}
      accessibilityRole="button"
      accessibilityLabel={direction < 0 ? 'Show earlier tabs' : 'Show more tabs'}
      hitSlop={6}
      style={({ pressed }) => ({
        position: 'absolute',
        [direction < 0 ? 'left' : 'right']: 0,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(11,11,18,0.96)',
          borderWidth: 1,
          borderColor: edge,
        }}
      >
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16, lineHeight: 18, color: SPACE_SKIN.gold }}>
          {direction < 0 ? '‹' : '›'}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => setVisibleWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setRowWidth(width)}
        onScroll={(event) => setScrolledBy(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        // Bottoms level, whatever height each tab is, because the bottom is the
        // edge they are all attached to.
        contentContainerStyle={{ alignItems: 'flex-end', gap: 3 }}
      >
        {children}
      </ScrollView>
      {moreToTheLeft ? arrow(-1) : null}
      {moreToTheRight ? arrow(1) : null}
    </View>
  );
}

// Panel tabs are text only — the gold header bar is the mark, an icon inside it
// just crowds the word (Nat 2026-07-26). Icons belong in the panel body.
//
// Hand it a HIVE's accent colour and the whole folder — tab, wash, edge, glow —
// comes up in that HIVE instead of the house cream (Nat 2026-08-03). Boxes that
// belong to no single HIVE leave it off: they keep the cream name tab and the
// gold edge over a body in no colour at all, which is how the Newsletter says
// "this belongs to all of them" while wearing the same folder.
function AdminPanel({
  title,
  titleTabKey,
  tabs,
  activeTab,
  onTabChange,
  action,
  accent,
  style,
  bodyStyle,
  children,
}: {
  title: string;
  /** When supplied, the folder name is also its first selectable tab. */
  titleTabKey?: string;
  /**
   * Extra folder tabs beside the title. Nat's idea, 2026-08-04:
   *
   *   "So you have 'pick a hive in the rail first', but what if we just added
   *   extra tabs to these ones... this text box could say 'OG HIVE' and then
   *   the tabs are 'members', 'meeting tools' and 'check in responses'? Then
   *   you can see which hive is using which tools, no confusion!!"
   *
   * It dissolves the problem rather than solving it. The tools panel could
   * never name a HIVE — it sat beside all three — so it had to send you away to
   * pick one, from a screen the picker cannot reach. Hang the tools off the
   * HIVE's own folder and the HIVE is already chosen by the time you see them.
   */
  tabs?: { key: string; label: string }[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /**
   * The one thing this box lets you DO, drawn as a tab on the same edge.
   *
   * Nat, 2026-08-06: *"the 'add new member' instead of being a separate pill on
   * the far left, I think it should just be another coloured tab on the folder."*
   * It arrives as a label and a handler rather than a finished view, so the
   * panel can colour it against its own folder — a caller handing in a ready-made
   * pill is how it ended up as a different object in the first place.
   */
  action?: { label: string; onPress: () => void };
  accent?: string;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const skin = accent ? hivePanelSkin(accent) : null;
  const tabFill = skin?.tab ?? 'rgba(253,243,220,0.86)';
  const tabText = skin?.tabText ?? '#2d2d2d';
  const edge = skin?.border ?? 'rgba(222,193,129,0.7)';
  /**
   * The boxes that belong to no HIVE are made of the same stuff as the ones that
   * do.
   *
   * Nat, 2026-08-06: *"the surveys and newsletter are aggressively different
   * styles than the other ones, can we match them a little more?"* They were
   * near-solid cream slabs holding charcoal text while every HIVE box was a dark
   * pane floating on the star field — two materials in one frame, which is the
   * same complaint she made in a milder form back on 2026-08-03 ("the cream ones
   * should be a little more transparent"). Thinning the cream was never going to
   * finish it: cream is a different material at every opacity.
   *
   * So they are dark panes now, with light ink, exactly like the accented ones.
   * The body borrows no colour at all — HIVE-Wide's own card value — because a
   * gold body would read as OG HIVE's box, and the Newsletter speaks for every
   * HIVE at once. What keeps it house-coloured is the cream name tab and the gold
   * edge, which is what it already wore and what Nat recognises it by.
   *
   * "The boxes", plural, was true until 2026-08-06, when the Surveys box went.
   * The Newsletter is the only one left that belongs to no single HIVE.
   */
  const bodyFill = skin?.body ?? SPACE_SKIN.card;
  const glow = skin?.shadow ?? '#bd9348';

  /**
   * One folder at every width.
   *
   * A phone had its own header for two days: the name on one line with the
   * action beside it, then the tabs as free-floating chips wrapping underneath.
   * Nat looked at that and at her laptop side by side (2026-08-06) — *"These look
   * janky, their tabs are all broken. It should look more like this… See how the
   * tabs are attached to the folder? That's how we want it."*
   *
   * So the phone gets the desktop folder, and the width problem is solved where
   * it actually lives: `PanelTabStrip` slides the row sideways along the panel's
   * top edge instead of stacking it. Two headers drawing one idea is what let
   * them drift apart in the first place; there is one now.
   *
   * The width is still read here rather than passed in, the way AppHeader and
   * HeaderTabs read the HIVE and the skin themselves, and it buys nothing but
   * slightly tighter lettering on a small screen.
   */
  const { width } = useWindowDimensions();
  const narrow = width < 768;

  /** The silhouette every tab on this edge shares: open at the bottom, onto the sheet. */
  const tabShape = {
    borderColor: edge,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: narrow ? 10 : 11,
    // Nothing shrinks: the strip scrolls, so a long label costs a slide rather
    // than squeezing the tab beside it into a sliver.
    flexShrink: 0,
  } as const;

  const renderTab = (t: { key: string; label: string }) => {
    const on = t.key === activeTab;
    return (
      <Pressable
        key={t.key}
        onPress={() => onTabChange?.(t.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={{
          ...tabShape,
          // An UNSELECTED tab had a transparent ground and kept the
          // selected tab's near-black ink, so on the space-black admin
          // page it was black text on black — Nat: "These headers
          // disappear here, they are too black." It gets a dim ground of
          // its own and light ink, so all three read as a row of tabs with
          // one of them in front.
          //
          // 2026-08-11, Nat again: with the name tab, the selected tab AND
          // the action tab all carrying fill, "your eyes think that maybe
          // you're in the check in tab, not the member tab... its too hard
          // to tell which tab you have selected, unless you make them all
          // clear & the colored one is the one you've selected." So
          // selection now owns the solid: the selected tab is the OPAQUE
          // accent (`washedTab`, a step brighter than the name tab's 0.6
          // veil), every unselected tab stays a clear ghost, and the action
          // tab became an outline (below) so nothing competes.
          backgroundColor: on ? (skin?.washedTab ?? tabFill) : 'rgba(255,248,233,0.07)',
          // An inactive tab sits lower, so the active one reads as the sheet in
          // front rather than one of a row.
          paddingVertical: on ? 7 : 5,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: on ? 'Lato_700Bold' : 'Lato_400Regular',
            fontSize: narrow ? 12 : 12.5,
            // The selected tab's ground is `washedTab` — the accent lifted
            // nearly to pastel — so its ink is charcoal, the exact pairing
            // the Newsletter tab (cream fill, dark ink) already had. Nat,
            // 2026-08-11: cream-on-pastel was "too hard to read... but the
            // newsletter one worked great."
            color: on ? (skin ? '#2d2d2d' : tabText) : 'rgba(255,248,233,0.72)',
          }}
        >
          {t.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[{ marginBottom: 0 }, style]}>
      <PanelTabStrip edge={edge}>
        {/* THE NAME. Newsletter combines its name with its ideas worktop, so its
            name is also a real first tab. HIVE folders keep a static name. */}
        {titleTabKey ? (
          <Pressable
            onPress={() => onTabChange?.(titleTabKey)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === titleTabKey }}
            style={{
              ...tabShape,
              backgroundColor: activeTab === titleTabKey ? tabFill : 'rgba(255,248,233,0.07)',
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              paddingHorizontal: narrow ? 12 : 14,
              paddingVertical: activeTab === titleTabKey ? 7 : 5,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: narrow ? 15.5 : 17,
                color: activeTab === titleTabKey ? tabText : 'rgba(255,248,233,0.72)',
              }}
            >
              {title}
            </Text>
          </Pressable>
        ) : (
          <View
            style={{
              ...tabShape,
              backgroundColor: tabFill,
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              paddingHorizontal: narrow ? 12 : 14,
              paddingVertical: 7,
            }}
          >
            <Text numberOfLines={1} style={{ fontFamily: 'Lato_700Bold', fontSize: narrow ? 15.5 : 17, color: tabText }}>
              {title}
            </Text>
          </View>
        )}
        {(tabs ?? []).map(renderTab)}
        {/* THE ACTION, wearing the folder's shape and the folder's OWN colour.
            Gold for OG, blue for Tech, purple for Production.

            Nat, 2026-08-06: *"why can't the + New Member match its HIVE? Gold
            for OG, Blue for Tech & Purple for Production? I feel like I've asked
            for that 100 times."* She has. It was solid #bd9348 on all three, on
            the rule that gold is the doing-colour everywhere in HIVE — Send
            Invite, Add. That rule is real and it loses to being asked three
            times, and the tab is inside a HIVE's folder where the HIVE's colour
            is what everything else is already wearing.

            What keeps it from reading as a PLACE is everything else about it: it
            sits at the low height an unselected tab sits at, never takes the
            raised look of the selected one, and answers to `button` rather than
            `tab`, so nothing about it can say "you are here". Solid also puts it
            a step brighter than the selected tab, which is the same colour at
            0.6 alpha.

            The lettering stays cream, the way every filled tab on this edge
            already does. `accentOnDark` is the tool for a HIVE's colour used as
            INK on black; used on the fill here it would pale the tab out into
            exactly the light-ground-dark-ink look that means "selected". Cream
            on Tech's #2f4a63 measures about 8:1 — better than the cream on gold
            this tab shipped with. */}
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => ({
              ...tabShape,
              // An OUTLINE in the HIVE's colour, not a fill (2026-08-11).
              // Solid was Nat's own earlier ask ("gold for OG, blue for
              // Tech") — but a solid action beside a solid selected tab is
              // what made selection unreadable, and selection owns the solid
              // now. The colour-per-HIVE survives in the border and ink.
              backgroundColor: pressed ? accentWash(accent ?? HIVE_GOLD, 0.25) : 'transparent',
              borderColor: accent ?? HIVE_GOLD,
              paddingHorizontal: narrow ? 11 : 12,
              paddingVertical: 5,
            })}
          >
            <Text
              numberOfLines={1}
              style={{ fontFamily: 'Lato_700Bold', fontSize: narrow ? 12 : 12.5, color: accentOnDark(accent ?? HIVE_GOLD) }}
            >
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </PanelTabStrip>
      <View
        style={[{
          backgroundColor: bodyFill,
          borderRadius: 20,
          // The square corner is where the name tab lands, at every width.
          borderTopLeftRadius: 0,
          borderWidth: 1,
          borderColor: edge,
          shadowColor: glow,
          shadowOpacity: 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 5 },
          elevation: 3,
          overflow: 'hidden',
        }, bodyStyle]}
      >
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.75)', marginHorizontal: 10 }} />
        {children}
      </View>
    </View>
  );
}

// The floating cream pill that used to carry "+ New Member" and "+ Create" is
// gone. It sat off to the side of the folder as a separate object, which is
// exactly what Nat asked to stop (2026-08-06) — the action is a tab on the same
// edge now, drawn by AdminPanel in the folder's own colours so it can never
// drift from them again.

function LockedAdminScreen({
  onHomePress,
  onLedgerPress,
}: {
  onHomePress: () => void;
  onLedgerPress: () => void;
}) {
  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
      <SpaceGlobe />
      <AppHeader title="Admin" tone="wide" />
      <BounceScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          padding: 20,
          paddingBottom: 96,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 560,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: 'rgba(222,193,129,0.78)',
            backgroundColor: '#fffdf5',
            padding: 24,
            alignItems: 'center',
            shadowColor: '#bd9348',
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 4,
          }}
        >
          <View style={{ width: 112, height: 100, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Text style={{ fontSize: 58, lineHeight: 66 }}>🐝</Text>
            <View
              style={{
                position: 'absolute',
                width: 106,
                height: 92,
                borderWidth: 2,
                borderColor: 'rgba(189,147,72,0.42)',
                backgroundColor: 'rgba(253,243,220,0.72)',
                transform: [{ rotate: '30deg' }],
                zIndex: -1,
              }}
            />
          </View>

          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 26, color: '#2d2d2d', textAlign: 'center', marginBottom: 8 }}>
            Oops, this comb is Admin-only
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, color: '#6b5b42', lineHeight: 22, textAlign: 'center', maxWidth: 430 }}>
            Not for you, honey bunny. Members can see the transparent Honey Pot ledger, but only Treasurers and Admins can manage money, members, and surveys here.
          </Text>

          <View
            style={{
              width: '100%',
              marginTop: 22,
              padding: 16,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.42)',
              backgroundColor: '#fff8e8',
            }}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30', textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' }}>
              Still transparent
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#76654a', lineHeight: 20, textAlign: 'center' }}>
              Every Honey Pot entry stays visible to the community. This locked door only protects the editing tools.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 22 }}>
            <Pressable
              onPress={onHomePress}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: pressed ? '#a77f38' : '#bd9348',
                borderRadius: 999,
                paddingHorizontal: 18,
                paddingVertical: 11,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: 'white' }}>
                Back to Home
              </Text>
            </Pressable>
            <Pressable
              onPress={onLedgerPress}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(222,193,129,0.72)',
                paddingHorizontal: 18,
                paddingVertical: 11,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#8a6b30' }}>
                View Honey Pot Ledger
              </Text>
            </Pressable>
          </View>
        </View>
      </BounceScrollView>
    </SafeAreaView>
  );
}

export default function AdminScreen() {
  const { profile, community, communityId, communityRole } = useAuth();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const queryClient = useQueryClient();
  const useMobileLayout = width < 768;
  const currentDuesPeriod = getCurrentDuesPeriod();
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  // The newsletter list spans every HIVE, so it is owners only — see migration
  // 147. A HIVE's own admin running the subscriber list of all the others was
  // the hole; showing them a box the database will hand back empty is the
  // avoidable half of it.
  const isOwner = profile?.is_owner === true;
  const isTreasurer = communityRole === 'treasurer' || profile?.role === 'treasurer';
  const canEditHoneyPot = isTreasurer || isAdmin;
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);

  // Modal states
  const checkInOpenRequestIdRef = useRef(0);
  const [pendingCheckInOpen, setPendingCheckInOpen] = useState<{
    communityId: string;
    requestId: number;
  } | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);

  // Survey management. The create-a-survey half of this went with the Surveys
  // box on 2026-08-06, and the edit-questions half followed on 2026-08-12;
  // what is left reads the answers to the check-ins that exist.
  const { allSurveys, refetch: refetchSurveys } = useSurveys(
    canEditHoneyPot ? communityId ?? undefined : undefined,
    canEditHoneyPot ? profile?.id : undefined
  );
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  // The questions of the survey being read, for the responses sheet's answer
  // labels and counts. Read-only since 2026-08-12 — the builder that edited
  // them is gone (see the removal note by MONTHLY_CHECK_IN_PATTERN above).
  const [surveyEditorQuestions, setSurveyEditorQuestions] = useState<SurveyQuestion[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponseWithUser[]>([]);
  const [surveyResponsesLoading, setSurveyResponsesLoading] = useState(false);
  const [surveyResponsesError, setSurveyResponsesError] = useState<string | null>(null);
  const [selectedSurveyResponsePeriod, setSelectedSurveyResponsePeriod] = useState<string | null>(null);

  // Form states
  const [eventTitle, setEventTitle] = useState('');
  const [eventAudience, setEventAudience] = useState<EventAudience>('members');
  const [eventDate, setEventDate] = useState('');
  const [eventDescription, setEventDescription] = useState('');

  // Honey Pot state
  const [honeyPotBalance, setHoneyPotBalance] = useState<number>(0);
  const [honeyPotTransactions, setHoneyPotTransactions] = useState<HoneyPotLedgerEntry[]>([]);
  const [honeyPotLedgerLoading, setHoneyPotLedgerLoading] = useState(false);
  const [honeyPotAmount, setHoneyPotAmount] = useState('');
  const [honeyPotNote, setHoneyPotNote] = useState('');
  const [honeyPotPaymentMethod, setHoneyPotPaymentMethod] = useState<HoneyPotPaymentMethod | null>(null);
  const [honeyPotCounterparty, setHoneyPotCounterparty] = useState('');
  const [honeyPotType, setHoneyPotType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [recordingHoneyPot, setRecordingHoneyPot] = useState(false);
  const [honeyPotFeedback, setHoneyPotFeedback] = useState<HoneyPotFeedback | null>(null);
  const [duesCoverage, setDuesCoverage] = useState<DuesCoverage>('none');
  const [duesMemberIds, setDuesMemberIds] = useState<string[]>([]);
  const [duesYear, setDuesYear] = useState(String(currentDuesPeriod.year));
  const [duesQuarter, setDuesQuarter] = useState(String(currentDuesPeriod.quarter));

  useEffect(() => {
    if (honeyPotType !== 'deposit') return;
    const duesAmount = getDuesAmountForCoverage(duesCoverage);
    if (duesAmount) setHoneyPotAmount(String(duesAmount * Math.max(duesMemberIds.length, 1)));
  }, [duesCoverage, duesMemberIds.length, honeyPotType]);

  const fetchData = useCallback(async () => {
    if (!communityId || !canEditHoneyPot) return;
    // Fetch members
    const { data: membersData } = await supabase
      .from('community_memberships')
      .select('id, role, profiles(*)')
      .eq('community_id', communityId)
      .order('created_at', { ascending: true });
    const memberRows = (membersData || []) as unknown as MemberRow[];
    if (membersData) setMembers(memberRows);

    // Fetch honey pot balance and transparent ledger
    try {
      setHoneyPotLedgerLoading(true);
      const ledger = await fetchHoneyPotLedger(communityId);
      setHoneyPotBalance(ledger.balance);
      setHoneyPotTransactions(ledger.transactions);
    } catch (honeyPotError) {
      console.warn('Could not load honey pot ledger', honeyPotError);
      setHoneyPotBalance(0);
      setHoneyPotTransactions([]);
    } finally {
      setHoneyPotLedgerLoading(false);
    }
  }, [canEditHoneyPot, communityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const memberProfilesById = useMemo(() => {
    const next = new Map<string, Profile>();
    members.forEach((member) => next.set(member.profiles.id, member.profiles));
    return next;
  }, [members]);

  const surveyResponsePeriods = useMemo(() => {
    if (!editingSurvey) return [];

    const periods = new Set<string>([getSurveyResponsePeriodForSurvey(editingSurvey)]);
    surveyResponses.forEach((response) => {
      periods.add(response.response_period ?? DEFAULT_RESPONSE_PERIOD);
    });

    return Array.from(periods).sort(sortSurveyResponsePeriods);
  }, [editingSurvey, surveyResponses]);

  const activeSurveyResponsePeriod = (
    selectedSurveyResponsePeriod && surveyResponsePeriods.includes(selectedSurveyResponsePeriod)
      ? selectedSurveyResponsePeriod
      : surveyResponsePeriods[0] ?? null
  );

  const activeSurveyResponses = useMemo(() => {
    if (!activeSurveyResponsePeriod) return [];

    return surveyResponses.filter((response) => (
      (response.response_period ?? DEFAULT_RESPONSE_PERIOD) === activeSurveyResponsePeriod
    ));
  }, [activeSurveyResponsePeriod, surveyResponses]);

  const activeSurveyPopPreview = useMemo(() => (
    buildSurveyPopPreview(activeSurveyResponses, memberProfilesById)
  ), [activeSurveyResponses, memberProfilesById]);

  const [deckCopyFeedback, setDeckCopyFeedback] = useState<'pop' | 'wishes' | null>(null);
  const [hdWishesCopying, setHdWishesCopying] = useState(false);
  const deckCopyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (deckCopyFeedbackTimeoutRef.current) clearTimeout(deckCopyFeedbackTimeoutRef.current);
  }, []);

  const flashDeckCopyFeedback = useCallback((section: 'pop' | 'wishes') => {
    if (deckCopyFeedbackTimeoutRef.current) clearTimeout(deckCopyFeedbackTimeoutRef.current);
    setDeckCopyFeedback(section);
    deckCopyFeedbackTimeoutRef.current = setTimeout(() => setDeckCopyFeedback(null), 2000);
  }, []);

  const handleCopyPopPreview = useCallback(async () => {
    const text = buildPopPreviewClipboardText(activeSurveyPopPreview);
    if (!text) return;

    try {
      await Clipboard.setStringAsync(text);
      flashDeckCopyFeedback('pop');
    } catch {
      showAlert('Copy failed', 'Could not copy the POP preview to the clipboard.');
    }
  }, [activeSurveyPopPreview, flashDeckCopyFeedback]);

  const handleCopyHdWishes = useCallback(async () => {
    if (!communityId || hdWishesCopying) return;

    setHdWishesCopying(true);
    try {
      const { data, error } = await supabase
        .from('wishes')
        .select('*, user:profiles(*)')
        .eq('status', 'public')
        .or('is_active.is.true,is_active.is.null')
        .eq('community_id', communityId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const activeWishes = (data ?? []) as (Wish & { user: Profile | null })[];
      if (activeWishes.length === 0) {
        showAlert('No HD wishes', 'There are no active public wishes to copy yet.');
        return;
      }

      const linesByMember = new Map<string, string[]>();
      activeWishes.forEach((wish) => {
        const memberName = wish.user?.name
          ?? memberProfilesById.get(wish.user_id)?.name
          ?? 'Unknown member';
        const line = `${memberName} — ${getWishQuickTitle(wish, 120)}`;
        const memberLines = linesByMember.get(memberName);
        if (memberLines) memberLines.push(line);
        else linesByMember.set(memberName, [line]);
      });

      const sortedMemberNames = Array.from(linesByMember.keys())
        .sort((a, b) => a.localeCompare(b));
      const text = [
        'MEMBER HDs',
        ...sortedMemberNames.flatMap(name => linesByMember.get(name) ?? []),
      ].join('\n');

      await Clipboard.setStringAsync(text);
      flashDeckCopyFeedback('wishes');
    } catch {
      showAlert('Copy failed', 'Could not load HD wishes. Try again in a moment.');
    } finally {
      setHdWishesCopying(false);
    }
  }, [communityId, hdWishesCopying, memberProfilesById, flashDeckCopyFeedback]);

  const activeSurveySubmittedMemberIds = useMemo(() => new Set(
    activeSurveyResponses.map((response) => response.user_id)
  ), [activeSurveyResponses]);

  const missingSurveyMembers = useMemo(() => (
    members.filter((member) => !activeSurveySubmittedMemberIds.has(member.profiles.id))
  ), [activeSurveySubmittedMemberIds, members]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), refetchSurveys()]);
    setRefreshing(false);
  };

  const loadSurveyResponses = useCallback(async (survey: Survey) => {
    if (!communityId) return;

    setSurveyResponses([]);
    setSurveyResponsesLoading(true);
    setSurveyResponsesError(null);

    try {
      let { data, error } = await (supabase as any)
        .from('survey_responses')
        .select('*, user:profiles(id, name, email, avatar_url)')
        .eq('survey_id', survey.id)
        // A HIVE-Wide check-in files its answers with no community_id, so an
        // `eq` can never match them — Admin showed zero answers, silently, in
        // all three HIVE tabs (found by audit, 2026-09-02).
        .or(`community_id.eq.${communityId},community_id.is.null`)
        .order('submitted_at', { ascending: false });

      if (error) {
        const fallback = await (supabase as any)
          .from('survey_responses')
          .select('*')
          .eq('survey_id', survey.id)
          // A HIVE-Wide check-in files its answers with no community_id, so an
        // `eq` can never match them — Admin showed zero answers, silently, in
        // all three HIVE tabs (found by audit, 2026-09-02).
        .or(`community_id.eq.${communityId},community_id.is.null`)
          .order('submitted_at', { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        setSurveyResponsesError('Could not load responses for this survey.');
        return;
      }

      setSurveyResponses((data ?? []) as SurveyResponseWithUser[]);
    } catch (error) {
      console.warn('Could not load survey responses', error);
      setSurveyResponsesError('Could not load responses for this survey.');
    } finally {
      setSurveyResponsesLoading(false);
    }
  }, [communityId]);

  const showHoneyPotFeedback = useCallback((
    tone: HoneyPotFeedback['tone'],
    title: string,
    message: string
  ) => {
    setHoneyPotFeedback({ tone, message });
    if (typeof window === 'undefined') {
      Alert.alert(title, message);
    }
  }, []);

  // Load the requested HIVE's survey directly before opening it. `useSurveys`
  // intentionally keeps the previous HIVE's rows while the next fetch starts;
  // reading that cache here could put OG answers under Tech's heading.
  useEffect(() => {
    if (!pendingCheckInOpen) return;
    if (communityId !== pendingCheckInOpen.communityId) return;

    let cancelled = false;
    const target = pendingCheckInOpen;

    void (async () => {
      const { data, error } = await supabase
        .from('surveys')
        .select('*')
        .eq('community_id', target.communityId)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      setPendingCheckInOpen((current) => (
        current?.requestId === target.requestId ? null : current
      ));

      if (error) {
        showAlert('Could not open check-in', 'Please try Questions & answers again.');
        return;
      }

      const checkIn = ((data ?? []) as Survey[]).find((survey) => (
        survey.community_id === target.communityId
        && /monthly\s+check-?in/i.test(survey.title)
      ));
      if (!checkIn) {
        showAlert('Nothing to review yet', 'This HIVE has no Before we meet check-in to review.');
        return;
      }

      openSurveyEditor(checkIn);
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingCheckInOpen, communityId]);

  const openSurveyEditor = (survey: Survey) => {
    setEditingSurvey(survey);
    setSurveyResponses([]);
    setSurveyResponsesError(null);
    setSelectedSurveyResponsePeriod(getSurveyResponsePeriodForSurvey(survey));
    setSurveyEditorQuestions((survey.questions ?? []).map(question => ({
      ...cloneQuestion(question),
      id: question.id || createSurveyQuestionId(),
    })));
    void loadSurveyResponses(survey);
  };

  const closeSurveyEditor = () => {
    setEditingSurvey(null);
    setSurveyEditorQuestions([]);
    setSurveyResponses([]);
    setSurveyResponsesError(null);
    setSelectedSurveyResponsePeriod(null);
  };

  // `updateMemberRole` and `removeMember` used to live here, and they are gone
  // (2026-08-06). They were the reason Nat could not manage anybody who had
  // actually joined: the per-HIVE members panel moved into
  // `components/admin/GodModePanels.tsx` on 2026-08-03, and these two were left
  // behind — defined, called by nothing, looking from the outside like the
  // feature was still here. The working version is `changeRole` and
  // `removeMember` in that file, on each HIVE's own Members tab.
  //
  // Worth keeping in mind if either is ever reached for again: the old pair
  // said "the community" for a per-HIVE fact, told `window.confirm` on web and
  // `Alert.alert` on a phone (which does nothing in a browser), and let the
  // last admin of a HIVE be demoted away, leaving nobody who could run it.

  const createEvent = async () => {
    if (!eventTitle || !eventDate || !communityId) {
      showAlert('Error', 'Please fill in all required fields');
      return;
    }

    // Convert American date format to ISO for storage
    const eventDateIso = parseAmericanDate(eventDate);
    if (!eventDateIso) {
      showAlert('Error', 'Please enter date in MM-DD-YYYY format');
      return;
    }

    const { error } = await supabase.from('events').insert({
      title: eventTitle,
      event_date: eventDateIso,
      description: eventDescription,
      event_type: 'custom',
      created_by: profile?.id,
      community_id: communityId,
      visibility: eventAudience,
      // This screen asks one question, so the answer is both: who can see it and
      // who is invited. Leaving `invited_scope` to its default would have made
      // an "every HIVE" event visible to everyone and open to nobody but us —
      // a narrowing nobody asked for (migration 148).
      invited_scope: eventAudience,
    });

    if (error) {
      showAlert('Error', 'Failed to create event');
    } else {
      setShowEventModal(false);
      setEventTitle('');
      setEventDate('');
      setEventDescription('');
      setEventAudience('members');
      await fetchData();
    }
  };

  const updateHoneyPot = async () => {
    if (recordingHoneyPot) return;
    const amount = parseFloat(honeyPotAmount);
    if (isNaN(amount) || amount <= 0) {
      showHoneyPotFeedback('error', 'Error', 'Please enter a valid amount.');
      return;
    }
    if (!communityId) {
      showHoneyPotFeedback('error', 'Error', 'No community context. Please refresh and try again.');
      return;
    }
    if (!honeyPotPaymentMethod) {
      showHoneyPotFeedback('error', 'Error', 'Please choose how this money moved.');
      return;
    }
    const taggedAsDues = honeyPotType === 'deposit' && duesCoverage !== 'none';
    const duesYearValue = Number(duesYear);
    const duesQuarterValue = Number(duesQuarter);

    if (taggedAsDues && selectedDuesMembers.length === 0) {
      showHoneyPotFeedback('error', 'Error', 'Please choose who this dues payment is for.');
      return;
    }
    if (taggedAsDues && (!duesYearValue || duesYearValue < 2020)) {
      showHoneyPotFeedback('error', 'Error', 'Please enter a valid dues year.');
      return;
    }
    if (duesCoverage === 'quarter' && (!duesQuarterValue || duesQuarterValue < 1 || duesQuarterValue > 4)) {
      showHoneyPotFeedback('error', 'Error', 'Please choose a valid quarter.');
      return;
    }

    const perMemberDuesAmount = taggedAsDues ? getDuesAmountForCoverage(duesCoverage) : null;
    const expectedDuesAmount = perMemberDuesAmount ? perMemberDuesAmount * selectedDuesMembers.length : null;
    if (taggedAsDues && expectedDuesAmount !== null && Math.abs(amount - expectedDuesAmount) >= 0.005) {
      showHoneyPotFeedback(
        'error',
        'Error',
        `Dues amount should be ${getDuesAmountLabel(expectedDuesAmount)} for ${selectedDuesMembers.length} member${selectedDuesMembers.length === 1 ? '' : 's'}.`
      );
      return;
    }

    const signedAmount = honeyPotType === 'withdrawal' ? -amount : amount;
    const duesMembersToRecord = taggedAsDues ? selectedDuesMembers : [];

    try {
      setRecordingHoneyPot(true);
      setHoneyPotFeedback({
        tone: 'info',
        message: `Recording Honey Pot ${honeyPotType === 'deposit' ? 'deposit' : 'withdrawal'}...`,
      });
      const results = [];
      if (taggedAsDues) {
        for (const duesMember of duesMembersToRecord) {
          results.push(await recordHoneyPotTransaction({
            communityId,
            signedAmount: perMemberDuesAmount ?? amount,
            transactionType: honeyPotType,
            note: honeyPotNote,
            paymentMethod: honeyPotPaymentMethod,
            externalCounterpartyName: null,
            recordedBy: profile?.id ?? null,
            relatedUserId: duesMember.id,
            duesYear: duesYearValue,
            duesQuarter: duesCoverage === 'quarter' ? duesQuarterValue : null,
            duesCoveredQuarters: duesCoverage === 'year' ? 4 : 1,
            fallbackDuesLabel: `${duesMember.name} · ${duesCoverage === 'year' ? `${duesYearValue} full year` : `Q${duesQuarterValue} ${duesYearValue}`}`,
          }));
        }
      } else {
        results.push(await recordHoneyPotTransaction({
          communityId,
          signedAmount,
          transactionType: honeyPotType,
          note: honeyPotNote,
          paymentMethod: honeyPotPaymentMethod,
          externalCounterpartyName: honeyPotCounterparty,
          recordedBy: profile?.id ?? null,
          relatedUserId: null,
          duesYear: null,
          duesQuarter: null,
          duesCoveredQuarters: null,
          fallbackDuesLabel: null,
        }));
      }
      const savedBalance = results[results.length - 1]?.balance ?? honeyPotBalance;
      const savedStructuredDues = !taggedAsDues || results.every((result) => result.savedStructuredDues);

      setHoneyPotBalance(savedBalance);
      queryClient.setQueryData(queryKeys.honeyPot(communityId), savedBalance);
      await queryClient.invalidateQueries({ queryKey: queryKeys.honeyPot(communityId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.honeyPotLedger(communityId) });
      setHoneyPotAmount('');
      setHoneyPotNote('');
      setHoneyPotCounterparty('');
      if (duesCoverage !== 'none') {
        setDuesMemberIds([]);
      }
      const ledger = await fetchHoneyPotLedger(communityId);
      setHoneyPotBalance(ledger.balance);
      setHoneyPotTransactions(ledger.transactions);
      showHoneyPotFeedback(
        'success',
        'Success',
        savedStructuredDues || !taggedAsDues
          ? taggedAsDues
            ? `Dues recorded for ${formatMemberList(duesMembersToRecord.map((member) => member.name))}.`
            : `Honey Pot ${honeyPotType === 'deposit' ? 'deposit' : 'withdrawal'} recorded`
          : 'Deposit recorded. The dues tag was saved in the note, but reminder tracking needs the latest database migration.'
      );
    } catch (err) {
      console.error('Honey pot update error:', err);
      showHoneyPotFeedback(
        'error',
        'Honey Pot update failed',
        userFacingError(err, 'Nothing was recorded. Your details are still here — try again.')
      );
    } finally {
      setRecordingHoneyPot(false);
    }
  };

  const selectedDuesMembers = members
    .map((member) => member.profiles)
    .filter((member) => duesMemberIds.includes(member.id));
  const toggleDuesMember = useCallback((memberId: string) => {
    setDuesMemberIds((current) => (
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    ));
  }, []);
  const desktopPanelHeight = Math.max(320, Math.floor((height - 180) / 2));
  // Back to its old height, and the rows inside it come back with it. The forty
  // points added on 2026-08-06 paid for a two-line phone header — the name and
  // its action on one line, the tabs wrapping underneath. The header is a single
  // sliding strip again, so the box stops buying room it no longer needs.
  const mobilePanelHeight = Math.min(430, Math.max(340, Math.floor(height * 0.46)));
  /**
   * How tall a bottom sheet on this screen may grow, in real points.
   *
   * Nat, from her iPhone on 2026-08-06, opening Check-in questions & responses:
   * *"if i click 'check in and surveys' the bottom one, it opens up in a way
   * that i cant see everything."*
   *
   * Every sheet here said `maxHeight: '94%'`. A percentage height only means
   * something when the thing above it has a height of its own to take a
   * percentage OF, and the sheet's parent — the tap-swallowing wrapper inside
   * ModalBackdrop — is sized by its contents. So the ceiling was quietly
   * dropped, the sheet grew as tall as the survey editor wanted (a title, a
   * description, a date, every response, every question, and Save at the very
   * bottom), and the ScrollView inside it never had a box small enough to need
   * scrolling. The page could not scroll either, because a modal is not the
   * page. Everything past the fold was simply unreachable.
   *
   * A number cannot be ignored. The window is measured right here, so the sheet
   * is capped at real points on both a phone and a browser, the ScrollView gets
   * a real box, and the Save button is always a scroll away rather than gone.
   */
  const sheetMaxHeight = Math.round(height * 0.92);
  /** Sheets keep 16 points of margin on a phone, 24 where there is room. */
  const sheetPadding = useMobileLayout ? 16 : 24;
  const dashboardOuterContentStyle: ViewStyle = useMobileLayout
    ? { padding: 16 }
    : { padding: 16, paddingBottom: 10 };
  const dashboardPanelStyle = { height: useMobileLayout ? mobilePanelHeight : desktopPanelHeight };
  const dashboardPanelBodyStyle = { flex: 1 };
  const panelScrollStyle = { flex: 1 };
  // The HIVE you're signed into, in its own colour, so the invite form inside
  // its box belongs to the box (Nat 2026-08-03).
  const currentHiveAccent = hiveAccent(community);
  const currentHiveSkin = hivePanelSkin(currentHiveAccent);
  // Mirrors Home's grid air: 36px gutters, centered 1380 cap.
  const dashboardWrapStyle: ViewStyle = {
    flexDirection: useMobileLayout ? 'column' : 'row',
    flexWrap: 'wrap',
    marginHorizontal: useMobileLayout ? 0 : -18,
    maxWidth: useMobileLayout ? undefined : 1416,
    width: '100%',
    alignSelf: 'center',
  };
  const dashboardCellStyle: ViewStyle = {
    width: useMobileLayout ? '100%' : '50%',
    paddingHorizontal: useMobileLayout ? 0 : 18,
    marginBottom: useMobileLayout ? 18 : 36,
  };


  if (!isAdmin && !isTreasurer) {
    return (
      <LockedAdminScreen
        onHomePress={() => router.push('/hive')}
        onLedgerPress={() => router.push('/honey-pot')}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
      <SpaceGlobe />
      <AppHeader
        title="Admin"
        tone="wide"
      />

      {/* This used to carry `minHeight: '101%'`, which made the dashboard one
          per cent taller than its box purely so there was something to scroll
          and iOS would bounce. BounceScrollView draws the bounce itself, on the
          browser too, so the page can go back to being exactly as tall as it is. */}
      <BounceScrollView
        className="flex-1"
        contentContainerStyle={dashboardOuterContentStyle}
        refreshControl={useMobileLayout ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined}
      >
        <View style={dashboardWrapStyle}>
          {/* Honey Pot moved out. Recording lives on the Honey Pot page now,
              where the pot is, and the ledger was always public anyway
              (Nat 2026-08-01). This room is for people. */}

          {/* THE SURVEYS BOX IS GONE (Nat, 2026-08-06).
              *"I guess we can get rid of the first survey box. Honestly, I
              wouldn't use this to make one anyway — I would just message you
              here, like this, to create one."* And: *"OG HIVE is the only one
              that has any surveys, because we need to make different ones for
              different HIVEs."*

              It was a HIVE-Wide shelf holding something that only ever belongs
              to one HIVE, so it had to guess whose surveys to show and picked
              whichever HIVE you last stood in. Its one useful row — Check-in
              questions & responses — already sits inside every HIVE's own
              folder, under that HIVE's name.

              Going with it: the "+ Create" survey builder, which Nat says she
              would never use, and the Meeting tools paragraph, which explained
              where the meeting tools are on a screen that shows them a little
              further down. The survey EDITOR followed on 2026-08-12 — Nat:
              "Survey builder? kill it. We'll just chat here." Each HIVE's
              Check-ins tab still opens the Questions & answers sheet, which
              reads the answers and edits nothing. */}

          {/* The newsletter goes out past every HIVE, so its box wears the house
              cream rather than any one HIVE's colour. Nat's draft opens from
              inside it. */}
          {/* THE "WAITING ON YOU" BOX IS GONE (Nat, 2026-08-17).
              *"it shouldn't live in admin. It should send me a preview email
              and then once I approve it then you can send it out."* The
              preview email IS the interface: she reads it, says go, and the
              send is fired for her. A box here was a second place to look for
              something already sitting in her inbox. */}

          {/* WHAT'S NEXT — every HIVE, in date order, nothing falls off it.
              Nat, 2026-09-02: *"this is what I've been missing... can we just
              fold that into the HIVE app, somewhere in HIVE-Wide admin?"*

              **This is not the "waiting on you" box coming back.** That one
              (removed 2026-08-17) was offered INSTEAD of a preview email, and
              her objection was exactly that: *"it shouldn't live in admin, it
              should send me a preview email."* It now does — with a button in
              it, as of today — and this list is the standing second door beside
              it, holding meetings, open check-ins and the end of the month as
              well. A held send here is a row that links to the same approve
              screen the email does, never a second interface for it. */}
          {isAdmin && (
            <WhatsNextPanel
              cellStyle={dashboardCellStyle}
              panelStyle={dashboardPanelStyle}
              bodyStyle={dashboardPanelBodyStyle}
              scrollStyle={panelScrollStyle}
              Panel={AdminPanel}
              order={0}
            />
          )}

          {/* Every templated email, rendered by the real sender, read once.
              Sits beside the newsletter on purpose: the two halves of the same
              question — the letters that are always the same, and the one
              written fresh every month. */}
          {isOwner && (
            <EmailTemplatesPanel
              cellStyle={dashboardCellStyle}
              panelStyle={dashboardPanelStyle}
              bodyStyle={dashboardPanelBodyStyle}
              scrollStyle={panelScrollStyle}
              Panel={AdminPanel}
            />
          )}

          {isOwner && (
            <NewsletterPanel
              cellStyle={dashboardCellStyle}
              panelStyle={dashboardPanelStyle}
              bodyStyle={dashboardPanelBodyStyle}
              scrollStyle={panelScrollStyle}
              Panel={AdminPanel}
            />
          )}

          {/* The HIVE you're signed into is no longer drawn here.
              It had its own panel with its own look, while every OTHER HIVE
              came out of HiveMemberPanels — which is precisely why the two
              didn't match when Nat put them side by side. One component
              draws all of them now (2026-08-03). */}

          {/* Every HIVE you're in, each one in its own colour. */}
          {isAdmin && (
            <HiveMemberPanels
              onOpenCheckIns={(targetCommunityId) => {
                checkInOpenRequestIdRef.current += 1;
                setPendingCheckInOpen({
                  communityId: targetCommunityId,
                  requestId: checkInOpenRequestIdRef.current,
                });
              }}
              cellStyle={dashboardCellStyle}
              panelStyle={dashboardPanelStyle}
              bodyStyle={dashboardPanelBodyStyle}
              scrollStyle={panelScrollStyle}
              Panel={AdminPanel}
            />
          )}
        </View>
      </BounceScrollView>

      {/* THE CREATE-SURVEY SHEET IS GONE, with the box that opened it.
          Nothing else in the app could reach it, and a builder nobody can open
          is the "retired feature that is still callable" shape CLAUDE.md warns
          about. Surveys still get made — Nat asks a person, which is exactly
          what she said she would do. The editor next door still edits every
          question of every check-in that exists. */}

      {/* Survey Editor Modal */}
      <Modal visible={!!editingSurvey} animationType="slide" transparent onRequestClose={closeSurveyEditor}>
        <ModalBackdrop
          onClose={closeSurveyEditor}
          style={{
            justifyContent: useMobileLayout ? 'flex-end' : 'center',
            alignItems: 'center',
            paddingHorizontal: useMobileLayout ? 0 : 24,
            paddingVertical: useMobileLayout ? 0 : 24,
          }}
          sheetStyle={{ width: '100%', maxWidth: 1040 }}
        >
          {/* The ceiling is points rather than a percentage — see sheetMaxHeight
              above for what the percentage was doing instead. `overflow: hidden`
              keeps the responses and questions inside the rounded top corners. */}
          <View
            style={{
              width: '100%',
              backgroundColor: '#fffdf5',
              borderRadius: 24,
              borderBottomLeftRadius: useMobileLayout ? 0 : 24,
              borderBottomRightRadius: useMobileLayout ? 0 : 24,
              maxHeight: sheetMaxHeight,
              overflow: 'hidden',
            }}
          >
            <BounceScrollView
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: sheetPadding, paddingBottom: 32 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 20, color: '#2d2d2d' }}>
                    Questions &amp; answers
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', marginTop: 4 }}>
                    {editingSurvey?.title ?? 'Check-in'} · {(surveyEditorQuestions ?? []).length} question{surveyEditorQuestions.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <Pressable
                  onPress={closeSurveyEditor}
                  hitSlop={10}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 20, color: '#9a8060' }}>x</Text>
                </Pressable>
              </View>

              {/* This sheet had a second tab, "Edit questions & schedule" —
                  the survey builder. Killed 2026-08-12, Nat: "Survey builder?
                  kill it. We'll just chat here." Changing a survey's words,
                  dates or questions is a thing she asks for in chat now, so
                  the sheet is the one thing it was actually used for: reading
                  the answers. */}
              <View
                  style={{
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.55)',
                  borderRadius: 16,
                  backgroundColor: '#faf8f3',
                  padding: 14,
                  marginBottom: 16,
                  }}
                >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d' }}>
                      Responses
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#7f715f', lineHeight: 17, marginTop: 2 }}>
                      See who filled this out and what their answers said.
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => editingSurvey && loadSurveyResponses(editingSurvey)}
                    disabled={!editingSurvey || surveyResponsesLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh survey responses"
                    style={({ pressed }) => ({
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
                      borderWidth: 1,
                      borderColor: 'rgba(222,193,129,0.55)',
                      opacity: surveyResponsesLoading ? 0.5 : 1,
                    })}
                  >
                    <Ionicons name="refresh-outline" size={17} color="#8a6b30" />
                  </Pressable>
                </View>

                {surveyResponsePeriods.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
                  >
                    {surveyResponsePeriods.map((period) => {
                      const active = period === activeSurveyResponsePeriod;
                      return (
                        <Pressable
                          key={period}
                          onPress={() => setSelectedSurveyResponsePeriod(period)}
                          style={({ pressed }) => ({
                            backgroundColor: active ? '#bd9348' : pressed ? '#fbf0d7' : '#fffdf5',
                            borderColor: active ? '#bd9348' : 'rgba(222,193,129,0.55)',
                            borderWidth: 1,
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                          })}
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: active ? 'white' : '#8a6b30' }}>
                            {formatSurveyResponsePeriod(period)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}

                {surveyResponsesLoading ? (
                  <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                    <ThinkingBee />
                  </View>
                ) : surveyResponsesError ? (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#ef4444' }}>
                    {surveyResponsesError}
                  </Text>
                ) : (
                  <View style={{ gap: 12 }}>
                    <View
                      style={{
                        backgroundColor: '#fffdf5',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: 'rgba(222,193,129,0.35)',
                        padding: 12,
                      }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30', marginBottom: 4 }}>
                        {activeSurveyResponses.length} of {members.length} member{members.length === 1 ? '' : 's'} submitted
                        {activeSurveyResponsePeriod ? ` for ${formatSurveyResponsePeriod(activeSurveyResponsePeriod)}` : ''}
                      </Text>
                      {missingSurveyMembers.length > 0 ? (
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#7f715f', lineHeight: 17 }}>
                          Waiting on {formatMemberList(missingSurveyMembers.map(member => member.profiles.name))}.
                        </Text>
                      ) : (
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#3f7f4c', lineHeight: 17 }}>
                          Everyone on the member list has a response for this period.
                        </Text>
                      )}
                    </View>

                    {activeSurveyPopPreview.hasContent ? (
                      <View
                        style={{
                          backgroundColor: '#fffdf5',
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: 'rgba(222,193,129,0.35)',
                          padding: 12,
                          gap: 12,
                        }}
                      >
                        <View>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d' }}>
                            Meeting POP Preview
                          </Text>
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#7f715f', lineHeight: 17, marginTop: 2 }}>
                            Deck-ready readout from this month's responses.
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                            <Pressable
                              onPress={() => { void handleCopyPopPreview(); }}
                              style={({ pressed }) => ({
                                backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
                                borderColor: 'rgba(222,193,129,0.55)',
                                borderWidth: 1,
                                borderRadius: 999,
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                              })}
                            >
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: deckCopyFeedback === 'pop' ? '#3f7f4c' : '#8a6b30' }}>
                                {deckCopyFeedback === 'pop' ? '✓ Copied' : '📋 Copy for deck'}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => { void handleCopyHdWishes(); }}
                              disabled={hdWishesCopying}
                              style={({ pressed }) => ({
                                backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
                                borderColor: 'rgba(222,193,129,0.55)',
                                borderWidth: 1,
                                borderRadius: 999,
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                opacity: hdWishesCopying ? 0.6 : 1,
                              })}
                            >
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: deckCopyFeedback === 'wishes' ? '#3f7f4c' : '#8a6b30' }}>
                                {deckCopyFeedback === 'wishes' ? '✓ Copied' : hdWishesCopying ? 'Copying…' : '📋 Copy HD wishes'}
                              </Text>
                            </Pressable>
                          </View>
                        </View>

                        {(activeSurveyPopPreview.energyAverage !== null || activeSurveyPopPreview.modes.length > 0) ? (
                          <View style={{ gap: 6 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30' }}>
                              Energy
                            </Text>
                            {activeSurveyPopPreview.energyAverage !== null ? (
                              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#2d2d2d', lineHeight: 18 }}>
                                Average {activeSurveyPopPreview.energyAverage.toFixed(1)} from {activeSurveyPopPreview.energyCount} response{activeSurveyPopPreview.energyCount === 1 ? '' : 's'}.
                              </Text>
                            ) : null}
                            {activeSurveyPopPreview.modes.length > 0 ? (
                              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#2d2d2d', lineHeight: 18 }}>
                                {activeSurveyPopPreview.modes.map(mode => `${mode.label}: ${mode.count}`).join(' - ')}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}

                        <PopPreviewList title="Progress" items={activeSurveyPopPreview.progress} />
                        <PopPreviewList title="Obstacles" items={activeSurveyPopPreview.obstacles} />
                        <PopPreviewList title="Priorities" items={activeSurveyPopPreview.priorities} />
                        <PopPreviewList title="Meeting topics" items={activeSurveyPopPreview.meetingTopics} />
                        <CarryForwardPreviewList items={activeSurveyPopPreview.carryForward} />
                      </View>
                    ) : null}

                    {activeSurveyResponses.length === 0 ? (
                      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 18 }}>
                          No responses for this period yet.
                        </Text>
                      </View>
                    ) : (
                      activeSurveyResponses.map((response) => {
                        const responseUser = response.user ?? memberProfilesById.get(response.user_id);
                        const responseName = responseUser?.name ?? 'Unknown member';
                        const questionIds = new Set(surveyEditorQuestions.map(question => question.id));
                        const answeredQuestions = surveyEditorQuestions.filter(question => hasSurveyAnswer(response.answers?.[question.id]));
                        const carryForwardAnswers = normalizeCarryForwardResponse(response.answers?.[CARRY_FORWARD_ANSWER_KEY]);
                        const extraAnswers = Object.entries(response.answers ?? {})
                          .filter(([questionId, answer]) => (
                            questionId !== CARRY_FORWARD_ANSWER_KEY
                            && !questionIds.has(questionId)
                            && hasSurveyAnswer(answer)
                          ));
                        const answeredCount = getAnsweredQuestionCount(response.answers ?? {}, surveyEditorQuestions);

                        return (
                          <View
                            key={response.id}
                            style={{
                              backgroundColor: 'white',
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: 'rgba(222,193,129,0.35)',
                              padding: 12,
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                              <MemberProfileLink
                                memberId={responseUser?.id}
                                memberName={responseName}
                                hitSlop={8}
                              >
                                <Avatar name={responseName} url={responseUser?.avatar_url} size={34} />
                              </MemberProfileLink>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d' }}>
                                  {responseName}
                                </Text>
                                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
                                  {answeredCount} answer{answeredCount === 1 ? '' : 's'} - Submitted {formatSurveySubmittedAt(response.submitted_at)}
                                </Text>
                              </View>
                            </View>

                            {answeredQuestions.length === 0 && extraAnswers.length === 0 && carryForwardAnswers.length === 0 ? (
                              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', lineHeight: 18 }}>
                                This response was submitted without written answers.
                              </Text>
                            ) : (
                              <View style={{ gap: 10 }}>
                                {answeredQuestions.map((question) => (
                                  <View key={question.id}>
                                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30', lineHeight: 17 }}>
                                      {question.text}
                                    </Text>
                                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#2d2d2d', lineHeight: 19, marginTop: 2 }}>
                                      {formatSurveyAnswer(response.answers?.[question.id])}
                                    </Text>
                                  </View>
                                ))}
                                <CarryForwardPreviewList
                                  items={carryForwardAnswers.map(item => ({ memberName: responseName, item }))}
                                />
                                {extraAnswers.map(([questionId, answer]) => (
                                  <View key={questionId}>
                                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30', lineHeight: 17 }}>
                                      Saved answer: {questionId}
                                    </Text>
                                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#2d2d2d', lineHeight: 19, marginTop: 2 }}>
                                      {formatSurveyAnswer(answer)}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
                </View>
            </BounceScrollView>
          </View>
        </ModalBackdrop>
      </Modal>

      {/* Event Modal */}
      <Modal visible={showEventModal} animationType="slide" transparent onRequestClose={() => setShowEventModal(false)}>
        <ModalBackdrop onClose={() => setShowEventModal(false)} style={{ justifyContent: 'flex-end' }}>
          {/* Title, date, a growing description and the audience toggle stack
              up taller than a phone before you have typed anything, and Create
              lives underneath all of it. Ceiling on the sheet, scroll inside. */}
          <View className="bg-white rounded-t-3xl" style={{ maxHeight: sheetMaxHeight, overflow: 'hidden' }}>
            <BounceScrollView contentContainerStyle={{ padding: sheetPadding }} keyboardShouldPersistTaps="handled">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              Add Event
            </Text>

            <ComposerBar
              variant="form"
              tone="light"
              containerClassName="mb-3"
              label="Event title"
              value={eventTitle}
              onChangeText={setEventTitle}
              multiline={false}
            />
            <View className="mb-3">
              <EventDatePicker
                value={eventDate}
                onChange={setEventDate}
              />
            </View>
            <ComposerBar
              variant="form"
              tone="light"
              containerClassName="mb-4"
              label="Description (optional)"
              value={eventDescription}
              onChangeText={setEventDescription}
              minHeight={78}
            />

            <View className="mb-4">
              <EventAudienceToggle
                value={eventAudience}
                onChange={setEventAudience}
                allowPublic={profile?.is_owner === true}
              />
            </View>

            <View className="flex-row">
              <Pressable
                onPress={() => setShowEventModal(false)}
                className="flex-1 bg-gray-200 py-3 rounded-lg mr-2"
              >
                <Text className="text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={createEvent}
                className="flex-1 bg-honey-500 py-3 rounded-lg"
              >
                <Text className="text-center font-semibold text-white">
                  Create
                </Text>
              </Pressable>
            </View>
            </BounceScrollView>
          </View>
        </ModalBackdrop>
      </Modal>
    </SafeAreaView>
  );
}
