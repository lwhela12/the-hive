import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
  useWindowDimensions,
  ActivityIndicator,
  PanResponder,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  getHoneyPotErrorMessage,
  recordHoneyPotTransaction,
  type HoneyPotLedgerEntry,
  type HoneyPotPaymentMethod,
} from '../../lib/honeyPot';
import { Avatar } from '../../components/ui/Avatar';
import { MemberProfileLink } from '../../components/ui/MemberProfileLink';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { FIELD_LOOK } from '../../components/ui/Input';
import { AppHeader } from '../../components/navigation';
import {
  ADMIN_PANEL_ORDER,
  HiveMemberPanels,
  NewsletterPanel,
  hivePanelSkin,
} from '../../components/admin/GodModePanels';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { SpaceGlobe } from '../../components/ui/SpaceGlobe';
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
import type { Profile, QueenBee, UserRole, CommunityInvite, Event, Wish } from '../../types';

import { ComposerBar } from '../../components/ui/ComposerBar';
import { ThinkingBee } from '../../components/ui/ThinkingBee';
// Every statement on this screen used to be an `Alert.alert`, which in a browser
// draws nothing whatsoever — so "Please enter an email" and "Failed to create
// event" were both delivered to nobody. The two `Alert.alert` calls left are the
// native halves of a question, and each already has a `window.confirm` beside it
// for the web.
import { showAlert } from '../../lib/showAlert';
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

type InviteRow = CommunityInvite & {
  inviter: Pick<Profile, 'name'> | null;
};

type InviteFunctionResponse = {
  success?: boolean;
  reusedInvite?: boolean;
};

const ROLE_OPTIONS: UserRole[] = ['member', 'treasurer', 'admin'];

const ROLE_LABELS: Record<UserRole, string> = {
  member: 'Member',
  treasurer: 'Treasurer',
  admin: 'Admin',
};

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

const getInviteKey = (invite: InviteRow) => `${invite.community_id}:${invite.email.trim().toLowerCase()}`;
const getInviteTime = (invite: InviteRow) => new Date(invite.created_at).getTime() || 0;

const dedupePendingInvites = (invites: InviteRow[]) => {
  const byEmail = new Map<string, InviteRow>();

  invites.forEach((invite) => {
    const key = getInviteKey(invite);
    const existing = byEmail.get(key);
    if (!existing || getInviteTime(invite) > getInviteTime(existing)) {
      byEmail.set(key, invite);
    }
  });

  return Array.from(byEmail.values()).sort((a, b) => getInviteTime(b) - getInviteTime(a));
};

const readFunctionErrorMessage = async (error: unknown, fallback: string) => {
  try {
    const maybeError = error as {
      context?: {
        clone?: () => { json: () => Promise<unknown> };
        json?: () => Promise<unknown>;
      };
      message?: string;
    };
    const context = maybeError.context;
    const body = context?.clone
      ? await context.clone().json()
      : context?.json
        ? await context.json()
        : null;

    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }

    return maybeError.message || fallback;
  } catch {
    return fallback;
  }
};

type HoneyPotFeedback = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

type QuestionLayout = {
  y: number;
  height: number;
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

const SURVEY_QUESTION_TYPES: SurveyQuestion['type'][] = ['short', 'long', 'scale', 'choice', 'hangs', 'focus'];
const SURVEY_TYPE_LABELS: Record<SurveyQuestion['type'], string> = {
  short: 'Short',
  long: 'Long',
  scale: 'Scale',
  choice: 'Choice',
  focus: 'HIVE Help focus',
  hangs: 'Hangs recap',
};

const DEFAULT_RESPONSE_PERIOD = 'default';
const MONTHLY_CHECK_IN_PATTERN = /monthly\s+check-?in/i;

const MONTHLY_CHECK_IN_TEMPLATE: SurveyQuestion[] = [
  // Arrival questions power the meeting-day Arrival Board. Keep the ids and
  // text in sync with the live monthly check-in survey (q_name_today,
  // q_feeling_today, q_feeling_note) so re-applying the template never drops them.
  {
    id: 'q_name_today',
    text: 'Arrival: what do you want to be called today?',
    type: 'short',
    required: false,
  },
  {
    id: 'q_feeling_today',
    text: 'Arrival: how are you feeling right now?',
    type: 'choice',
    options: [
      '😊 Great — bring it on!',
      '😌 Good & steady',
      '🫠 Tired, but here',
      '🤒 Under the weather — love me from a distance',
      '💛 Sad — extra hugs please',
      "🖤 Sad — please don't ask about it",
      '🌀 All over the place',
    ],
    required: false,
  },
  {
    id: 'q_feeling_note',
    text: 'Arrival: anything we should know on sight? (optional)',
    type: 'short',
    required: false,
  },
  {
    id: 'q_energy_level',
    text: 'Energy: what is your energy level right now?',
    type: 'scale',
    required: false,
  },
  {
    id: 'q_energy_mode',
    text: 'Energy: what would feel best from HIVE this month?',
    type: 'choice',
    options: [
      'I could use support',
      'I could use space',
      'I am steady',
      'I have energy to offer help',
    ],
    required: false,
  },
  {
    id: 'q_pop_progress',
    text: 'Progress: what moved forward since last HIVE? Give yourself a little pat on the back.',
    type: 'long',
    required: false,
  },
  {
    id: 'q_pop_obstacles',
    text: 'Obstacles: where are you stuck, and how could HIVE help?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_pop_priorities',
    text: 'Priorities: what are you focusing on before the next HIVE?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_carry_forward',
    text: 'Carry-forward: anything from your HD boards, wishes, to-do list, or previous notes that should stay active, get attention, be marked complete, or be archived?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_meeting_topic',
    text: 'Anything you want HIVE to mull over at the meeting, even if you might miss it?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_group_note',
    text: 'Anything else HIVE should know before we gather?',
    type: 'long',
    required: false,
  },
];

const MONTHLY_CHECK_IN_DESCRIPTION =
  'A quick POP + Energy check-in so HIVE can celebrate progress, spot obstacles, choose priorities, and keep the right things on the roster.';

const createSurveyQuestionId = () => `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_MEETING_ARRIVAL_MINUTES = 17 * 60 + 30;
const DEFAULT_SURVEY_DUE_MINUTES = 17 * 60;
const SURVEY_TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) => {
  const totalMinutes = index * 15;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return {
    value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    label: formatClockTime(totalMinutes),
  };
});

const cloneQuestion = (question: SurveyQuestion): SurveyQuestion => ({
  ...question,
  options: question.options ? [...question.options] : undefined,
});

function moveQuestion(questions: SurveyQuestion[], fromIndex: number, toIndex: number) {
  if (
    fromIndex === toIndex
    || fromIndex < 0
    || toIndex < 0
    || fromIndex >= questions.length
    || toIndex >= questions.length
  ) {
    return questions;
  }

  const next = [...questions];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function formatClockTime(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

function getLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toAmericanDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${date.getFullYear()}`;
}

function getTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parseEventTimeToMinutes(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const period = match[3]?.toLowerCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;

  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  if (hour > 23) return null;
  return hour * 60 + minute;
}

function getSecondWednesday(year: number, monthIndex: number) {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const firstWednesdayOffset = (3 - firstOfMonth.getDay() + 7) % 7;
  return new Date(year, monthIndex, 1 + firstWednesdayOffset + 7);
}

function getNextSecondWednesdayDueAt(from = new Date()) {
  for (let offset = 0; offset < 18; offset += 1) {
    const candidate = getSecondWednesday(from.getFullYear(), from.getMonth() + offset);
    candidate.setHours(
      Math.floor(DEFAULT_SURVEY_DUE_MINUTES / 60),
      DEFAULT_SURVEY_DUE_MINUTES % 60,
      0,
      0
    );
    if (candidate > from) return candidate;
  }

  const fallback = new Date(from);
  fallback.setDate(fallback.getDate() + 30);
  fallback.setHours(17, 0, 0, 0);
  return fallback;
}

function getSurveyDefaultDueAt(nextMeeting?: Pick<Event, 'event_date' | 'event_time'> | null) {
  if (nextMeeting?.event_date) {
    const [year, month, day] = nextMeeting.event_date.split('-').map(Number);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      const meetingMinutes = parseEventTimeToMinutes(nextMeeting.event_time) ?? DEFAULT_MEETING_ARRIVAL_MINUTES;
      const dueAt = new Date(year, month - 1, day, Math.floor(meetingMinutes / 60), meetingMinutes % 60, 0, 0);
      dueAt.setMinutes(dueAt.getMinutes() - 30);
      return dueAt;
    }
  }

  return getNextSecondWednesdayDueAt();
}

function parseSurveyDueAt(dueDate?: string | null) {
  if (!dueDate) return null;
  const parsed = new Date(dueDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSurveyDateInputValue(dueDate?: string | null) {
  const parsed = parseSurveyDueAt(dueDate);
  return parsed ? toAmericanDate(parsed) : dueDate?.slice(0, 10) ?? '';
}

function getSurveyTimeInputValue(dueDate?: string | null, fallback?: Date) {
  return getTimeInputValue(parseSurveyDueAt(dueDate) ?? fallback ?? getNextSecondWednesdayDueAt());
}

function formatSurveyDueAt(dueDate?: string | null) {
  const parsed = parseSurveyDueAt(dueDate);
  if (!parsed) return dueDate ?? '';
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

const normalizeSurveyDueDateInput = (dateValue: string, timeValue: string) => {
  const clean = dateValue.trim();
  if (!clean) return { dueDate: null as string | null, error: null as string | null };

  const parsed = parseAmericanDate(clean);
  if (!parsed) {
    return {
      dueDate: null,
      error: 'Use MM-DD-YYYY or YYYY-MM-DD for the due date.',
    };
  }

  const [year, month, day] = parsed.split('-').map(Number);
  const timeMinutes = parseEventTimeToMinutes(timeValue) ?? DEFAULT_SURVEY_DUE_MINUTES;
  const dueAt = new Date(year, month - 1, day, Math.floor(timeMinutes / 60), timeMinutes % 60, 0, 0);
  return { dueDate: dueAt.toISOString(), error: null };
};

function SurveyTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = SURVEY_TIME_OPTIONS.find(option => option.value === value);

  return (
    <View style={{ flex: 1, minWidth: 150 }}>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#7f715f', marginBottom: 4 }}>
        Time
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: pressed ? '#fbf0d7' : '#faf8f3',
          borderColor: 'rgba(222,193,129,0.5)',
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 12,
        })}
      >
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: selected ? '#2d2d2d' : '#b5ad9f' }}>
          {selected?.label ?? 'Select time'}
        </Text>
        <Ionicons name="time-outline" size={18} color="#bd9348" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ width: '100%', maxWidth: 320, maxHeight: 460, backgroundColor: 'white', borderRadius: 18, overflow: 'hidden' }}
          >
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(222,193,129,0.3)' }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: '#2d2d2d', textAlign: 'center' }}>
                Select Time
              </Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={true}>
              {SURVEY_TIME_OPTIONS.map(option => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 18,
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(222,193,129,0.18)',
                      backgroundColor: active ? '#fdf3dc' : pressed ? '#fbf4e3' : 'white',
                    })}
                  >
                    <Text style={{ fontFamily: active ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 15, color: active ? '#8a6b30' : '#2d2d2d' }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Panel tabs are text only — the gold header bar is the mark, an icon inside it
// just crowds the word (Nat 2026-07-26). Icons belong in the panel body.
//
// Hand it a HIVE's accent colour and the whole folder — tab, wash, edge, glow —
// comes up in that HIVE instead of the house cream (Nat 2026-08-03). Boxes that
// belong to no single HIVE leave it off and stay cream and gold.
function AdminPanel({
  title,
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
  action?: ReactNode;
  accent?: string;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const skin = accent ? hivePanelSkin(accent) : null;
  const tabFill = skin?.tab ?? 'rgba(253,243,220,0.8)';
  const tabText = skin?.tabText ?? '#2d2d2d';
  const edge = skin?.border ?? 'rgba(222,193,129,0.7)';
  // The un-accented panels (Meeting Tools, Newsletter) sat at solid cream while
  // the HIVE panels floated on the stars, and the two read as different
  // materials in one frame — Nat, 2026-08-03: "these are a little bit too stark
  // different... the cream ones should be a little more transparent." Letting a
  // little sky through is enough to make them the same kind of object; any more
  // and the text stops being comfortable to read on a starfield.
  // Nat wants these as see-through as HIVE-Wide's cards (2026-08-04), and
  // opacity alone cannot get there. HIVE-Wide's boxes sit at 0.055 because
  // everything inside them is LIGHT ink; these hold charcoal text, so dropping
  // the cream to anything near that turns the words into grey-on-black. The
  // real change is to make these dark panels with light ink like the accented
  // ones — the same page-skin pass the board components still need — rather
  // than a number. Eased to 0.74 in the meantime, which lets the sky show at
  // the edges without taking the text with it.
  const bodyFill = skin?.body ?? 'rgba(255,253,245,0.74)';
  const glow = skin?.shadow ?? '#bd9348';

  return (
    <View style={[{ marginBottom: 0 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexShrink: 1, gap: 3 }}>
        <View
          style={{
            flexShrink: 1,
            backgroundColor: tabFill,
            borderColor: edge,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 7,
          }}
        >
          <Text numberOfLines={1} style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: tabText }}>
            {title}
          </Text>
        </View>
        {(tabs ?? []).map((t) => {
          const on = t.key === activeTab;
          return (
            <Pressable
              key={t.key}
              onPress={() => onTabChange?.(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{
                backgroundColor: on ? tabFill : 'transparent',
                borderColor: edge, borderWidth: 1, borderBottomWidth: 0,
                borderTopLeftRadius: 12, borderTopRightRadius: 12,
                paddingHorizontal: 11,
                // An inactive tab sits lower, so the active one reads as the
                // sheet in front rather than one of a row.
                paddingVertical: on ? 7 : 5,
                opacity: on ? 1 : 0.72,
              }}
            >
              <Text numberOfLines={1} style={{ fontFamily: on ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 12.5, color: tabText }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
        </View>
        {action ? <View style={{ paddingBottom: 4, marginLeft: 8 }}>{action}</View> : null}
      </View>
      <View
        style={[{
          backgroundColor: bodyFill,
          borderRadius: 20,
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

function AdminHeaderAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexShrink: 0,
        paddingHorizontal: 12,
        paddingVertical: 7,
        marginBottom: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(222,193,129,0.72)',
        backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
      })}
    >
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
        {label}
      </Text>
    </Pressable>
  );
}

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
      <ScrollView
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
      </ScrollView>
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
  const [queenBees, setQueenBees] = useState<QueenBee[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteRow[]>([]);

  // Modal states
  const [showQueenBeeModal, setShowQueenBeeModal] = useState(false);
  const [pendingCheckInOpen, setPendingCheckInOpen] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showSurveyModal, setShowSurveyModal] = useState(false);

  // Survey management
  const { allSurveys, refetch: refetchSurveys } = useSurveys(
    canEditHoneyPot ? communityId ?? undefined : undefined,
    canEditHoneyPot ? profile?.id : undefined
  );
  const [surveyTitle, setSurveyTitle] = useState('');
  const [surveyDescription, setSurveyDescription] = useState('');
  const [surveyDueDate, setSurveyDueDate] = useState('');
  const [surveyDueTime, setSurveyDueTime] = useState('');
  const [savingSurvey, setSavingSurvey] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [surveyEditorTitle, setSurveyEditorTitle] = useState('');
  const [surveyEditorDescription, setSurveyEditorDescription] = useState('');
  const [surveyEditorDueDate, setSurveyEditorDueDate] = useState('');
  const [surveyEditorDueTime, setSurveyEditorDueTime] = useState('');
  const [surveyEditorQuestions, setSurveyEditorQuestions] = useState<SurveyQuestion[]>([]);
  const [savingSurveyEditor, setSavingSurveyEditor] = useState(false);
  const [surveyEditorError, setSurveyEditorError] = useState<string | null>(null);
  const [nextSurveyMeeting, setNextSurveyMeeting] = useState<Pick<Event, 'event_date' | 'event_time' | 'title'> | null>(null);
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponseWithUser[]>([]);
  const [surveyResponsesLoading, setSurveyResponsesLoading] = useState(false);
  const [surveyResponsesError, setSurveyResponsesError] = useState<string | null>(null);
  const [selectedSurveyResponsePeriod, setSelectedSurveyResponsePeriod] = useState<string | null>(null);
  const surveyEditorQuestionsRef = useRef<SurveyQuestion[]>([]);
  const questionLayoutsRef = useRef<Record<string, QuestionLayout>>({});
  const activeQuestionDragRef = useRef<{ id: string; startCenterY: number } | null>(null);
  const [draggingQuestionId, setDraggingQuestionId] = useState<string | null>(null);

  // Form states
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [qbMonth, setQbMonth] = useState('');
  const [qbTitle, setQbTitle] = useState('');
  const [qbDescription, setQbDescription] = useState('');
  const [qbStatus, setQbStatus] = useState<'upcoming' | 'active' | 'completed'>('upcoming');
  const [editingQueenBee, setEditingQueenBee] = useState<QueenBee | null>(null);

  const [eventTitle, setEventTitle] = useState('');
  const [eventAudience, setEventAudience] = useState<EventAudience>('members');
  const [eventDate, setEventDate] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('member');
  const [showInviteMember, setShowInviteMember] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

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

    // Fetch queen bees (ordered by display_order for queue)
    const { data: qbData } = await supabase
      .from('queen_bees')
      .select('*')
      .eq('community_id', communityId)
      .order('display_order', { ascending: true })
      .order('month', { ascending: true })
      .limit(12);
    if (qbData) setQueenBees(qbData);

    // Fetch pending invites
    const { data: invitesData } = await supabase
      .from('community_invites')
      .select('*, inviter:profiles!community_invites_invited_by_fkey(name)')
      .eq('community_id', communityId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
    if (invitesData) {
      const memberEmails = new Set(memberRows.map((member) => member.profiles.email.trim().toLowerCase()));
      const visibleInvites = dedupePendingInvites(invitesData as InviteRow[])
        .filter((invite) => !memberEmails.has(invite.email.trim().toLowerCase()));
      setPendingInvites(visibleInvites);
    }

    const today = getLocalIsoDate(new Date());
    const { data: nextMeetingData } = await supabase
      .from('events')
      .select('event_date, event_time, title')
      .eq('community_id', communityId)
      .eq('event_type', 'meeting')
      .gte('event_date', today)
      .or('status.is.null,status.eq.scheduled')
      .order('event_date', { ascending: true })
      .limit(1);

    setNextSurveyMeeting((nextMeetingData?.[0] as Pick<Event, 'event_date' | 'event_time' | 'title'> | undefined) ?? null);

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

  useEffect(() => {
    surveyEditorQuestionsRef.current = surveyEditorQuestions;
  }, [surveyEditorQuestions]);

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
        .eq('community_id', communityId)
        .order('submitted_at', { ascending: false });

      if (error) {
        const fallback = await (supabase as any)
          .from('survey_responses')
          .select('*')
          .eq('survey_id', survey.id)
          .eq('community_id', communityId)
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

  const toggleSurveyActive = async (survey: Survey) => {
    await supabase.from('surveys').update({ is_active: !survey.is_active }).eq('id', survey.id);
    refetchSurveys();
  };

  const getDefaultSurveyDue = () => getSurveyDefaultDueAt(nextSurveyMeeting);

  const openSurveyCreateModal = () => {
    const defaultDueAt = getDefaultSurveyDue();
    setSurveyDueDate(toAmericanDate(defaultDueAt));
    setSurveyDueTime(getTimeInputValue(defaultDueAt));
    setShowSurveyModal(true);
  };

  // Waits for the switched-to HIVE's surveys to load, then opens its check-in.
  // The tap happens before the fetch, so this cannot be a direct call.
  useEffect(() => {
    if (!pendingCheckInOpen) return;
    const checkIn = allSurveys.find((s) => /monthly\s+check-?in/i.test(s.title));
    if (!checkIn) return;
    setPendingCheckInOpen(false);
    openSurveyEditor(checkIn);
  }, [pendingCheckInOpen, allSurveys]);

  const openSurveyEditor = (survey: Survey) => {
    const defaultDueAt = getDefaultSurveyDue();
    questionLayoutsRef.current = {};
    setEditingSurvey(survey);
    setSurveyResponses([]);
    setSurveyResponsesError(null);
    setSelectedSurveyResponsePeriod(getSurveyResponsePeriodForSurvey(survey));
    setSurveyEditorTitle(survey.title);
    setSurveyEditorDescription(survey.description ?? '');
    setSurveyEditorDueDate(survey.due_date ? getSurveyDateInputValue(survey.due_date) : toAmericanDate(defaultDueAt));
    setSurveyEditorDueTime(getSurveyTimeInputValue(survey.due_date, defaultDueAt));
    setSurveyEditorQuestions((survey.questions ?? []).map(question => ({
      ...cloneQuestion(question),
      id: question.id || createSurveyQuestionId(),
    })));
    setSurveyEditorError(null);
    void loadSurveyResponses(survey);
  };

  const closeSurveyEditor = () => {
    questionLayoutsRef.current = {};
    activeQuestionDragRef.current = null;
    setDraggingQuestionId(null);
    setEditingSurvey(null);
    setSurveyEditorTitle('');
    setSurveyEditorDescription('');
    setSurveyEditorDueDate('');
    setSurveyEditorDueTime('');
    setSurveyEditorQuestions([]);
    setSurveyEditorError(null);
    setSurveyResponses([]);
    setSurveyResponsesError(null);
    setSelectedSurveyResponsePeriod(null);
  };

  const updateSurveyQuestion = (
    index: number,
    updater: (question: SurveyQuestion) => SurveyQuestion
  ) => {
    setSurveyEditorQuestions(prev => prev.map((question, questionIndex) => (
      questionIndex === index ? updater(question) : question
    )));
  };

  const addSurveyQuestion = () => {
    setSurveyEditorQuestions(prev => ([
      ...prev,
      {
        id: createSurveyQuestionId(),
        text: '',
        type: 'long',
        required: false,
      },
    ]));
  };

  const removeSurveyQuestion = (index: number) => {
    setSurveyEditorQuestions(prev => prev.filter((_, questionIndex) => questionIndex !== index));
  };

  const moveSurveyQuestion = (fromIndex: number, toIndex: number) => {
    setSurveyEditorQuestions(prev => moveQuestion(prev, fromIndex, toIndex));
  };

  const reorderDraggingQuestion = (questionId: string, targetIndex: number) => {
    setSurveyEditorQuestions(prev => {
      const currentIndex = prev.findIndex(question => question.id === questionId);
      if (currentIndex === -1 || currentIndex === targetIndex) return prev;
      return moveQuestion(prev, currentIndex, targetIndex);
    });
  };

  const createQuestionDragResponder = (questionId: string, index: number) => (
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gestureState) => Math.abs(gestureState.dy) > 3,
      onPanResponderGrant: () => {
        const layout = questionLayoutsRef.current[questionId];
        activeQuestionDragRef.current = {
          id: questionId,
          startCenterY: layout ? layout.y + layout.height / 2 : index * 120,
        };
        setDraggingQuestionId(questionId);
      },
      onPanResponderMove: (_event, gestureState) => {
        const activeDrag = activeQuestionDragRef.current;
        if (!activeDrag) return;

        const currentCenterY = activeDrag.startCenterY + gestureState.dy;
        const questions = surveyEditorQuestionsRef.current;
        let targetIndex = questions.findIndex(question => question.id === activeDrag.id);
        let closestDistance = Number.POSITIVE_INFINITY;

        questions.forEach((question, questionIndex) => {
          const layout = questionLayoutsRef.current[question.id];
          if (!layout) return;

          const distance = Math.abs(currentCenterY - (layout.y + layout.height / 2));
          if (distance < closestDistance) {
            closestDistance = distance;
            targetIndex = questionIndex;
          }
        });

        if (targetIndex >= 0) {
          reorderDraggingQuestion(activeDrag.id, targetIndex);
        }
      },
      onPanResponderRelease: () => {
        activeQuestionDragRef.current = null;
        setDraggingQuestionId(null);
      },
      onPanResponderTerminate: () => {
        activeQuestionDragRef.current = null;
        setDraggingQuestionId(null);
      },
    })
  );

  const syncSurveyDueToNextMeeting = async () => {
    let meeting: Pick<Event, 'event_date' | 'event_time' | 'title'> | null = nextSurveyMeeting;

    // Fallback: some meetings are saved without event_type='meeting', so also
    // look for the next upcoming event whose title mentions "meeting".
    if (!meeting && communityId) {
      const today = getLocalIsoDate(new Date());
      const { data } = await supabase
        .from('events')
        .select('event_date, event_time, title')
        .eq('community_id', communityId)
        .gte('event_date', today)
        .or('status.is.null,status.eq.scheduled')
        .ilike('title', '%meeting%')
        .order('event_date', { ascending: true })
        .limit(1);
      meeting = (data?.[0] as Pick<Event, 'event_date' | 'event_time' | 'title'> | undefined) ?? null;
    }

    if (!meeting?.event_date) {
      setSurveyEditorError('No upcoming HIVE meeting found on the calendar yet.');
      return;
    }

    // 30 minutes before the meeting start (5:30 PM default → 5:00 PM due).
    const dueAt = getSurveyDefaultDueAt(meeting);
    setSurveyEditorDueDate(toAmericanDate(dueAt));
    setSurveyEditorDueTime(getTimeInputValue(dueAt));
    setSurveyEditorError(null);
  };

  const applyMonthlyCheckInTemplate = () => {
    questionLayoutsRef.current = {};
    setSurveyEditorTitle(prev => prev.trim() || 'Monthly Check-in: POP + Energy');
    setSurveyEditorDescription(prev => prev.trim() || MONTHLY_CHECK_IN_DESCRIPTION);
    setSurveyEditorQuestions(MONTHLY_CHECK_IN_TEMPLATE.map(cloneQuestion));
    setSurveyEditorError(null);
  };

  const saveSurveyEdits = async () => {
    if (!editingSurvey || !communityId) return;

    const title = surveyEditorTitle.trim();
    if (!title) {
      setSurveyEditorError('Add a survey title before saving.');
      return;
    }

    const { dueDate, error: dueDateError } = normalizeSurveyDueDateInput(surveyEditorDueDate, surveyEditorDueTime);
    if (dueDateError) {
      setSurveyEditorError(dueDateError);
      return;
    }

    const questions = surveyEditorQuestions
      .map((question) => ({
        ...question,
        id: question.id || createSurveyQuestionId(),
        text: question.text.trim(),
        options: question.options?.map(option => option.trim()).filter(Boolean),
      }))
      .filter(question => question.text.length > 0)
      .map(question => ({
        ...question,
        options: question.type === 'choice' ? question.options : undefined,
      }));

    setSavingSurveyEditor(true);
    setSurveyEditorError(null);
    try {
      const { error } = await supabase
        .from('surveys')
        .update({
          title,
          description: surveyEditorDescription.trim() || null,
          due_date: dueDate,
          questions,
        })
        .eq('id', editingSurvey.id)
        .eq('community_id', communityId);

      if (error) {
        setSurveyEditorError('Could not save this survey. Please try again.');
        return;
      }

      closeSurveyEditor();
      await refetchSurveys();
    } finally {
      setSavingSurveyEditor(false);
    }
  };

  const createQuickSurvey = async () => {
    if (!surveyTitle.trim() || !communityId) return;
    const { dueDate, error: dueDateError } = normalizeSurveyDueDateInput(surveyDueDate, surveyDueTime);
    if (dueDateError) {
      showAlert('Due date', dueDateError);
      return;
    }

    setSavingSurvey(true);
    try {
      await supabase.from('surveys').insert({
        community_id: communityId,
        title: surveyTitle.trim(),
        description: surveyDescription.trim() || null,
        due_date: dueDate,
        questions: [],
        is_active: true,
        created_by: profile?.id,
      });
      setSurveyTitle('');
      setSurveyDescription('');
      setSurveyDueDate('');
      setSurveyDueTime('');
      setShowSurveyModal(false);
      refetchSurveys();
    } catch (e) {
      showAlert('Error', 'Failed to create survey');
    } finally {
      setSavingSurvey(false);
    }
  };

  const updateMemberRole = async (membershipId: string, role: UserRole) => {
    const { error } = await supabase
      .from('community_memberships')
      .update({ role })
      .eq('id', membershipId);

    if (error) {
      showAlert('Error', 'Failed to update role');
    } else {
      await fetchData();
    }
  };

  const removeMember = async (membershipId: string, memberName: string, memberId: string) => {
    // Don't allow removing yourself
    if (memberId === profile?.id) {
      showAlert('Error', "You can't remove yourself from the community.");
      return;
    }

    const doRemove = async () => {
      try {
        const { error } = await supabase
          .from('community_memberships')
          .delete()
          .eq('id', membershipId);

        if (error) throw error;
        await fetchData();
        showAlert('Success', `${memberName} has been removed from the community.`);
      } catch (err) {
        console.error('Remove member error:', err);
        showAlert('Error', 'Failed to remove member');
      }
    };

    // Confirmation
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Remove ${memberName} from the community?\n\nThey can be re-invited later.`)) {
        await doRemove();
      }
    } else {
      Alert.alert(
        'Remove Member',
        `Remove ${memberName} from the community?\n\nThey can be re-invited later.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: doRemove },
        ]
      );
    }
  };

  const createQueenBee = async () => {
    if (!selectedMember || !communityId) {
      showAlert('Error', 'Please select a member');
      return;
    }

    // Auto-generate month if not provided (next available month)
    // Format: YYYY-MM (ISO format for proper sorting and querying)
    let month = qbMonth;

    // Normalize manual input: convert MM-YYYY to YYYY-MM if needed
    if (month) {
      const parts = month.split('-');
      if (parts.length === 2) {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        if (first <= 12 && second > 12) {
          // MM-YYYY format entered, convert to YYYY-MM
          month = `${second}-${String(first).padStart(2, '0')}`;
        }
      }
    }

    if (!month) {
      // Sort existing months to find the latest one
      const existingMonths = queenBees.map(qb => qb.month);
      // Parse both MM-YYYY and YYYY-MM formats for backwards compatibility
      const parsedMonths = existingMonths
        .map(m => {
          const parts = m.split('-');
          if (parts.length === 2) {
            // Could be MM-YYYY or YYYY-MM
            const first = parseInt(parts[0], 10);
            const second = parseInt(parts[1], 10);
            if (first > 12) {
              // YYYY-MM format
              return { year: first, month: second };
            } else {
              // MM-YYYY format (legacy)
              return { year: second, month: first };
            }
          }
          return null;
        })
        .filter(Boolean) as { year: number; month: number }[];

      if (parsedMonths.length > 0) {
        // Find the latest month
        parsedMonths.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        });
        const latest = parsedMonths[0];
        // Increment
        const nextMonth = latest.month === 12 ? 1 : latest.month + 1;
        const nextYear = latest.month === 12 ? latest.year + 1 : latest.year;
        month = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
      } else {
        // Start with current month
        const now = new Date();
        month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      }
    }

    const { error } = await supabase.from('queen_bees').insert({
      user_id: selectedMember.id,
      community_id: communityId,
      month,
      project_title: qbTitle || 'TBD',
      project_description: qbDescription || null,
      status: qbStatus,
    });

    if (error) {
      showAlert('Error', 'Failed to create Queen Bee');
    } else {
      closeQueenBeeModal();
      await fetchData();
    }
  };

  const updateQueenBee = async () => {
    if (!editingQueenBee || !qbTitle) {
      showAlert('Error', 'Please fill in required fields');
      return;
    }

    const { error } = await supabase
      .from('queen_bees')
      .update({
        project_title: qbTitle,
        project_description: qbDescription,
        status: qbStatus,
      })
      .eq('id', editingQueenBee.id);

    if (error) {
      showAlert('Error', 'Failed to update Queen Bee');
    } else {
      closeQueenBeeModal();
      await fetchData();
    }
  };

  const closeQueenBeeModal = () => {
    setShowQueenBeeModal(false);
    setEditingQueenBee(null);
    setSelectedMember(null);
    setQbMonth('');
    setQbTitle('');
    setQbDescription('');
    setQbStatus('upcoming');
  };

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

  const sendInvite = async () => {
    const trimmedEmail = inviteEmail.trim();

    if (!trimmedEmail || !communityId) {
      showAlert('Error', 'Please enter an email');
      return;
    }

    if (sendingInvite) return;

    setSendingInvite(true);

    try {
      const { data, error } = await supabase.functions.invoke<InviteFunctionResponse>('invite', {
        body: {
          email: trimmedEmail,
          role: inviteRole,
          community_id: communityId,
        },
      });

      if (error) {
        throw new Error(await readFunctionErrorMessage(error, 'Failed to send invite'));
      }

      await fetchData();
      showAlert(
        data?.reusedInvite ? 'Invite refreshed' : 'Invite sent',
        data?.reusedInvite
          ? `${trimmedEmail} already had a pending invite, so we refreshed it and sent the link again.`
          : `${trimmedEmail} will receive an invite to join.`
      );
      setInviteEmail('');
      setInviteRole('member');
      setShowInviteMember(false);
    } catch (error) {
      console.error('Invite send error:', error);
      showAlert('Error', error instanceof Error ? error.message : 'Failed to send invite');
    } finally {
      setSendingInvite(false);
    }
  };

  const revokeInvite = async (inviteId: string, email: string) => {
    // Use window.confirm on web, Alert.alert on native
    const confirmed = typeof window !== 'undefined' && window.confirm
      ? window.confirm(`Are you sure you want to revoke the invite for ${email}?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Revoke Invite',
            `Are you sure you want to revoke the invite for ${email}?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Revoke', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmed) return;

    if (!communityId) {
      showAlert('Error', 'No community context. Please refresh and try again.');
      return;
    }

    const { data, error } = await supabase
      .from('community_invites')
      .delete()
      .eq('id', inviteId)
      .eq('community_id', communityId)
      .select();

    if (error) {
      console.error('Revoke invite error:', error);
      alert(`Failed to revoke invite: ${error.message}`);
    } else if (!data || data.length === 0) {
      alert('No invite was deleted. You may not have permission or the invite no longer exists.');
    } else {
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
      showHoneyPotFeedback('error', 'Honey Pot update failed', getHoneyPotErrorMessage(err));
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
  const mobilePanelHeight = Math.min(430, Math.max(340, Math.floor(height * 0.46)));
  const dashboardOuterContentStyle: ViewStyle = useMobileLayout
    ? { padding: 16 }
    : { padding: 16, paddingBottom: 10 };
  const dashboardPanelStyle = { height: useMobileLayout ? mobilePanelHeight : desktopPanelHeight };
  const dashboardPanelBodyStyle = { flex: 1 };
  const panelScrollStyle = { flex: 1 };
  const panelOrderStyle = (order: number) => ({ order } as unknown as ViewStyle);
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

      <ScrollView
        className="flex-1"
        alwaysBounceVertical
        contentContainerStyle={[dashboardOuterContentStyle, { minHeight: '101%' }] as any}
        refreshControl={useMobileLayout ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined}
      >
        <View style={dashboardWrapStyle}>
          {/* Honey Pot moved out. Recording lives on the Honey Pot page now,
              where the pot is, and the ledger was always public anyway
              (Nat 2026-08-01). This room is for people. */}

          {isAdmin && (
            <View style={[dashboardCellStyle, panelOrderStyle(ADMIN_PANEL_ORDER.meetingTools)]}>
              <AdminPanel
                // Renamed (Nat 2026-08-04). The meeting-day tools moved INTO
                // each HIVE's own folder as a tab above, which is where they
                // belong — every one of them runs for exactly one HIVE. What is
                // left in this box is the survey machinery, so it says so.
                title="Surveys"
                style={dashboardPanelStyle}
                bodyStyle={dashboardPanelBodyStyle}
                action={(
                  <AdminHeaderAction
                    label="+ Create"
                    onPress={openSurveyCreateModal}
                  />
                )}
              >
                <ScrollView
                  style={panelScrollStyle}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={true}
                >
                  {/* Meeting tools — quick links to the meeting-day surfaces */}
                  <View
                    style={{
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(222,193,129,0.3)',
                      paddingBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Lato_700Bold',
                        fontSize: 11,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        color: '#9a8060',
                        paddingHorizontal: 14,
                        paddingTop: 12,
                        paddingBottom: 4,
                      }}
                    >
                      Meeting tools
                    </Text>
                    {/* The four meeting-day links (Meeting Helper, Monthly
                        Tune-up, Newsletter Draft, Halfway Check-in) moved to the
                        Meetings tab on 2026-08-01, at Nat's call — they are what
                        you reach for on meeting day, not settings you configure
                        once. What stays here is the survey machinery.

                        Nat, 2026-08-03: "where did all my meeting helpers go?!?!"
                        The move was right; the signpost was not. Admin is only
                        reachable FROM HIVE-Wide, and Meetings is hidden AT
                        HIVE-Wide — so from this page the old one-line link
                        pointed at a tab the rail won't take you to, and the
                        tools read as deleted rather than moved. */}
                    {([
                      { label: 'Every meeting tool now sits inside its own HIVE, in the boxes above', emoji: '📅', route: '/meetings', params: {} },
                    ] as const).map((tool) => (
                      <Pressable
                        key={`${tool.route}-${tool.label}`}
                        onPress={() => router.push({ pathname: tool.route as any, params: { from: 'admin', ...tool.params } })}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          backgroundColor: pressed ? '#fbf4e3' : 'transparent',
                        })}
                      >
                        <Text style={{ fontSize: 15, marginRight: 8 }}>{tool.emoji}</Text>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30', flex: 1 }}>
                          {tool.label}
                        </Text>
                        <Ionicons name="chevron-forward" size={15} color="#bd9348" />
                      </Pressable>
                    ))}
                    {/* The monthly check-in lives here as the "engine" behind the
                        Tune-up, not as a loose survey — opens the same editor/responses. */}
                    {(() => {
                      const checkIn = allSurveys.find((s) => /monthly\s+check-?in/i.test(s.title));
                      if (!checkIn) return null;
                      return (
                        <Pressable
                          key="monthly-check-in"
                          onPress={() => openSurveyEditor(checkIn)}
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            backgroundColor: pressed ? '#fbf4e3' : 'transparent',
                          })}
                        >
                          <Text style={{ fontSize: 15, marginRight: 8 }}>📊</Text>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30', flex: 1 }}>
                            Check-in questions & responses
                          </Text>
                          <Ionicons name="chevron-forward" size={15} color="#bd9348" />
                        </Pressable>
                      );
                    })()}
                  </View>
                  {(() => {
                    const otherSurveys = allSurveys.filter((s) => !/monthly\s+check-?in/i.test(s.title));
                    if (otherSurveys.length === 0) {
                      return (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#9ca3af' }}>
                            No other surveys yet.
                          </Text>
                        </View>
                      );
                    }
                    return otherSurveys.map((survey, i) => (
                      <Pressable key={survey.id} onPress={() => openSurveyEditor(survey)} style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', padding: 14,
                        borderBottomWidth: i < otherSurveys.length - 1 ? 1 : 0,
                        borderBottomColor: 'rgba(222,193,129,0.3)',
                        backgroundColor: pressed ? '#fbf4e3' : 'transparent',
                      })}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d' }}>{survey.title}</Text>
                          {survey.due_date && (
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                              Due {formatSurveyDueAt(survey.due_date)}
                            </Text>
                          )}
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 2 }}>
                            {(survey.questions ?? []).length} question{(survey.questions ?? []).length === 1 ? '' : 's'} · Tap to edit & see responses
                          </Text>
                        </View>
                        <Pressable
                          onPress={(event) => {
                            event.stopPropagation();
                            toggleSurveyActive(survey);
                          }}
                          style={({ pressed }: { pressed: boolean }) => ({
                            backgroundColor: pressed ? (survey.is_active ? '#f5e0b0' : '#e5e7eb') : (survey.is_active ? '#fdf3dc' : '#f3f4f6'),
                            paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10,
                          })}
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: survey.is_active ? '#bd9348' : '#9ca3af' }}>
                            {survey.is_active ? 'Active' : 'Inactive'}
                          </Text>
                        </Pressable>
                      </Pressable>
                    ));
                  })()}
                </ScrollView>
              </AdminPanel>
            </View>
          )}

          {/* The newsletter goes out past every HIVE, so its box wears the house
              cream rather than any one HIVE's colour. Nat's draft opens from
              inside it. */}
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
              onOpenCheckIns={() => setPendingCheckInOpen(true)}
              cellStyle={dashboardCellStyle}
              panelStyle={dashboardPanelStyle}
              bodyStyle={dashboardPanelBodyStyle}
              scrollStyle={panelScrollStyle}
              Panel={AdminPanel}
              HeaderAction={AdminHeaderAction}
            />
          )}
        </View>
      </ScrollView>

      {/* Survey Create Modal */}
      <Modal visible={showSurveyModal} animationType="slide" transparent onRequestClose={() => setShowSurveyModal(false)}>
        <ModalBackdrop onClose={() => setShowSurveyModal(false)} style={{ justifyContent: 'flex-end' }}>
          {/* The Survey Editor next door already had a ceiling and a scroll;
              this one, which is the same sheet with a date picker in it, had
              neither — so Create Survey was the button that went missing. */}
          <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', overflow: 'hidden' }}>
            <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 20, color: '#2d2d2d', marginBottom: 16 }}>Create Survey</Text>
            {/* A survey's name and its description are both things a person
                writes in words, so they are the shared box with the mic inside
                it rather than a field with a mic welded underneath. */}
            <ComposerBar
              variant="form"
              containerClassName="mb-3"
              label="Survey title"
              value={surveyTitle}
              onChangeText={setSurveyTitle}
              multiline={false}
            />
            <ComposerBar
              variant="form"
              containerClassName="mb-3"
              label="Description (optional)"
              value={surveyDescription}
              onChangeText={setSurveyDescription}
              minHeight={72}
            />
            <View style={{ flexDirection: useMobileLayout ? 'column' : 'row', gap: 10, marginBottom: 16 }}>
              <View style={{ flex: 2, minWidth: 180 }}>
                <EventDatePicker
                  value={surveyDueDate}
                  onChange={setSurveyDueDate}
                />
              </View>
              <SurveyTimePicker
                value={surveyDueTime}
                onChange={setSurveyDueTime}
              />
            </View>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
              💡 After creating, ask Clive to help you build questions for this survey.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setShowSurveyModal(false)} style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 14, paddingVertical: 14 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={createQuickSurvey}
                disabled={!surveyTitle.trim() || savingSurvey}
                style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 14, paddingVertical: 14, opacity: surveyTitle.trim() && !savingSurvey ? 1 : 0.4 }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white', textAlign: 'center' }}>
                  {savingSurvey ? 'Creating...' : 'Create Survey'}
                </Text>
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>

      {/* Survey Editor Modal */}
      <Modal visible={!!editingSurvey} animationType="slide" transparent onRequestClose={closeSurveyEditor}>
        <ModalBackdrop onClose={closeSurveyEditor} style={{ justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fffdf5', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '94%' }}>
            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ padding: 24, paddingBottom: 32 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 20, color: '#2d2d2d' }}>
                    Survey Settings
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', marginTop: 4 }}>
                    {(surveyEditorQuestions ?? []).length} question{surveyEditorQuestions.length === 1 ? '' : 's'}
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

              <ComposerBar
                variant="form"
                containerClassName="mb-3"
                label="Survey title"
                value={surveyEditorTitle}
                onChangeText={setSurveyEditorTitle}
                multiline={false}
              />
              <ComposerBar
                variant="form"
                containerClassName="mb-3"
                label="Description"
                value={surveyEditorDescription}
                onChangeText={setSurveyEditorDescription}
                minHeight={72}
              />
              <View style={{ flexDirection: useMobileLayout ? 'column' : 'row', gap: 10, marginBottom: 8 }}>
                <View style={{ flex: 2, minWidth: 180 }}>
                  <EventDatePicker
                    value={surveyEditorDueDate}
                    onChange={setSurveyEditorDueDate}
                  />
                </View>
                <SurveyTimePicker
                  value={surveyEditorDueTime}
                  onChange={setSurveyEditorDueTime}
                />
              </View>
              <Pressable
                onPress={() => { void syncSurveyDueToNextMeeting(); }}
                style={({ pressed }) => ({
                  alignSelf: 'flex-start',
                  backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
                  borderColor: 'rgba(222,193,129,0.55)',
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  marginBottom: 12,
                })}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30' }}>
                  📅 Sync to next HIVE meeting
                </Text>
              </Pressable>

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

              <Pressable
                onPress={applyMonthlyCheckInTemplate}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? '#f5e0b0' : '#fdf3dc',
                  borderColor: 'rgba(222,193,129,0.72)',
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  marginBottom: 16,
                })}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#8a6b30', textAlign: 'center' }}>
                  Use 2-3 min monthly template
                </Text>
              </Pressable>

              <View style={{ gap: 12 }}>
                {surveyEditorQuestions.map((question, index) => {
                  const isDragging = draggingQuestionId === question.id;
                  const dragResponder = createQuestionDragResponder(question.id, index);
                  return (
                    <View
                      key={`${question.id}-${index}`}
                      onLayout={(event) => {
                        questionLayoutsRef.current[question.id] = event.nativeEvent.layout;
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: isDragging ? '#bd9348' : 'rgba(222,193,129,0.45)',
                        borderRadius: 14,
                        backgroundColor: isDragging ? '#fdf3dc' : '#fff8e8',
                        padding: 12,
                        opacity: isDragging ? 0.78 : 1,
                        shadowColor: '#bd9348',
                        shadowOpacity: isDragging ? 0.2 : 0,
                        shadowRadius: isDragging ? 10 : 0,
                        shadowOffset: { width: 0, height: 4 },
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <View
                            {...dragResponder.panHandlers}
                            accessibilityRole="button"
                            accessibilityLabel={`Drag question ${index + 1}`}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 15,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: isDragging ? '#bd9348' : '#fffdf5',
                              borderWidth: 1,
                              borderColor: isDragging ? '#bd9348' : 'rgba(222,193,129,0.55)',
                            }}
                          >
                            <Ionicons name="reorder-three-outline" size={18} color={isDragging ? 'white' : '#8a6b30'} />
                          </View>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>
                            Question {index + 1}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <Pressable
                            onPress={() => moveSurveyQuestion(index, index - 1)}
                            disabled={index === 0}
                            accessibilityRole="button"
                            accessibilityLabel={`Move question ${index + 1} up`}
                            hitSlop={8}
                            style={({ pressed }) => ({
                              opacity: index === 0 ? 0.3 : pressed ? 0.55 : 1,
                              padding: 5,
                            })}
                          >
                            <Ionicons name="chevron-up" size={16} color="#8a6b30" />
                          </Pressable>
                          <Pressable
                            onPress={() => moveSurveyQuestion(index, index + 1)}
                            disabled={index === surveyEditorQuestions.length - 1}
                            accessibilityRole="button"
                            accessibilityLabel={`Move question ${index + 1} down`}
                            hitSlop={8}
                            style={({ pressed }) => ({
                              opacity: index === surveyEditorQuestions.length - 1 ? 0.3 : pressed ? 0.55 : 1,
                              padding: 5,
                            })}
                          >
                            <Ionicons name="chevron-down" size={16} color="#8a6b30" />
                          </Pressable>
                          <Pressable
                            onPress={() => removeSurveyQuestion(index)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove question ${index + 1}`}
                            hitSlop={8}
                            style={({ pressed }) => ({
                              opacity: pressed ? 0.55 : 1,
                              padding: 5,
                            })}
                          >
                            <Ionicons name="trash-outline" size={16} color="#b45309" />
                          </Pressable>
                        </View>
                      </View>

                    {/* The question itself is a sentence somebody writes, so it
                        gets the shared box. The text lives inside a question
                        object rather than in its own useState, so the setter
                        unwraps both shapes the box can hand back: a plain
                        string when you type, an updater when you talk. */}
                    <ComposerBar
                      variant="form"
                      containerClassName="mb-3"
                      value={question.text}
                      onChangeText={(next) => updateSurveyQuestion(index, (current) => ({
                        ...current,
                        text: typeof next === 'function' ? next(current.text ?? '') : next,
                      }))}
                      placeholder="Question text"
                      minHeight={58}
                    />

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: question.type === 'choice' ? 10 : 0 }}>
                      {SURVEY_QUESTION_TYPES.map((type) => {
                        const active = question.type === type;
                        return (
                          <Pressable
                            key={type}
                            onPress={() => updateSurveyQuestion(index, current => ({ ...current, type }))}
                            style={({ pressed }) => ({
                              backgroundColor: active ? '#bd9348' : pressed ? '#fbf0d7' : '#fffdf5',
                              borderColor: active ? '#bd9348' : 'rgba(222,193,129,0.55)',
                              borderWidth: 1,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            })}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: active ? 'white' : '#8a6b30' }}>
                              {SURVEY_TYPE_LABELS[type]}
                            </Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={() => updateSurveyQuestion(index, current => ({ ...current, required: !current.required }))}
                        style={({ pressed }) => ({
                          backgroundColor: question.required ? '#fdf3dc' : pressed ? '#fbf0d7' : '#fffdf5',
                          borderColor: question.required ? '#bd9348' : 'rgba(222,193,129,0.55)',
                          borderWidth: 1,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        })}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30' }}>
                          {question.required ? 'Required' : 'Optional'}
                        </Text>
                      </Pressable>
                    </View>

                    {question.type === 'choice' && (
                      // The answers people will pick from are words too, so this
                      // box takes the mic as well. One choice per line: speaking
                      // adds to the line you are on, so start a new line first.
                      <ComposerBar
                        variant="form"
                        value={(question.options ?? []).join('\n')}
                        onChangeText={(next) => updateSurveyQuestion(index, (current) => {
                          const previous = (current.options ?? []).join('\n');
                          const text = typeof next === 'function' ? next(previous) : next;
                          return { ...current, options: text.split('\n') };
                        })}
                        placeholder="One choice per line"
                        minHeight={78}
                      />
                    )}
                  </View>
                );
                })}
              </View>

              <Pressable
                onPress={addSurveyQuestion}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
                  borderColor: 'rgba(222,193,129,0.72)',
                  borderWidth: 1,
                  borderRadius: 14,
                  paddingVertical: 12,
                  marginTop: 12,
                })}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#8a6b30', textAlign: 'center' }}>
                  Add Question
                </Text>
              </Pressable>

              {surveyEditorError ? (
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#ef4444', marginTop: 14 }}>
                  {surveyEditorError}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <Pressable onPress={closeSurveyEditor} style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 14, paddingVertical: 14 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={saveSurveyEdits}
                  disabled={savingSurveyEditor}
                  style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 14, paddingVertical: 14, opacity: savingSurveyEditor ? 0.65 : 1 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white', textAlign: 'center' }}>
                    {savingSurveyEditor ? 'Saving...' : 'Save Survey'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>

      {/* Queen Bee Modal */}
      <Modal visible={showQueenBeeModal} animationType="slide" transparent onRequestClose={() => setShowQueenBeeModal(false)}>
        <ModalBackdrop onClose={() => setShowQueenBeeModal(false)} style={{ justifyContent: 'flex-end' }}>
          {/* Member picker, month, two text boxes and a status row, with Save
              at the very bottom — the tallest sheet in admin and the one most
              likely to put its own button out of reach. */}
          <View className="bg-white rounded-t-3xl" style={{ maxHeight: '90%', overflow: 'hidden' }}>
            <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              {editingQueenBee ? 'Edit Queen Bee' : 'Set Queen Bee'}
            </Text>

            {!editingQueenBee && (
              <>
                <Text className="text-gray-600 mb-2">Select Member</Text>
                <ScrollView horizontal className="mb-4">
                  {members.map((member) => (
                    <Pressable
                      key={member.id}
                      onPress={() => setSelectedMember(member.profiles)}
                      className={`mr-2 p-2 rounded-lg ${
                        selectedMember?.id === member.profiles.id
                          ? 'bg-honey-100 border-2 border-honey-500'
                          : 'bg-gray-100'
                      }`}
                    >
                      <Text className="font-medium">{member.profiles.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {/* A month is a slot on a calendar, not a sentence, so no mic —
                    but it wears the same fill, edge and placeholder ink as every
                    box around it. */}
                <TextInput
                  placeholder="Month YYYY-MM (auto-fills next)"
                  value={qbMonth}
                  onChangeText={setQbMonth}
                  placeholderTextColor={FIELD_LOOK.placeholder}
                  selectionColor={FIELD_LOOK.ink}
                  style={{
                    borderWidth: 1,
                    borderColor: FIELD_LOOK.border,
                    borderRadius: FIELD_LOOK.radius,
                    backgroundColor: FIELD_LOOK.fill,
                    paddingHorizontal: FIELD_LOOK.paddingHorizontal,
                    paddingVertical: FIELD_LOOK.paddingVertical,
                    marginBottom: 12,
                    fontFamily: FIELD_LOOK.font,
                    fontSize: FIELD_LOOK.fontSize,
                    color: FIELD_LOOK.ink,
                  }}
                />
              </>
            )}

            {editingQueenBee && (
              <View className="mb-3 p-3 bg-gray-50 rounded-lg">
                <Text className="text-gray-600">
                  {selectedMember?.name} • {qbMonth}
                </Text>
              </View>
            )}

            <ComposerBar
              variant="form"
              containerClassName="mb-3"
              label="Project title"
              value={qbTitle}
              onChangeText={setQbTitle}
              placeholder="Optional — defaults to TBD"
              multiline={false}
            />
            <ComposerBar
              variant="form"
              containerClassName="mb-3"
              label="Project description (optional)"
              value={qbDescription}
              onChangeText={setQbDescription}
              minHeight={78}
            />

            <Text className="text-gray-600 mb-2">Status</Text>
            <View className="flex-row mb-4">
              {(['upcoming', 'active', 'completed'] as const).map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setQbStatus(status)}
                  className={`px-4 py-2 rounded-lg mr-2 ${
                    qbStatus === status
                      ? status === 'active' ? 'bg-green-500' :
                        status === 'completed' ? 'bg-gray-500' : 'bg-honey-500'
                      : 'bg-gray-100'
                  }`}
                >
                  <Text className={`capitalize ${
                    qbStatus === status ? 'text-white' : 'text-gray-600'
                  }`}>
                    {status}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="flex-row">
              <Pressable
                onPress={closeQueenBeeModal}
                className="flex-1 bg-gray-200 py-3 rounded-lg mr-2"
              >
                <Text className="text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={editingQueenBee ? updateQueenBee : createQueenBee}
                className="flex-1 bg-honey-500 py-3 rounded-lg"
              >
                <Text className="text-center font-semibold text-white">
                  {editingQueenBee ? 'Save' : 'Create'}
                </Text>
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>

      {/* Event Modal */}
      <Modal visible={showEventModal} animationType="slide" transparent onRequestClose={() => setShowEventModal(false)}>
        <ModalBackdrop onClose={() => setShowEventModal(false)} style={{ justifyContent: 'flex-end' }}>
          {/* Title, date, a growing description and the audience toggle stack
              up taller than a phone before you have typed anything, and Create
              lives underneath all of it. Ceiling on the sheet, scroll inside. */}
          <View className="bg-white rounded-t-3xl" style={{ maxHeight: '90%', overflow: 'hidden' }}>
            <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              Add Event
            </Text>

            <ComposerBar
              variant="form"
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
              containerClassName="mb-4"
              label="Description (optional)"
              value={eventDescription}
              onChangeText={setEventDescription}
              minHeight={78}
            />

            <View className="mb-4">
              <EventAudienceToggle value={eventAudience} onChange={setEventAudience} />
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
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>
    </SafeAreaView>
  );
}
