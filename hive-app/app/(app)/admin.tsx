import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
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
import { EventDatePicker } from '../../components/ui/DatePicker';
import { AppHeader } from '../../components/navigation';
import { HoneyPotLedger } from '../../components/hive/HoneyPotLedger';
import { useSurveys } from '../../lib/hooks/useSurveys';
import type { Survey, SurveyQuestion } from '../../lib/hooks/useSurveys';
import { parseAmericanDate } from '../../lib/dateUtils';
import type { Profile, QueenBee, UserRole, CommunityInvite, Event } from '../../types';

type MemberRow = {
  id: string;
  role: UserRole;
  profiles: Profile;
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

const SURVEY_QUESTION_TYPES: SurveyQuestion['type'][] = ['short', 'long', 'scale', 'choice'];
const SURVEY_TYPE_LABELS: Record<SurveyQuestion['type'], string> = {
  short: 'Short',
  long: 'Long',
  scale: 'Scale',
  choice: 'Choice',
};

const MONTHLY_CHECK_IN_TEMPLATE: SurveyQuestion[] = [
  {
    id: 'q_health_energy',
    text: 'How are your health and energy right now?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_attention',
    text: 'What has been taking up most of your attention lately, personally or professionally?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_hive_need',
    text: 'What is one thing you would love help, advice, an introduction, or a resource for this month?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_hive_offer',
    text: 'What is something you could offer, share, teach, recommend, or connect someone with this month?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_wish_hummdinger',
    text: 'What wish, goal, or HummDinger should HIVE keep in view for you?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_meeting_priority',
    text: 'What would make today\'s gathering feel useful for you?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_tender_context',
    text: 'Anything heavy, confusing, or tender that the HIVE hosts or Clive should know before we gather?',
    type: 'long',
    required: false,
  },
  {
    id: 'q_sharing_permission',
    text: 'What from this check-in is okay to share with the group, and what should stay with the hosts or Clive?',
    type: 'long',
    required: false,
  },
];

const MONTHLY_CHECK_IN_DESCRIPTION =
  'A quick 2-3 minute check-in so HIVE and Clive know where everyone is before we gather.';

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

function AdminPanel({
  title,
  action,
  style,
  bodyStyle,
  children,
}: {
  title: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={[{ marginBottom: 0 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 0 }}>
        <View
          style={{
            flexShrink: 1,
            backgroundColor: '#fdf3dc',
            borderColor: 'rgba(222,193,129,0.7)',
            borderWidth: 1,
            borderBottomWidth: 0,
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 7,
          }}
        >
          <Text numberOfLines={1} style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d' }}>
            {title}
          </Text>
        </View>
        {action ? <View style={{ paddingBottom: 4, marginLeft: 8 }}>{action}</View> : null}
      </View>
      <View
        style={[{
          backgroundColor: '#fffdf5',
          borderRadius: 20,
          borderTopLeftRadius: 0,
          borderWidth: 1,
          borderColor: 'rgba(222,193,129,0.7)',
          shadowColor: '#bd9348',
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
      <AppHeader title="Admin" />
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
  const { profile, communityId, communityRole } = useAuth();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const queryClient = useQueryClient();
  const useMobileLayout = width < 768;
  const currentDuesPeriod = getCurrentDuesPeriod();
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const isTreasurer = communityRole === 'treasurer' || profile?.role === 'treasurer';
  const canEditHoneyPot = isTreasurer || isAdmin;
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [queenBees, setQueenBees] = useState<QueenBee[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteRow[]>([]);

  // Modal states
  const [showQueenBeeModal, setShowQueenBeeModal] = useState(false);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), refetchSurveys()]);
    setRefreshing(false);
  };

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

  const openSurveyEditor = (survey: Survey) => {
    const defaultDueAt = getDefaultSurveyDue();
    questionLayoutsRef.current = {};
    setEditingSurvey(survey);
    setSurveyEditorTitle(survey.title);
    setSurveyEditorDescription(survey.description ?? '');
    setSurveyEditorDueDate(survey.due_date ? getSurveyDateInputValue(survey.due_date) : toAmericanDate(defaultDueAt));
    setSurveyEditorDueTime(getSurveyTimeInputValue(survey.due_date, defaultDueAt));
    setSurveyEditorQuestions((survey.questions ?? []).map(question => ({
      ...cloneQuestion(question),
      id: question.id || createSurveyQuestionId(),
    })));
    setSurveyEditorError(null);
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

  const applyMonthlyCheckInTemplate = () => {
    questionLayoutsRef.current = {};
    setSurveyEditorTitle(prev => prev.trim() || 'Monthly Check-in');
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
      Alert.alert('Due date', dueDateError);
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
      Alert.alert('Error', 'Failed to create survey');
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
      Alert.alert('Error', 'Failed to update role');
    } else {
      await fetchData();
    }
  };

  const removeMember = async (membershipId: string, memberName: string, memberId: string) => {
    // Don't allow removing yourself
    if (memberId === profile?.id) {
      Alert.alert('Error', "You can't remove yourself from the community.");
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
        Alert.alert('Success', `${memberName} has been removed from the community.`);
      } catch (err) {
        console.error('Remove member error:', err);
        Alert.alert('Error', 'Failed to remove member');
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
      Alert.alert('Error', 'Please select a member');
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
      Alert.alert('Error', 'Failed to create Queen Bee');
    } else {
      closeQueenBeeModal();
      await fetchData();
    }
  };

  const updateQueenBee = async () => {
    if (!editingQueenBee || !qbTitle) {
      Alert.alert('Error', 'Please fill in required fields');
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
      Alert.alert('Error', 'Failed to update Queen Bee');
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
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    // Convert American date format to ISO for storage
    const eventDateIso = parseAmericanDate(eventDate);
    if (!eventDateIso) {
      Alert.alert('Error', 'Please enter date in MM-DD-YYYY format');
      return;
    }

    const { error } = await supabase.from('events').insert({
      title: eventTitle,
      event_date: eventDateIso,
      description: eventDescription,
      event_type: 'custom',
      created_by: profile?.id,
      community_id: communityId,
    });

    if (error) {
      Alert.alert('Error', 'Failed to create event');
    } else {
      setShowEventModal(false);
      setEventTitle('');
      setEventDate('');
      setEventDescription('');
      await fetchData();
    }
  };

  const sendInvite = async () => {
    const trimmedEmail = inviteEmail.trim();

    if (!trimmedEmail || !communityId) {
      Alert.alert('Error', 'Please enter an email');
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
      Alert.alert(
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
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send invite');
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
      Alert.alert('Error', 'No community context. Please refresh and try again.');
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
  const dashboardWrapStyle: ViewStyle = {
    flexDirection: useMobileLayout ? 'column' : 'row',
    flexWrap: 'wrap',
    marginHorizontal: useMobileLayout ? 0 : -8,
  };
  const dashboardCellStyle: ViewStyle = {
    width: useMobileLayout ? '100%' : '50%',
    paddingHorizontal: useMobileLayout ? 0 : 8,
    marginBottom: useMobileLayout ? 18 : 14,
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
      <AppHeader title="Admin" />

      <ScrollView
        className="flex-1"
        scrollEnabled={useMobileLayout}
        contentContainerStyle={dashboardOuterContentStyle}
        refreshControl={useMobileLayout ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined}
      >
        <View style={dashboardWrapStyle}>
          <View style={[dashboardCellStyle, panelOrderStyle(3)]}>
            <AdminPanel title="Honey Pot" style={dashboardPanelStyle} bodyStyle={dashboardPanelBodyStyle}>
              <ScrollView
                style={panelScrollStyle}
                contentContainerStyle={{ padding: 16 }}
                nestedScrollEnabled
                showsVerticalScrollIndicator={true}
              >
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 28, color: '#bd9348', textAlign: 'center', marginBottom: 16 }}>
                  ${honeyPotBalance.toFixed(2)}
                </Text>

                {canEditHoneyPot ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                      {(['deposit', 'withdrawal'] as const).map((type) => {
                        const selected = honeyPotType === type;
                        return (
                          <Pressable
                            key={type}
                            onPress={() => {
                              setHoneyPotType(type);
                              if (type === 'withdrawal') {
                                setDuesCoverage('none');
                                setDuesMemberIds([]);
                              }
                            }}
                            accessibilityRole="button"
                            style={({ pressed }) => ({
                              flex: 1,
                              backgroundColor: selected
                                ? type === 'deposit' ? '#22c55e' : '#ef4444'
                                : pressed ? '#edf2f7' : '#f3f4f6',
                              borderRadius: 12,
                              paddingVertical: 10,
                            })}
                          >
                            <Text style={{
                              fontFamily: 'Lato_700Bold',
                              color: selected ? 'white' : '#4b5563',
                              textAlign: 'center',
                              textTransform: 'capitalize',
                            }}>
                              {type}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <TextInput
                      placeholder="Amount"
                      value={honeyPotAmount}
                      onChangeText={setHoneyPotAmount}
                      keyboardType="decimal-pad"
                      className="border border-gray-300 rounded-lg p-3 mb-3 bg-white"
                    />

                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                      Payment method
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {HONEY_POT_PAYMENT_METHOD_OPTIONS.map((method) => {
                        const selected = honeyPotPaymentMethod === method.value;
                        return (
                          <Pressable
                            key={method.value}
                            onPress={() => setHoneyPotPaymentMethod(method.value)}
                            accessibilityRole="button"
                            style={({ pressed }) => ({
                              backgroundColor: selected ? '#bd9348' : pressed ? '#fbf0d7' : '#f9fafb',
                              borderColor: selected ? '#bd9348' : 'rgba(222,193,129,0.55)',
                              borderWidth: 1,
                              borderRadius: 999,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                            })}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: selected ? 'white' : '#4b5563' }}>
                              {method.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {!(honeyPotType === 'deposit' && duesCoverage !== 'none') && (
                      <TextInput
                        placeholder={honeyPotType === 'withdrawal' ? 'Paid to / for (optional)' : 'From / donor name (optional)'}
                        value={honeyPotCounterparty}
                        onChangeText={setHoneyPotCounterparty}
                        className="border border-gray-300 rounded-lg p-3 mb-3 bg-white"
                      />
                    )}

                    <TextInput
                      placeholder="Note (optional)"
                      value={honeyPotNote}
                      onChangeText={setHoneyPotNote}
                      className="border border-gray-300 rounded-lg p-3 mb-3 bg-white"
                    />

                    {honeyPotType === 'deposit' && (
                      <View className="mb-3">
                        <Text className="text-xs font-semibold text-gray-500 mb-2">
                          Dues tag (optional)
                        </Text>
                        <View className="flex-row flex-wrap mb-2">
                          <Pressable
                            onPress={() => setDuesCoverage('none')}
                            className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                              duesCoverage === 'none' ? 'bg-honey-500' : 'bg-gray-100'
                            }`}
                          >
                            <Text className={`text-xs font-medium ${
                              duesCoverage === 'none' ? 'text-white' : 'text-gray-600'
                            }`}>
                              No dues tag
                            </Text>
                          </Pressable>
                          {DUES_QUARTERS.map((quarter) => {
                            const isSelected = duesCoverage === 'quarter' && duesQuarter === String(quarter);
                            return (
                              <Pressable
                                key={quarter}
                                onPress={() => {
                                  setDuesCoverage('quarter');
                                  setDuesQuarter(String(quarter));
                                }}
                                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                                  isSelected ? 'bg-honey-500' : 'bg-gray-100'
                                }`}
                              >
                                <Text className={`text-xs font-medium ${
                                  isSelected ? 'text-white' : 'text-gray-600'
                                }`}>
                                  Q{quarter} · ${QUARTERLY_DUES_AMOUNT}
                                </Text>
                              </Pressable>
                            );
                          })}
                          <Pressable
                            onPress={() => setDuesCoverage('year')}
                            className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                              duesCoverage === 'year' ? 'bg-honey-500' : 'bg-gray-100'
                            }`}
                          >
                            <Text className={`text-xs font-medium ${
                              duesCoverage === 'year' ? 'text-white' : 'text-gray-600'
                            }`}>
                              Full year · ${ANNUAL_DUES_AMOUNT}
                            </Text>
                          </Pressable>
                        </View>

                        {duesCoverage !== 'none' && (
                          <View className="bg-honey-50 border border-honey-100 rounded-lg p-3">
                            <View className="flex-row mb-2">
                              <TextInput
                                placeholder="Year"
                                value={duesYear}
                                onChangeText={setDuesYear}
                                keyboardType="number-pad"
                                className="border border-honey-200 rounded-lg px-3 py-2 mr-2 bg-white"
                                style={{ width: 92 }}
                              />
                              {duesCoverage === 'quarter' && (
                                <View className="flex-1 bg-white rounded-lg px-3 py-2 border border-honey-100">
                                  <Text className="text-xs font-semibold text-gray-600">
                                    Q{duesQuarter} selected
                                  </Text>
                                </View>
                              )}
                              {duesCoverage === 'year' && (
                                <View className="flex-1 bg-white rounded-lg px-3 py-2 border border-honey-100">
                                  <Text className="text-xs font-semibold text-gray-600">
                                    Covers Q1-Q4
                                  </Text>
                                </View>
                              )}
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              {members.map((member) => {
                                const selected = duesMemberIds.includes(member.profiles.id);
                                return (
                                  <Pressable
                                    key={member.profiles.id}
                                    onPress={() => toggleDuesMember(member.profiles.id)}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: selected }}
                                    className={`mr-2 px-3 py-2 rounded-lg border ${
                                      selected
                                        ? 'bg-honey-500 border-honey-500'
                                        : 'bg-white border-honey-100'
                                    }`}
                                  >
                                    <Text className={`text-xs font-semibold ${
                                      selected ? 'text-white' : 'text-gray-700'
                                    }`}>
                                      {selected ? '✓ ' : ''}{member.profiles.name}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                            {selectedDuesMembers.length > 0 && (
                              <Text className="text-xs text-gray-500 mt-2">
                                Tagging this deposit as dues for {formatMemberList(selectedDuesMembers.map((member) => member.name))}.
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    )}

                    <Pressable
                      onPress={updateHoneyPot}
                      disabled={recordingHoneyPot}
                      accessibilityRole="button"
                      className="bg-honey-500 py-3 rounded-lg active:bg-honey-600"
                      style={{ opacity: recordingHoneyPot ? 0.6 : 1 }}
                    >
                      <Text className="text-center font-semibold text-white">
                        {recordingHoneyPot
                          ? 'Recording...'
                          : `Record ${honeyPotType === 'deposit' ? 'Deposit' : 'Withdrawal'}`}
                      </Text>
                    </Pressable>
                    {honeyPotFeedback && (
                      <View
                        className="mt-3 rounded-lg border px-3 py-2"
                        style={{
                          backgroundColor: HONEY_POT_FEEDBACK_STYLE[honeyPotFeedback.tone].backgroundColor,
                          borderColor: HONEY_POT_FEEDBACK_STYLE[honeyPotFeedback.tone].borderColor,
                        }}
                      >
                        <Text
                          className="text-sm font-semibold text-center"
                          style={{ color: HONEY_POT_FEEDBACK_STYLE[honeyPotFeedback.tone].color }}
                        >
                          {honeyPotFeedback.message}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Text className="text-center text-gray-500">
                    Honey Pot changes are limited to Admins and the Treasurer.
                  </Text>
                )}
              </ScrollView>
            </AdminPanel>
          </View>

          <View style={[dashboardCellStyle, panelOrderStyle(4)]}>
            <AdminPanel title="Honey Pot Transactions" style={dashboardPanelStyle} bodyStyle={dashboardPanelBodyStyle}>
              <ScrollView
                style={panelScrollStyle}
                contentContainerStyle={{ padding: 14 }}
                nestedScrollEnabled
                showsVerticalScrollIndicator={true}
              >
                <HoneyPotLedger
                  balance={honeyPotBalance}
                  transactions={honeyPotTransactions}
                  loading={honeyPotLedgerLoading}
                  compact
                  showBalanceCard={false}
                />
              </ScrollView>
            </AdminPanel>
          </View>

          {isAdmin && (
            <View style={[dashboardCellStyle, panelOrderStyle(1)]}>
              <AdminPanel
                title={`Members (${members.length})`}
                style={dashboardPanelStyle}
                bodyStyle={dashboardPanelBodyStyle}
                action={(
                  <AdminHeaderAction
                    label={showInviteMember ? 'Close Invite' : '+ New Member'}
                    onPress={() => setShowInviteMember((current) => !current)}
                  />
                )}
              >
                <ScrollView
                  style={panelScrollStyle}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={true}
                >
                  {showInviteMember && (
                    <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3e6c8', backgroundColor: '#fffaf0' }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', marginBottom: 10 }}>
                        Invite Member
                      </Text>
                      <TextInput
                        placeholder="Email address"
                        value={inviteEmail}
                        onChangeText={setInviteEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={!sendingInvite}
                        className="border border-gray-300 rounded-lg p-3 mb-3 bg-white"
                        style={sendingInvite ? { opacity: 0.65 } : undefined}
                      />
                      <View className="flex-row flex-wrap mb-4">
                        {ROLE_OPTIONS.map((role) => (
                          <Pressable
                            key={role}
                            onPress={() => setInviteRole(role)}
                            disabled={sendingInvite}
                            className={`px-3 py-2 rounded mr-2 mb-2 ${
                              inviteRole === role ? 'bg-honey-500' : 'bg-gray-100'
                            }`}
                            style={sendingInvite ? { opacity: 0.7 } : undefined}
                          >
                            <Text className={`${inviteRole === role ? 'text-white' : 'text-gray-600'} capitalize`}>
                              {ROLE_LABELS[role]}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {sendingInvite && (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: '#fff7e1',
                            borderColor: '#efd28b',
                            borderWidth: 1,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            marginBottom: 12,
                          }}
                        >
                          <ActivityIndicator size="small" color="#bd9348" />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={{ color: '#5f451b', fontWeight: '700', fontSize: 13 }}>
                              Adding a little magic...
                            </Text>
                            <Text style={{ color: '#7c5d22', fontSize: 12, marginTop: 2 }}>
                              Getting the invite ready to send and refreshing the list.
                            </Text>
                          </View>
                          <Text style={{ color: '#bd9348', fontSize: 18, marginLeft: 8 }}>🐝</Text>
                        </View>
                      )}
                      <Pressable
                        onPress={sendInvite}
                        disabled={sendingInvite}
                        className="py-3 rounded-lg active:bg-honey-600"
                        style={{
                          backgroundColor: sendingInvite ? '#d6b56b' : '#bd9348',
                          opacity: sendingInvite ? 0.85 : 1,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                          {sendingInvite && (
                            <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                          )}
                          <Text className="text-center font-semibold text-white">
                            {sendingInvite ? 'Sending Invite' : 'Send Invite'}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  )}

                {members.map((member) => {
                  const roleButtons = (
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        justifyContent: useMobileLayout ? 'flex-start' : 'flex-end',
                        flexShrink: 0,
                      }}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <Pressable
                          key={role}
                          onPress={() => updateMemberRole(member.id, role)}
                          style={({ pressed }) => ({
                            backgroundColor: member.role === role ? '#bd9348' : pressed ? '#eceff3' : '#f3f4f6',
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            marginRight: 6,
                            marginBottom: useMobileLayout ? 6 : 0,
                          })}
                        >
                          <Text
                            style={{
                              color: member.role === role ? 'white' : '#4b5563',
                              fontSize: 12,
                              fontWeight: '600',
                            }}
                          >
                            {ROLE_LABELS[role]}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  );

                  return (
                    <View
                      key={member.id}
                      style={{
                        padding: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: '#f3f4f6',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Avatar name={member.profiles.name} url={member.profiles.avatar_url} size={40} />
                        <View style={{ flex: 1, minWidth: 0, marginLeft: 12, marginRight: 12 }}>
                          <Text className="font-medium text-gray-800" numberOfLines={2}>
                            {member.profiles.name}
                          </Text>
                          <Text className="text-sm text-gray-500" numberOfLines={1}>
                            {member.profiles.email}
                          </Text>
                        </View>

                        {!useMobileLayout && roleButtons}
                        {member.profiles.id !== profile?.id && (
                          <Pressable
                            onPress={() => removeMember(member.id, member.profiles.name, member.profiles.id)}
                            className="px-2 py-1 bg-red-100 rounded active:bg-red-200"
                            style={{ marginLeft: useMobileLayout ? 0 : 8 }}
                          >
                            <Text className="text-red-600 text-xs">✕</Text>
                          </Pressable>
                        )}
                      </View>

                      {useMobileLayout && (
                        <View style={{ marginTop: 12, marginLeft: 52 }}>
                          {roleButtons}
                        </View>
                      )}
                    </View>
                  );
                })}

                {pendingInvites.length > 0 && (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', paddingHorizontal: 16, paddingTop: 16 }}>
                      Pending Invites ({pendingInvites.length})
                    </Text>
                    {pendingInvites.map((invite) => {
                      const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date();
                      return (
                        <View
                          key={invite.id}
                          className="flex-row items-center p-4 border-b border-gray-100 last:border-b-0"
                        >
                          <View className="flex-1">
                            <Text className="font-medium text-gray-800">
                              {invite.email}
                            </Text>
                            <Text className="text-sm text-gray-500">
                              Role: {ROLE_LABELS[invite.role] || invite.role} • Invited by {invite.inviter?.name || 'Unknown'}
                            </Text>
                            {isExpired && (
                              <Text className="text-sm text-red-500">Expired</Text>
                            )}
                          </View>
                          <Pressable
                            onPress={() => revokeInvite(invite.id, invite.email)}
                            className="px-3 py-2 bg-red-100 rounded-lg active:bg-red-200"
                          >
                            <Text className="text-red-600 text-sm font-medium">Revoke</Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}
                </ScrollView>
              </AdminPanel>
            </View>
          )}

          {isAdmin && (
            <View style={[dashboardCellStyle, panelOrderStyle(2)]}>
              <AdminPanel
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
                  {allSurveys.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#9ca3af' }}>
                        No surveys yet.
                      </Text>
                    </View>
                  ) : (
                    allSurveys.map((survey, i) => (
                      <Pressable key={survey.id} onPress={() => openSurveyEditor(survey)} style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', padding: 14,
                        borderBottomWidth: i < allSurveys.length - 1 ? 1 : 0,
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
                            {(survey.questions ?? []).length} question{(survey.questions ?? []).length === 1 ? '' : 's'} - Tap to edit
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
                    ))
                  )}
                </ScrollView>
              </AdminPanel>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Survey Create Modal */}
      <Modal visible={showSurveyModal} animationType="slide" transparent onRequestClose={() => setShowSurveyModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 20, color: '#2d2d2d', marginBottom: 16 }}>Create Survey</Text>
            <TextInput
              placeholder="Survey title"
              value={surveyTitle}
              onChangeText={setSurveyTitle}
              style={{ borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 12, padding: 12, fontFamily: 'Lato_400Regular', fontSize: 15, color: '#2d2d2d', marginBottom: 10, backgroundColor: '#faf8f3' }}
              placeholderTextColor="#b5ad9f"
            />
            <TextInput
              placeholder="Description (optional)"
              value={surveyDescription}
              onChangeText={setSurveyDescription}
              multiline
              style={{ borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 12, padding: 12, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', marginBottom: 10, backgroundColor: '#faf8f3', minHeight: 72, textAlignVertical: 'top' }}
              placeholderTextColor="#b5ad9f"
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
          </View>
        </View>
      </Modal>

      {/* Survey Editor Modal */}
      <Modal visible={!!editingSurvey} animationType="slide" transparent onRequestClose={closeSurveyEditor}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
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

              <TextInput
                placeholder="Survey title"
                value={surveyEditorTitle}
                onChangeText={setSurveyEditorTitle}
                style={{ borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 12, padding: 12, fontFamily: 'Lato_400Regular', fontSize: 15, color: '#2d2d2d', marginBottom: 10, backgroundColor: '#faf8f3' }}
                placeholderTextColor="#b5ad9f"
              />
              <TextInput
                placeholder="Description"
                value={surveyEditorDescription}
                onChangeText={setSurveyEditorDescription}
                multiline
                style={{ borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 12, padding: 12, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', marginBottom: 10, backgroundColor: '#faf8f3', minHeight: 72, textAlignVertical: 'top' }}
                placeholderTextColor="#b5ad9f"
              />
              <View style={{ flexDirection: useMobileLayout ? 'column' : 'row', gap: 10, marginBottom: 12 }}>
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

                    <TextInput
                      value={question.text}
                      onChangeText={(text) => updateSurveyQuestion(index, current => ({ ...current, text }))}
                      placeholder="Question text"
                      multiline
                      style={{ borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)', borderRadius: 10, padding: 10, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', backgroundColor: 'white', minHeight: 58, textAlignVertical: 'top', marginBottom: 10 }}
                      placeholderTextColor="#b5ad9f"
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
                      <TextInput
                        value={(question.options ?? []).join('\n')}
                        onChangeText={(text) => updateSurveyQuestion(index, current => ({
                          ...current,
                          options: text.split('\n'),
                        }))}
                        placeholder="One choice per line"
                        multiline
                        style={{ borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)', borderRadius: 10, padding: 10, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', backgroundColor: 'white', minHeight: 78, textAlignVertical: 'top' }}
                        placeholderTextColor="#b5ad9f"
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
        </View>
      </Modal>

      {/* Queen Bee Modal */}
      <Modal visible={showQueenBeeModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
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

                <TextInput
                  placeholder="Month YYYY-MM (auto-fills next)"
                  value={qbMonth}
                  onChangeText={setQbMonth}
                  className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50"
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

            <TextInput
              placeholder="Project Title (optional - defaults to TBD)"
              value={qbTitle}
              onChangeText={setQbTitle}
              className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50"
            />
            <TextInput
              placeholder="Project Description (optional)"
              value={qbDescription}
              onChangeText={setQbDescription}
              multiline
              numberOfLines={3}
              className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50"
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
          </View>
        </View>
      </Modal>

      {/* Event Modal */}
      <Modal visible={showEventModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              Add Event
            </Text>

            <TextInput
              placeholder="Event Title"
              value={eventTitle}
              onChangeText={setEventTitle}
              className="border border-gray-300 rounded-lg p-3 mb-3"
            />
            <View className="mb-3">
              <EventDatePicker
                value={eventDate}
                onChange={setEventDate}
              />
            </View>
            <TextInput
              placeholder="Description (optional)"
              value={eventDescription}
              onChangeText={setEventDescription}
              multiline
              numberOfLines={3}
              className="border border-gray-300 rounded-lg p-3 mb-4"
            />

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
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
