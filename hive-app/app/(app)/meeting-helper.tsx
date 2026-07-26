import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { EventAudienceToggle, type EventAudience } from '../../components/events/EventAudienceToggle';
import { useAuth } from '../../lib/hooks/useAuth';
import { fetchHoneyPotLedger } from '../../lib/honeyPot';
import { getCycleStart } from '../../lib/meetingCycle';
import { EditButton } from '../../components/ui/EditButton';
import { getWishQuickTitle, pickSpotlightWish } from '../../lib/wishDisplay';
import { getAppNews } from '../../lib/appNews';
import { parseActionItemDescription } from '../../lib/actionItemDisplay';
import { parseFocusAnswer, focusAnswerDidIt, focusAnswerScore } from '../../components/surveys/SurveyQuestionField';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { HiveIcon } from '../../components/ui/HiveIcon';
import { Avatar } from '../../components/ui/Avatar';
import { ArrivalMemberCard } from '../../components/meetings/ArrivalMemberCard';
import { ScheduleMeetingModal } from '../../components/meetings/ScheduleMeetingModal';
import { MentionSuggestions } from '../../components/ui/MentionSuggestions';
import {
  getActiveMentionQuery,
  getMentionedMembers,
  getMentionSuggestions,
  hasBroadcastMention,
  insertMention,
} from '../../lib/mentions';
import {
  formatMeetingDate,
  getAttendance,
  getCheckInOrder,
  getFirstName,
  getLocalIsoDate,
  getMonthNameFromPeriod,
  getTextAnswer,
  useArrivalBoard,
  type ArrivalBoardMember,
} from '../../lib/hooks/useArrivalBoard';

const hiveBee = require('../../assets/HIVE Bee.png');
const hiveLogo = require('../../assets/HIVE Logo Transparent  BG.png');

const GOLD = '#bd9348';
const GOLD_DEEP = '#8a6b30';
const GOLD_SOFT = 'rgba(222,193,129,0.5)';
const CHARCOAL = '#313130';
const MUTED = '#9a8060';
const PAPER = '#fdfbf2';
const CARD = '#fffdf5';

const TAGLINE = 'HUMAN · INSIGHT · VISION · EXECUTION';

// Tonight's agenda — drives both the Outline slide and the frozen rail.
const AGENDA: { key: string; label: string }[] = [
  { key: 'news', label: 'News from Nat' },
  { key: 'treasurer', label: 'Treasurer' },
  { key: 'meetups', label: 'Plan the Meet Ups' },
  { key: 'hummdinger', label: 'HummDinger Sesh' },
  { key: 'wrapup', label: 'Wrap-Up' },
];

// Nat's POP formula — the backbone of the HummDinger sesh.
const POP_SECTIONS = [
  { key: 'q_pop_progress', label: 'Progress', prompt: 'credit where credit is due' },
  { key: 'q_pop_obstacles', label: 'Obstacles', prompt: 'where are you stuck?' },
  { key: 'q_pop_priorities', label: 'Priorities', prompt: "what's your focus & how can HIVE support you?" },
] as const;

// Same forgiving parser the tune-up uses — "7", "7pm", "around 7:30 PM" all work.
const normalizeEventTimeInput = (value: string) => {
  const raw = value.trim();
  if (!raw) return { time: null as string | null, note: '' };

  const exactMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  const looseMatches = [...raw.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi)];
  const looseMatch = looseMatches[0];
  const match = exactMatch || looseMatch;
  if (!match) return { time: null, note: raw };

  let hour = Number(match[1]);
  const minute = match[2] ?? '00';
  const laterMeridiem = looseMatches.find((timeMatch) => timeMatch[3])?.[3]?.toLowerCase();
  const meridiem = match[3]?.toLowerCase() ?? laterMeridiem;

  if (hour < 1 || hour > 23 || Number(minute) > 59) {
    return { time: null, note: raw };
  }

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return {
    time: `${String(hour).padStart(2, '0')}:${minute}`,
    note: exactMatch ? '' : raw,
  };
};

const POP_ALT_PHRASING =
  'Where are you · Where do you want to be · What have you tried · Where are you stuck';

type MeetingHelperNotes = {
  news?: string;
  appnews?: string;
  meetups?: string;
  wrapup?: string;
};

type EditableNoteKey = keyof MeetingHelperNotes;

type DeckEvent = {
  id: string;
  title: string;
  event_date: string;
  end_date: string | null;
  event_time: string | null;
  event_type: string;
};

type DeckWish = {
  id: string;
  title?: string | null;
  description: string;
  user_id: string;
  memberName: string;
  // Carried so the deck honours a member's starred HD instead of assuming
  // their newest one (see pickSpotlightWish).
  status?: string | null;
  is_active?: boolean | null;
  is_spotlight?: boolean | null;
};

type HangIdea = {
  id: string;
  title: string | null;
};

type GrantedWish = {
  id: string;
  title: string | null;
  description: string;
  user_id: string;
  granterNames: string[];
};

const EDIT_SLIDE_META: Record<EditableNoteKey, { title: string; placeholder: string }> = {
  news: {
    title: 'News from Nat',
    placeholder: "What's the news this month? Announcements, celebrations, house business…",
  },
  appnews: {
    title: 'App updates',
    placeholder: "What's new in the HIVE app this month? The 3 newest things to demo…",
  },
  meetups: {
    title: 'Plan the Meet Ups',
    placeholder: "This month's plans — who's hosting the hang, help requests, meeting notes…",
  },
  wrapup: {
    title: 'Wrap-Up',
    placeholder: 'Final notes, decisions made tonight, things to remember…',
  },
};

function formatBalance(balance: number) {
  return `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MeetingHelperScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  // These live as sibling tab screens, so router.back() can't be trusted to
  // return to the launching tab — honor an explicit `from` param instead.
  const closeDeck = () => {
    if (from === 'admin') router.replace('/admin');
    else if (from === 'meetings') router.replace('/meetings');
    else if (router.canGoBack()) router.back();
    else router.replace('/meetings');
  };
  const { communityId, communityRole, profile, session } = useAuth();
  const { width, height } = useWindowDimensions();
  const isTV = width >= 1400;
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';

  const [slideIndex, setSlideIndex] = useState(0);

  // Slide 1 (Welcome) and slide 2 (Who's in the room) act as the pre-meeting
  // screen, so the arrival data keeps polling while either is showing.
  const {
    loading: arrivalLoading,
    survey,
    responsePeriod,
    members,
    responsesByUser,
    nextMeeting,
    lastUpdatedAt,
    refresh: refreshArrivals,
  } = useArrivalBoard({ pollingEnabled: slideIndex <= 1 });

  // Deck data — loaded once on mount, refreshed via the subtle refresh button.
  const [notes, setNotes] = useState<MeetingHelperNotes>({});
  const [events, setEvents] = useState<DeckEvent[]>([]);
  const [honeyPotBalance, setHoneyPotBalance] = useState<number | null>(null);
  const [hangIdeas, setHangIdeas] = useState<HangIdea[]>([]);
  const [wishes, setWishes] = useState<DeckWish[]>([]);
  const [grantedWishes, setGrantedWishes] = useState<GrantedWish[]>([]);
  const [pastHangs, setPastHangs] = useState<DeckEvent[]>([]);
  const [helperPosts, setHelperPosts] = useState<HangIdea[]>([]);
  const [completedAssists, setCompletedAssists] = useState<
    { id: string; description: string; assignedTo: string | null; relatedUserId: string | null; assigneeName: string }[]
  >([]);
  // Tonight's live recap for the Wrap-Up slide — because the meeting happens
  // IN the app now, the summary is just "what changed today".
  const [tonightRecap, setTonightRecap] = useState<{
    events: string[];
    todoCount: number;
    todoPeople: number;
    wishComments: number;
    granted: string[];
    threads: string[];
  } | null>(null);
  const [deckRefreshing, setDeckRefreshing] = useState(false);
  // Wrap-Up "Seal tonight's notes" — composes the live app activity into a
  // meeting record on the Meetings tab (the notes write themselves).
  const [sealState, setSealState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  // HummDinger: which member's full check-in is expanded on the bubbles grid,
  // plus everyone who's had their turn this session (feeds the agenda rail's
  // who's-left-to-go list).
  // The last handful of shipped changes, shown on the News slide so the app
  // update note doesn't rely on Nat remembering what we did.
  const recentAppNews = useMemo(() => getAppNews(6), []);

  const [expandedHummdingerId, setExpandedHummdingerId] = useState<string | null>(null);
  const [hummdingerVisited, setHummdingerVisited] = useState<Set<string>>(new Set());

  // Live meeting notes typed into an expanded HummDinger card. "@name" routes
  // the note onto that member's to-do list; no @ = the expanded member's list.
  const [liveNoteDraft, setLiveNoteDraft] = useState('');
  const [liveNoteCursor, setLiveNoteCursor] = useState(0);
  const [liveNoteSaving, setLiveNoteSaving] = useState(false);
  const [liveNoteConfirmation, setLiveNoteConfirmation] = useState<string | null>(null);
  // Which HD the note is about. Meetings wander: someone's card is open and the
  // room starts talking about a thing that ISN'T their headline HD. We used to
  // staple every jot to the spotlight wish anyway, which sent the to-do to an
  // unrelated wish and commented there ("Sex therapy workshop" landed on
  // Charlee's dog-door HD — Nat 2026-07-26). null = not about an HD at all.
  const [liveNoteWishId, setLiveNoteWishId] = useState<string | null>(null);
  // Everything jotted this session stays visible on the card it was taken on,
  // with an ✕ that pulls it back off every list it landed on (oops insurance).
  const [liveNotesTaken, setLiveNotesTaken] = useState<
    { id: string; aboutId: string; text: string; assignees: string; actionItemIds: string[] }[]
  >([]);

  const handleUndoLiveNote = async (noteId: string) => {
    const note = liveNotesTaken.find((candidate) => candidate.id === noteId);
    if (!note) return;
    setLiveNotesTaken((notes) => notes.filter((candidate) => candidate.id !== noteId));
    if (note.actionItemIds.length > 0) {
      const { error } = await (supabase as any)
        .from('action_items')
        .delete()
        .in('id', note.actionItemIds);
      if (error) {
        console.error('Live note undo failed:', error);
        Alert.alert('Hmm', "Couldn't remove that one — it may need archiving from the to-do list.");
      }
    }
  };

  // Gentle timekeeper: a clock pill with time-'til-hard-out (default 8pm,
  // tap to change) and a soft per-remaining-slide pace hint — enough to say
  // "peep the time!" without anyone feeling on the clock.
  const [hardOutTime, setHardOutTime] = useState('20:00');
  const [hardOutDraft, setHardOutDraft] = useState('');
  // Evening meetings: a bare "7:45" means PM unless someone says otherwise.
  const [hardOutMeridiem, setHardOutMeridiem] = useState<'AM' | 'PM'>('PM');
  const [showHardOutEditor, setShowHardOutEditor] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setClockNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // Each month's HIVE Help focus lives in that month's calendar header —
  // type it there and the "{Month} HIVE Helpers — {focus}" board thread is
  // created automatically.
  const [monthFocusDrafts, setMonthFocusDrafts] = useState<Record<string, string>>({});
  const [monthFocusSaving, setMonthFocusSaving] = useState<string | null>(null);

  // Plan mode: the top cards pick what a calendar tap schedules — a hang
  // (quick pencil-in) or a full meeting (the same scheduler as the Meetings
  // page, Meet link and all). The Help card expands instead of scheduling.
  const [planMode, setPlanMode] = useState<'hang' | 'meeting'>('hang');
  const [expandedPlanCard, setExpandedPlanCard] = useState<'hang' | 'help' | null>(null);
  // A hang idea "armed" from the What-should-we-do pills: the next calendar
  // day you tap opens the quick-add already titled with it.
  const [armedHangIdea, setArmedHangIdea] = useState<string | null>(null);
  const [meetingSchedulerDate, setMeetingSchedulerDate] = useState<string | null>(null);

  // Month pager for the Meet Ups calendars — mini arrows page the two-month
  // window without leaving the slide (the big edge arrows change slides).
  const [monthOffset, setMonthOffset] = useState(0);

  // Quick-add: tap a calendar day on Plan the Meet Ups to pencil in a hang.
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddTime, setQuickAddTime] = useState('');
  const [quickAddAudience, setQuickAddAudience] = useState<EventAudience>('members');
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const loadDeckData = useCallback(async () => {
    if (!communityId) return;

    const today = getLocalIsoDate(new Date());
    const horizon = new Date();
    // Wide enough that the month pager has real data several months out.
    horizon.setDate(horizon.getDate() + 190);
    // "Since last meeting" means the ACTUAL last meeting, not a fixed 35 days.
    const sinceLastMeeting = await getCycleStart(communityId, today);
    const sinceIso = sinceLastMeeting.toISOString();

    await Promise.all([
      // Admin-editable slide notes
      (async () => {
        const { data } = (await supabase
          .from('communities')
          .select('meeting_helper_notes')
          .eq('id', communityId)
          .single()) as { data: { meeting_helper_notes: MeetingHelperNotes | null } | null };
        setNotes(data?.meeting_helper_notes ?? {});
      })().catch((error) => console.warn('Could not load meeting notes', error)),

      // Meet Ups calendar: birthdays + events (incl. ongoing multi-day
      // stretches) between now and the meeting after next (~75-day horizon).
      (async () => {
        const { data } = await supabase
          .from('events')
          .select('id, title, event_date, end_date, event_time, event_type')
          .eq('community_id', communityId)
          .or(`event_date.gte.${today},end_date.gte.${today}`)
          .lte('event_date', getLocalIsoDate(horizon))
          .or('status.is.null,status.eq.scheduled')
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true });
        setEvents((data ?? []) as DeckEvent[]);
      })().catch((error) => console.warn('Could not load events', error)),

      // Treasurer: Honey Pot balance
      (async () => {
        const ledger = await fetchHoneyPotLedger(communityId);
        setHoneyPotBalance(ledger.balance);
      })().catch((error) => console.warn('Could not load Honey Pot', error)),

      // Meet Ups: freshest ideas from the hang board
      (async () => {
        const { data: categories } = await supabase
          .from('board_categories')
          .select('id, name, status')
          .eq('community_id', communityId)
          .ilike('name', '%hang%');
        const hangBoard = ((categories ?? []) as { id: string; status?: string | null }[])
          .find((row) => !row.status || row.status === 'active');
        if (!hangBoard) {
          setHangIdeas([]);
          return;
        }
        const { data: posts } = await supabase
          .from('board_posts')
          .select('id, title')
          .eq('category_id', hangBoard.id)
          .order('created_at', { ascending: false })
          .limit(3);
        setHangIdeas((posts ?? []) as HangIdea[]);
      })().catch((error) => console.warn('Could not load hang ideas', error)),

      // Member HDs: everyone's active public wishes
      (async () => {
        const { data } = await (supabase as any)
          .from('wishes')
          .select('id, title, description, status, is_active, is_spotlight, user_id, user:profiles!user_id(id, name)')
          .eq('community_id', communityId)
          .eq('status', 'public')
          // Newest first, so a member who never starred a wish still leads with
          // their most recent one.
          .order('created_at', { ascending: false });
        const rows = ((data ?? []) as any[])
          .filter((wish) => wish.is_active !== false)
          .map((wish) => ({
            id: wish.id as string,
            title: (wish.title ?? null) as string | null,
            description: (wish.description ?? '') as string,
            user_id: wish.user_id as string,
            memberName: (wish.user?.name ?? 'Someone') as string,
            status: (wish.status ?? null) as string | null,
            is_active: (wish.is_active ?? null) as boolean | null,
            is_spotlight: (wish.is_spotlight ?? false) as boolean,
          }))
          .sort((a, b) => a.memberName.localeCompare(b.memberName));
        setWishes(rows);
      })().catch((error) => console.warn('Could not load wishes', error)),

      // Kudos: wishes granted since the last meeting (~35 days), with granters
      (async () => {
        const { data } = await (supabase as any)
          .from('wishes')
          .select('id, title, description, user_id, fulfilled_at, granters:wish_granters(granter_id, granter:profiles!granter_id(name))')
          .eq('community_id', communityId)
          .eq('status', 'fulfilled')
          .not('fulfilled_at', 'is', null)
          .gte('fulfilled_at', sinceIso)
          .order('fulfilled_at', { ascending: false })
          .limit(10);
        const rows = ((data ?? []) as any[]).map((wish) => ({
          id: wish.id as string,
          title: (wish.title ?? null) as string | null,
          description: (wish.description ?? '') as string,
          user_id: wish.user_id as string,
          granterNames: ((wish.granters ?? []) as any[])
            .map((granter) => (granter.granter?.name ? getFirstName(granter.granter.name) : null))
            .filter((name: string | null): name is string => !!name),
        }));
        setGrantedWishes(rows);
      })().catch((error) => console.warn('Could not load granted wishes', error)),

      // Wrap-Up: everything that changed in the app since this morning —
      // the meeting's real-time edits ARE the meeting notes.
      (async () => {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const sinceToday = dayStart.toISOString();
        const [eventsRes, todosRes, commentsRes, grantedRes, threadsRes] = await Promise.all([
          supabase.from('events').select('title').eq('community_id', communityId).gte('created_at', sinceToday),
          supabase.from('action_items').select('assigned_to').eq('community_id', communityId).gte('created_at', sinceToday),
          (supabase as any).from('wish_comments').select('id').eq('community_id', communityId).gte('created_at', sinceToday),
          (supabase as any).from('wishes').select('title, description').eq('community_id', communityId).eq('status', 'fulfilled').gte('fulfilled_at', sinceToday),
          (supabase as any).from('board_posts').select('title').eq('community_id', communityId).gte('created_at', sinceToday),
        ]);
        const todoRows = (todosRes.data ?? []) as { assigned_to: string | null }[];
        setTonightRecap({
          events: ((eventsRes.data ?? []) as { title: string }[]).map((row) => row.title),
          todoCount: todoRows.length,
          todoPeople: new Set(todoRows.map((row) => row.assigned_to).filter(Boolean)).size,
          wishComments: ((commentsRes.data ?? []) as unknown[]).length,
          granted: ((grantedRes.data ?? []) as { title: string | null; description: string }[]).map(
            (row) => (row.title ?? row.description).slice(0, 60)
          ),
          threads: ((threadsRes.data ?? []) as { title: string | null }[]).map((row) => row.title ?? '').filter(Boolean),
        });
      })().catch((error) => console.warn('Could not load tonight recap', error)),

      // The cycle's hangs — meeting to meeting, NOT "up to today". The deck is
      // shown ON meeting night, by which point a hang scheduled for last week
      // has happened; capping at today meant a cycle with hangs still ahead of
      // it read "no hangs last cycle — blank scoreboard" (Nat 2026-07-25).
      // Same window the tune-up's rating cards use, so the two agree.
      (async () => {
        const { data: nextMeetingRows } = await supabase
          .from('events')
          .select('event_date')
          .eq('community_id', communityId)
          .eq('event_type', 'meeting')
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(1);
        const cycleEnd = new Date();
        cycleEnd.setDate(cycleEnd.getDate() + 35);
        const until = (nextMeetingRows?.[0] as { event_date?: string } | undefined)?.event_date
          ?? getLocalIsoDate(cycleEnd);

        const { data } = await supabase
          .from('events')
          .select('id, title, event_date, end_date, event_type')
          .eq('community_id', communityId)
          .gte('event_date', getLocalIsoDate(sinceLastMeeting))
          .lte('event_date', until)
          .neq('event_type', 'meeting')
          .neq('event_type', 'birthday')
          .order('event_date', { ascending: true });
        const hangs = ((data ?? []) as DeckEvent[]).filter(
          (event) => !(event.end_date || /\b(out of town|away|trip|travel|galavant)/i.test(event.title))
        );
        setPastHangs(hangs);
      })().catch((error) => console.warn('Could not load past hangs', error)),

      // HummDinger assists: to-dos completed since ~last meeting, with names,
      // so help given and received is on-screen during each member's HD moment
      // (the "we filmed Charlee's aerial straps act!" that June-vs-July brains
      // forget by meeting night).
      (async () => {
        const { data } = await (supabase as any)
          .from('action_items')
          .select('id, description, completed_at, assigned_to, related_user_id, assignee:profiles!assigned_to(name)')
          .eq('community_id', communityId)
          .eq('completed', true)
          // Archiving a to-do is how you say "this doesn't belong on my list" —
          // it shouldn't then reappear on the deck as something you checked off
          // (Nat 2026-07-24).
          .is('archived_at', null)
          .gte('completed_at', sinceIso)
          .order('completed_at', { ascending: false })
          .limit(60);
        setCompletedAssists(((data ?? []) as any[]).map((row) => ({
          id: row.id as string,
          description: row.description as string,
          assignedTo: (row.assigned_to ?? null) as string | null,
          relatedUserId: (row.related_user_id ?? null) as string | null,
          assigneeName: (row.assignee?.name ?? 'Someone') as string,
        })));
      })().catch((error) => console.warn('Could not load assists', error)),

      // Live notes jotted on the HummDinger spotlight. These used to live in
      // component state only, so the list under each member vanished on reload
      // even though the to-dos themselves were saved (Nat 2026-07-24: "I want
      // those to stay there"). One jot fans out to one action_item per
      // assignee, so regroup by who-it's-about + the text with the routing
      // suffix stripped, which reconstructs the note exactly as it was typed.
      (async () => {
        const { data } = await (supabase as any)
          .from('action_items')
          .select('id, description, assigned_to, related_user_id, created_at, assignee:profiles!assigned_to(name)')
          .eq('community_id', communityId)
          .not('related_user_id', 'is', null)
          .is('archived_at', null)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: true })
          .limit(200);

        const grouped = new Map<string, { id: string; aboutId: string; text: string; names: string[]; actionItemIds: string[] }>();
        ((data ?? []) as any[]).forEach((row) => {
          const aboutId = row.related_user_id as string;
          const text = parseActionItemDescription(row.description as string).text;
          const key = `${aboutId}::${text}`;
          const entry = grouped.get(key) ?? { id: key, aboutId, text, names: [], actionItemIds: [] };
          entry.names.push(getFirstName((row.assignee?.name ?? 'Someone') as string));
          entry.actionItemIds.push(row.id as string);
          grouped.set(key, entry);
        });

        setLiveNotesTaken(Array.from(grouped.values()).map((entry) => ({
          id: entry.id,
          aboutId: entry.aboutId,
          text: entry.text,
          assignees: entry.names.length > 3 ? `everyone (${entry.names.length})` : entry.names.join(' & '),
          actionItemIds: entry.actionItemIds,
        })));
      })().catch((error) => console.warn('Could not load live notes', error)),

      // Kudos: recent 15-min helper posts from the helper log board
      (async () => {
        const { data: categories } = await supabase
          .from('board_categories')
          .select('id, name, status')
          .eq('community_id', communityId)
          .or('topic_kind.eq.helper_log,name.ilike.%HIVE Helpers%');
        const helperBoard = ((categories ?? []) as { id: string; status?: string | null }[])
          .find((row) => !row.status || row.status === 'active');
        if (!helperBoard) {
          setHelperPosts([]);
          return;
        }
        const { data: posts } = await supabase
          .from('board_posts')
          .select('id, title')
          .eq('category_id', helperBoard.id)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(6);
        setHelperPosts((posts ?? []) as HangIdea[]);
      })().catch((error) => console.warn('Could not load helper posts', error)),
    ]);
  }, [communityId]);

  useEffect(() => {
    void loadDeckData();
  }, [loadDeckData]);

  const refreshDeck = useCallback(async () => {
    if (deckRefreshing) return;
    setDeckRefreshing(true);
    try {
      await Promise.all([loadDeckData(), refreshArrivals()]);
    } finally {
      setDeckRefreshing(false);
    }
  }, [deckRefreshing, loadDeckData, refreshArrivals]);

  // Go-around order: Nat leads by example (her call, 2026-07-24 — she used to
  // sit wherever the sort put her), then the absentees right after (the torch
  // gets carried for whoever can't speak for themselves — everyone stays on
  // the HD board even when they miss), then present checked-in members in
  // submit order (a different voice order each month), then the rest who
  // haven't checked in.
  const memberOrder = useMemo(() => {
    const leader = members.find((member) => getFirstName(member.name).toLowerCase() === 'nat');
    const others = members.filter((member) => member.id !== leader?.id);
    const bySubmitTime = (a: ArrivalBoardMember, b: ArrivalBoardMember) => {
      const aTime = responsesByUser.get(a.id)?.submitted_at ?? '';
      const bTime = responsesByUser.get(b.id)?.submitted_at ?? '';
      return aTime.localeCompare(bTime);
    };
    const checkedIn = others.filter((member) => responsesByUser.has(member.id)).sort(bySubmitTime);
    const absent = checkedIn.filter((member) => getAttendance(responsesByUser.get(member.id)) === 'missing');
    const present = checkedIn.filter((member) => getAttendance(responsesByUser.get(member.id)) !== 'missing');
    const notYet = others.filter((member) => !responsesByUser.has(member.id));
    return [...(leader ? [leader] : []), ...absent, ...present, ...notYet];
  }, [members, responsesByUser]);

  const wishesByUserId = useMemo(() => {
    const grouped = new Map<string, DeckWish[]>();
    wishes.forEach((wish) => {
      const list = grouped.get(wish.user_id) ?? [];
      list.push(wish);
      grouped.set(wish.user_id, list);
    });
    return grouped;
  }, [wishes]);

  // Opening someone's card preselects their spotlight HD — the common case, so
  // the fast path stays one keystroke. Keyed on the member, not on the wish
  // list, or a background deck refresh would throw away a pick made mid-jot.
  const liveNoteSubjectMemberRef = useRef<string | null>(null);
  useEffect(() => {
    if (!expandedHummdingerId) {
      liveNoteSubjectMemberRef.current = null;
      return;
    }
    if (liveNoteSubjectMemberRef.current === expandedHummdingerId) return;
    liveNoteSubjectMemberRef.current = expandedHummdingerId;
    const memberWishes = wishesByUserId.get(expandedHummdingerId) ?? [];
    setLiveNoteWishId((pickSpotlightWish(memberWishes) ?? memberWishes[0])?.id ?? null);
  }, [expandedHummdingerId, wishesByUserId]);

  // Pencil in a hang straight from the Plan the Meet Ups calendar — same
  // create path as the tune-up and Home (the create-event edge function).
  const handleQuickAddEvent = async () => {
    if (!quickAddDate || !communityId || quickAddSaving) return;
    if (!quickAddTitle.trim()) {
      setQuickAddError('Give it a name — "Pool hang" works great.');
      return;
    }
    const normalizedTime = normalizeEventTimeInput(quickAddTime);
    if (quickAddTime.trim() && !normalizedTime.time) {
      setQuickAddError('For time, try something like 2:30 PM.');
      return;
    }

    setQuickAddSaving(true);
    setQuickAddError(null);
    try {
      const newEvent: Record<string, string | null> = {
        title: quickAddTitle.trim(),
        event_date: quickAddDate,
        community_id: communityId,
      };
      if (normalizedTime.time) newEvent.event_time = normalizedTime.time;
      if (normalizedTime.note) newEvent.description = `Time note: ${normalizedTime.note}`;
      newEvent.visibility = quickAddAudience;

      const { error } = await supabase.functions.invoke('create-event', { body: newEvent });
      if (error) throw error;

      setQuickAddDate(null);
      setQuickAddTitle('');
      setQuickAddTime('');
      setQuickAddAudience('members');
      // The idea has been claimed — disarm so the next day you tap starts fresh.
      setArmedHangIdea(null);
      await loadDeckData();
    } catch (error: any) {
      setQuickAddError(error?.message || 'Could not save the event — please try again.');
    } finally {
      setQuickAddSaving(false);
    }
  };

  // Same wiring as the Meetings page's Schedule button.
  const handleScheduleMeetingFromDeck = async (data: {
    title: string;
    description: string;
    date: string;
    time: string;
    duration: number;
    attendeeIds: string[];
    timezone: string;
    location?: string;
  }) => {
    if (!communityId || !session?.access_token) {
      throw new Error('Not authenticated');
    }
    const response = await supabase.functions.invoke('schedule-meeting', {
      body: { ...data, communityId },
    });
    if (response.error) {
      let errorMsg = 'Failed to schedule meeting';
      try {
        const ctx = (response.error as any).context;
        if (ctx instanceof Response) {
          const body = await ctx.json();
          errorMsg = body?.error || errorMsg;
        }
      } catch { /* fall through */ }
      if (errorMsg === 'Failed to schedule meeting') {
        errorMsg = response.error.message || errorMsg;
      }
      throw new Error(errorMsg);
    }
    await loadDeckData();
  };

  const handlePostHelpFocus = async (monthLabel: string) => {
    const focus = (monthFocusDrafts[monthLabel] ?? '').trim();
    if (!focus || !communityId || !profile || monthFocusSaving) return;
    setMonthFocusSaving(monthLabel);
    try {
      const { data: categories } = await supabase
        .from('board_categories')
        .select('id, name, status')
        .eq('community_id', communityId)
        .or('topic_kind.eq.helper_log,name.ilike.%HIVE Helpers%');
      const helperBoard = ((categories ?? []) as { id: string; status?: string | null }[])
        .find((row) => !row.status || row.status === 'active');
      if (!helperBoard) throw new Error('No HIVE Help board found');

      const { error } = await (supabase as any).from('board_posts').insert({
        community_id: communityId,
        category_id: helperBoard.id,
        author_id: profile.id,
        title: `${monthLabel} HIVE Help — ${focus}`,
        content: `${monthLabel}'s HIVE Help focus: ${focus}\n\n(Decided together at the meeting — log your helps in this thread!)`,
      });
      if (error) throw error;

      // The focus lands on everyone's to-do list too (Nat: the donation
      // reminder should populate for the whole HIVE, not just the check-in).
      if (members.length > 0) {
        const monthMeeting = events.find(
          (event) => event.event_type === 'meeting'
            && new Date(`${event.event_date}T12:00:00`).toLocaleString('en-US', { month: 'long' }) === monthLabel
        );

        // One live focus at a time. Every earlier focus's still-open to-do
        // gets retired now, or they stack up on people's lists forever —
        // July's "Pay it behind" was still sitting there in August (Nat
        // 2026-07-24: "this is old news"). Finished ones keep their check.
        const { error: retireError } = await (supabase as any)
          .from('action_items')
          .update({ archived_at: new Date().toISOString() })
          .eq('community_id', communityId)
          .ilike('description', 'HIVE Help:%')
          .eq('completed', false)
          .is('archived_at', null);
        if (retireError) console.warn('Could not retire the previous focus to-dos:', retireError);

        const { error: fanError } = await (supabase as any).from('action_items').insert(
          members.map((member) => ({
            community_id: communityId,
            assigned_to: member.id,
            // Not every focus is a thing you carry in: "pay it behind" happens
            // in a drive-through, "pick up trash" happens on a walk. The nudge
            // has to fit an ACT, not just a donation (Nat 2026-07-24).
            description: `HIVE Help: ${focus} — however you pull it off, log it by the ${monthLabel} meeting`,
            due_date: monthMeeting?.event_date ?? null,
          }))
        );
        if (fanError) console.warn('Focus to-do fan-out skipped:', fanError);
      }

      setMonthFocusDrafts((drafts) => ({ ...drafts, [monthLabel]: '' }));
      await loadDeckData();
    } catch (error) {
      console.error('Could not post HIVE Help focus:', error);
      Alert.alert('Hmm', 'Could not post the new focus — try again, or use the Boards tab.');
    } finally {
      setMonthFocusSaving(null);
    }
  };

  // Live meeting notes from the HummDinger spotlight. Mentions use the same
  // rules as the boards — "@charlee" targets her list, "@all"/"@hive" fans
  // out to everyone, no @ lands on whoever's card is open.
  const handleSaveLiveNote = async (
    aboutMember: { id: string; name: string },
    aboutWishId?: string | null
  ) => {
    const text = liveNoteDraft.trim();
    if (!text || !communityId || liveNoteSaving) return;

    // "@all" from someone's card = the note is about helping THEM, so it
    // lands on everyone else's list — not the subject's own.
    const targets = hasBroadcastMention(text)
      ? members.filter((member) => member.id !== aboutMember.id)
      : getMentionedMembers(text, members);
    const assignees = targets.length > 0
      ? members.filter((member) => targets.some((target) => target.id === member.id))
      : members.filter((member) => member.id === aboutMember.id);
    if (assignees.length === 0) return;

    setLiveNoteSaving(true);
    try {
      const { data: inserted, error } = await (supabase as any)
        .from('action_items')
        .insert(
          assignees.map((member) => ({
            // "re: X's HummDinger" is a claim, so only make it when the note is
            // actually pinned to one of X's HDs. Otherwise it's still about X —
            // just not about a wish — and the suffix says only that.
            description:
              member.id === aboutMember.id
                ? text
                : aboutWishId
                  ? `${text} (re: ${getFirstName(aboutMember.name)}'s HummDinger)`
                  : `${text} (re: ${getFirstName(aboutMember.name)})`,
            assigned_to: member.id,
            community_id: communityId,
            related_user_id: aboutMember.id,
            // Deep link: tapping the to-do soft-opens the wish it's about —
            // the visual thread from someone's list back to the HD it serves.
            related_wish_id: aboutWishId ?? null,
          }))
        )
        .select('id');
      if (error) throw error;
      // The note is really a comment on the wish — leave it there too, so
      // tapping any of the to-dos lands on the wish with the note in context
      // and people can reply right on it.
      if (aboutWishId && profile) {
        // Jots are written live during the meeting, so "the meeting" is
        // whichever month it is right now (not the survey period, which
        // already points at the NEXT meeting).
        const meetingMonth = new Date().toLocaleString('en-US', { month: 'long' });
        const { error: commentError } = await (supabase as any).from('wish_comments').insert({
          wish_id: aboutWishId,
          user_id: profile.id,
          community_id: communityId,
          content: `📝 From the ${meetingMonth} meeting: ${text}`,
        });
        if (commentError) console.warn('Wish comment skipped (non-blocking):', commentError);
      }

      const assigneesLabel = assignees.length > 3
        ? `everyone (${assignees.length})`
        : assignees.map((member) => getFirstName(member.name)).join(' & ');
      setLiveNoteConfirmation(`On ${assigneesLabel}'s list ✓`);
      // Same key the reload builds, so a note doesn't double up when the deck
      // refreshes underneath you.
      const noteKey = `${aboutMember.id}::${text}`;
      setLiveNotesTaken((notes) => [
        ...notes.filter((note) => note.id !== noteKey),
        {
          id: noteKey,
          aboutId: aboutMember.id,
          text,
          assignees: assigneesLabel,
          actionItemIds: ((inserted ?? []) as { id: string }[]).map((row) => row.id),
        },
      ]);
      setLiveNoteDraft('');
    } catch (error) {
      console.error('Live note save failed:', error);
      setLiveNoteConfirmation('Could not save that note — try again.');
    } finally {
      setLiveNoteSaving(false);
    }
  };

  // ---- Editable notes (admin-only writes) ----
  const [editKey, setEditKey] = useState<EditableNoteKey | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const openNoteEditor = useCallback((key: EditableNoteKey) => {
    setEditDraft(notes[key] ?? '');
    setEditKey(key);
  }, [notes]);

  const saveNote = useCallback(async () => {
    if (!communityId || !editKey || savingNote) return;
    setSavingNote(true);
    const nextNotes: MeetingHelperNotes = { ...notes, [editKey]: editDraft.trim() };
    const { error } = await (supabase.from('communities') as any)
      .update({ meeting_helper_notes: nextNotes })
      .eq('id', communityId);
    setSavingNote(false);
    if (error) {
      console.warn('Could not save meeting note', error);
      Alert.alert('Could not save', 'Please try again in a moment.');
      return;
    }
    setNotes(nextNotes);
    setEditKey(null);
  }, [communityId, editDraft, editKey, notes, savingNote]);

  // ---- Sizing helpers ----
  const sz = useCallback((tv: number, small: number) => (isTV ? tv : small), [isTV]);
  const contentPadH = sz(150, 44);
  const contentPadTop = sz(72, 36);
  const contentPadBottom = sz(96, 72);

  const monthName = getMonthNameFromPeriod(responsePeriod);
  const periodMatch = (responsePeriod ?? '').match(/^(\d{4})-(\d{2})$/);
  const meetingYear = periodMatch ? periodMatch[1] : String(new Date().getFullYear());
  const meetingLine = formatMeetingDate(nextMeeting)
    || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const checkedInCount = members.filter((member) => responsesByUser.has(member.id)).length;

  // ---- Small presentational pieces ----
  const Kicker = useCallback(({ children }: { children: string }) => (
    <Text
      style={{
        fontFamily: 'Lato_700Bold',
        fontSize: sz(18, 12),
        letterSpacing: sz(4, 2.5),
        textTransform: 'uppercase',
        color: GOLD,
        marginBottom: sz(14, 8),
      }}
    >
      {children}
    </Text>
  ), [sz]);

  const SlideTitle = useCallback(({ children }: { children: string }) => (
    <Text
      style={{
        fontFamily: 'LibreBaskerville_700Bold',
        fontSize: sz(58, 30),
        lineHeight: sz(72, 40),
        color: CHARCOAL,
      }}
    >
      {children}
    </Text>
  ), [sz]);

  const EmptyNote = useCallback(({ children }: { children: React.ReactNode }) => (
    <Text
      style={{
        fontFamily: 'Lato_400Regular',
        fontStyle: 'italic',
        fontSize: sz(24, 15),
        lineHeight: sz(36, 23),
        color: MUTED,
      }}
    >
      {children}
    </Text>
  ), [sz]);

  const EditPill = useCallback(({ noteKey }: { noteKey: EditableNoteKey }) => {
    if (!isAdmin) return null;
    return (
      <EditButton
        onPress={() => openNoteEditor(noteKey)}
        size={sz(34, 26)}
        accessibilityLabel={`Edit ${EDIT_SLIDE_META[noteKey].title}`}
      />
    );
  }, [isAdmin, openNoteEditor, sz]);

  const NoteBody = useCallback(({ noteKey, emptyText }: { noteKey: EditableNoteKey; emptyText: string }) => {
    const value = (notes[noteKey] ?? '').trim();
    if (!value) return <EmptyNote>{emptyText}</EmptyNote>;
    return (
      <Text
        style={{
          fontFamily: 'Lato_400Regular',
          fontSize: sz(20, 14),
          lineHeight: sz(31, 21),
          color: 'rgba(49,49,48,0.87)',
        }}
      >
        {value}
      </Text>
    );
  }, [EmptyNote, notes, sz]);

  const handleSealMeeting = async () => {
    if (!communityId || sealState === 'saving' || sealState === 'done') return;
    setSealState('saving');
    try {
      const { data, error } = await supabase.functions.invoke('seal-meeting', {
        body: { communityId, date: getLocalIsoDate(new Date()) },
      });
      if (error) throw error;
      if (!data?.sealed) throw new Error(data?.reason ?? 'Nothing to seal yet');
      setSealState('done');
    } catch (error) {
      console.warn('Seal meeting failed', error);
      setSealState('error');
    }
  };

  // ---- Slides ----
  // Welcome + Room merged (Lucas: this is the slide up as people arrive, and
  // the date/time header doubles as the "oops, wrong day!" check).
  const roomColumns = isTV ? 5 : width >= 1024 ? 4 : width >= 760 ? 3 : width >= 480 ? 2 : 1;
  const renderRoom = () => (
    <View style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', marginBottom: sz(24, 14) }}>
        {/* Crest + title mirror the timekeeper clock's lockup: a big mark
            with the words tucked right underneath. */}
        <Image
          source={hiveBee}
          style={{ width: sz(300, 150), height: sz(300, 150) }}
          contentFit="contain"
        />
        <Text
          style={{
            fontFamily: 'LibreBaskerville_700Bold',
            fontSize: sz(58, 28),
            lineHeight: sz(70, 36),
            color: CHARCOAL,
            textAlign: 'center',
            marginTop: sz(-16, -8),
          }}
        >
          {monthName} {meetingYear} Meeting
        </Text>
        {meetingLine ? (
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(30, 16), color: GOLD_DEEP, marginTop: sz(10, 6), textAlign: 'center' }}>
            {meetingLine}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sz(8, 5), marginTop: sz(8, 5) }}>
          <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(23, 13), color: MUTED, textAlign: 'center' }}>
            grab a plate and check in
          </Text>
          <HiveIcon name="honeypot" size={sz(22, 13)} color={GOLD} />
        </View>
        {survey ? (
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 11), color: MUTED, marginTop: sz(10, 6) }}>
            {checkedInCount} of {members.length} checked in{lastUpdatedAt ? '  ·  live' : ''}
          </Text>
        ) : null}
      </View>
      {arrivalLoading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : !survey ? (
        <EmptyNote>
          No monthly check-in is live right now — once one opens, arrivals will glow here.
        </EmptyNote>
      ) : (
        <View>
          {(() => {
            const remote = members.filter((member) => getAttendance(responsesByUser.get(member.id)) === 'remote');
            const missing = members.filter((member) => getAttendance(responsesByUser.get(member.id)) === 'missing');
            if (remote.length === 0 && missing.length === 0) return null;
            const parts = [
              remote.length > 0
                ? `💻 Zooming in: ${remote.map((member) => getFirstName(member.name)).join(', ')} — fire up the Meet`
                : null,
              missing.length > 0
                ? `😢 Missing tonight: ${missing.map((member) => getFirstName(member.name)).join(', ')}`
                : null,
            ].filter(Boolean);
            return (
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(18, 12), color: GOLD_DEEP, marginBottom: sz(12, 8) }}>
                {parts.join('   ·   ')}
              </Text>
            );
          })()}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: sz(-8, -5) }}>
          {getCheckInOrder(members, responsesByUser).map((member) => (
            <View key={member.id} style={{ width: `${100 / roomColumns}%`, padding: sz(8, 5) }}>
              <ArrivalMemberCard
                member={member}
                response={responsesByUser.get(member.id)}
                isTV={isTV}
                compact
              />
            </View>
          ))}
        </View>
        </View>
      )}
    </View>
  );

  const renderOutline = () => (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: sz(40, 16) }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Kicker>Tonight</Kicker>
        <SlideTitle>Outline</SlideTitle>
        <View style={{ marginTop: sz(40, 22), gap: sz(20, 12) }}>
          {AGENDA.map((item, index) => (
            <View key={item.key} style={{ flexDirection: 'row', alignItems: 'baseline', gap: sz(24, 14) }}>
              <Text
                style={{
                  fontFamily: 'LibreBaskerville_700Bold',
                  fontSize: sz(30, 17),
                  color: GOLD,
                  width: sz(48, 28),
                  textAlign: 'right',
                }}
              >
                {index + 1}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(34, 19), color: CHARCOAL }}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {/* The full HIVE crest gets its giant moment here (square frame — the
          arrivals slide squished it into a rectangle). */}
      {width >= 900 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={hiveLogo}
            style={{ width: sz(520, 300), height: sz(520, 300) }}
            contentFit="contain"
          />
        </View>
      ) : null}
    </View>
  );

  // Slim by design (Lucas): the news + app updates live here; hang and help
  // recaps moved to Plan the Meet Ups where the scheduling happens, and
  // wishes granted are each member's own HummDinger story.
  const renderNews = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: sz(30, 18) }}>
        <View>
          <Kicker>Tonight · house business</Kicker>
          <SlideTitle>News from Nat</SlideTitle>
        </View>
      </View>
      {/* Home-page vibes (Lucas): tighter paper cards, quiet labels, body
          text that reads instead of shouting. */}
      <View style={{ gap: sz(14, 9), maxWidth: sz(940, 640) }}>
        <View
          style={{
            backgroundColor: '#fffdf5',
            borderWidth: 1,
            borderColor: GOLD_SOFT,
            borderRadius: sz(16, 12),
            paddingHorizontal: sz(20, 13),
            paddingVertical: sz(15, 10),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sz(8, 5) }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(13, 10), letterSpacing: 1.4, textTransform: 'uppercase', color: '#8e7a5e' }}>
              📣 The news
            </Text>
            <EditPill noteKey="news" />
          </View>
          <NoteBody
            noteKey="news"
            emptyText="Nat hasn't dropped the news yet — drumroll, please."
          />
        </View>
        <View
          style={{
            backgroundColor: '#fdf3dc',
            borderWidth: 1,
            borderColor: GOLD_SOFT,
            borderRadius: sz(16, 12),
            paddingHorizontal: sz(20, 13),
            paddingVertical: sz(15, 10),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sz(8, 5) }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(13, 10), letterSpacing: 1.4, textTransform: 'uppercase', color: '#8e7a5e' }}>
              ✨ New in the app this month
            </Text>
            <EditPill noteKey="appnews" />
          </View>
          <NoteBody
            noteKey="appnews"
            emptyText="No app news this month — smooth sailing."
          />
          {/* What actually shipped, so this doesn't depend on remembering.
              It's a prompt, not the content: whatever Nat types above is what
              reaches the deck and the newsletter, in her words. */}
          {recentAppNews.length > 0 ? (
            <View style={{ marginTop: sz(10, 7), borderTopWidth: 1, borderTopColor: GOLD_SOFT, paddingTop: sz(9, 6), gap: sz(3, 2) }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(11, 9), letterSpacing: 1.2, textTransform: 'uppercase', color: MUTED }}>
                Shipped recently — for your notes
              </Text>
              {recentAppNews.map((entry) => (
                <Text key={entry.id} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(13, 10), lineHeight: sz(19, 14), color: MUTED }}>
                  · {entry.title}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

  const renderTreasurer = () => (
    <View style={{ flex: 1 }}>
      <Kicker>Cabinet Reports</Kicker>
      <SlideTitle>Treasurer Report — Ollie</SlideTitle>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: sz(40, 20) }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(22, 13), letterSpacing: 3, textTransform: 'uppercase', color: MUTED }}>
          Honey Pot balance
        </Text>
        <Text
          style={{
            fontFamily: 'LibreBaskerville_700Bold',
            fontSize: sz(120, 54),
            lineHeight: sz(150, 70),
            color: GOLD,
            marginTop: sz(14, 8),
          }}
        >
          {honeyPotBalance === null ? '—' : formatBalance(honeyPotBalance)}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: sz(16, 10),
            marginTop: sz(44, 24),
            backgroundColor: CARD,
            borderWidth: 1,
            borderColor: GOLD_SOFT,
            borderRadius: 999,
            paddingHorizontal: sz(34, 20),
            paddingVertical: sz(16, 10),
          }}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(24, 14), color: CHARCOAL }}>
            Dues: $25 / quarter
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(24, 14), color: MUTED }}>·</Text>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(24, 14), color: GOLD_DEEP }}>
            CashApp $HiveLV
          </Text>
        </View>
      </View>
    </View>
  );

  const MEETUP_COLUMNS = [
    { key: 'meeting' as const, title: 'HIVE Meeting', blurb: 'Second Wednesday — dinner, business, and the HummDinger.' },
    { key: 'help' as const, title: 'HIVE Help', blurb: 'Fifteen-minute favors — small asks, quick wins.' },
    { key: 'hang' as const, title: 'HIVE Hang', blurb: 'Casual get-togethers between meetings. Anyone can host.' },
  ];

  // Plan the Meet Ups: how we gather across the top, then a classic two-month
  // calendar (this month + next, side by side on the TV) painted with what's
  // already on the HIVE calendar. Tap any upcoming day to pencil in a hang
  // right from the deck — no tab-juggling mid-meeting.
  const renderMeetups = () => {
    const todayIso = getLocalIsoDate(new Date());
    const today = new Date();
    const monthStarts = [
      new Date(today.getFullYear(), today.getMonth() + monthOffset, 1),
      new Date(today.getFullYear(), today.getMonth() + monthOffset + 1, 1),
    ];

    // Check-in voices for the expandable Hang/Help cards — the hangs answer
    // stores "Went to: …" on line one, thoughts after.
    const recapNote = (raw: string) => {
      const lines = raw.split('\n');
      return (lines[0]?.startsWith('Went to: ') ? lines.slice(1).join('\n') : raw).trim();
    };
    const voicesFor = (key: string, clean: (raw: string) => string = (raw) => raw.trim()) =>
      memberOrder
        .map((member) => ({
          id: member.id,
          name: getFirstName(member.name),
          text: clean(getTextAnswer(responsesByUser.get(member.id)?.answers ?? {}, key)),
        }))
        .filter((voice) => !!voice.text);
    // The focus answer keeps its choice on line one, thoughts after — so the
    // deck can report how many did it and how it landed, not just quote
    // paragraphs (Nat 2026-07-25).
    const focusNote = (raw: string) => parseFocusAnswer(raw).note.trim();
    const helpVoices = voicesFor('q_hive_help_recap', focusNote);
    const hangVoices = voicesFor('q_hangs_recap', recapNote);

    const focusTally = members.reduce(
      (tally, member) => {
        const raw = getTextAnswer(responsesByUser.get(member.id)?.answers ?? {}, 'q_hive_help_recap');
        if (!raw.trim()) return tally;
        if (focusAnswerDidIt(raw)) tally.did += 1;
        const score = focusAnswerScore(raw);
        if (score) tally.ratings.push(score);
        const { choice, instead } = parseFocusAnswer(raw);
        if (choice === 'I did something else' && instead) tally.instead.push(`${getFirstName(member.name)}: ${instead}`);
        return tally;
      },
      { did: 0, ratings: [] as number[], instead: [] as string[] }
    );
    const focusAvg = focusTally.ratings.length > 0
      ? Math.round((focusTally.ratings.reduce((sum, value) => sum + value, 0) / focusTally.ratings.length) * 10) / 10
      : null;

    // Survey says! Turnout + average enjoyment per hang, from the check-ins'
    // "I went 🙌" taps and 🍯 ratings ("Went to: Taste (4/5) · Drag Brunch").
    const hangPoll = pastHangs.map((hang) => {
      let went = 0;
      const ratings: number[] = [];
      members.forEach((member) => {
        const raw = getTextAnswer(responsesByUser.get(member.id)?.answers ?? {}, 'q_hangs_recap');
        const firstLine = raw.split('\n')[0] ?? '';
        if (!firstLine.startsWith('Went to: ')) return;
        const entry = firstLine
          .slice('Went to: '.length)
          .split(' · ')
          .find((candidate) => candidate.trim().startsWith(hang.title));
        if (!entry) return;
        went += 1;
        const rating = entry.match(/\((\d)\/5\)\s*$/)?.[1];
        if (rating) ratings.push(Number(rating));
      });
      const avgRating = ratings.length > 0
        ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10
        : null;
      return { ...hang, went, avgRating };
    });


    const eventsOnDay = (dayIso: string) =>
      events.filter((event) => event.event_date <= dayIso && dayIso <= (event.end_date || event.event_date));

    const isAwayEvent = (event: DeckEvent) =>
      event.event_type !== 'meeting' &&
      event.event_type !== 'birthday' &&
      (!!event.end_date || /\b(out of town|away|trip|travel|galavant)/i.test(event.title));

    const eventEmoji = (event: DeckEvent) => {
      if (event.event_type === 'meeting') return '🐝';
      if (event.event_type === 'birthday') return '🎂';
      if (isAwayEvent(event)) return '✈️';
      return '📌';
    };

    // Away events are titled "<FirstName> out of town" — match that first word
    // back to the roster so the calendar can show a face instead of the title.
    const memberForAwayEvent = (event: DeckEvent) => {
      const firstWord = event.title.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
      return members.find((member) => getFirstName(member.name).toLowerCase() === firstWord) ?? null;
    };

    const renderMonth = (monthStart: Date) => {
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      const gridStart = new Date(monthStart);
      gridStart.setDate(gridStart.getDate() - gridStart.getDay());
      const gridEnd = new Date(monthEnd);
      gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

      const days: Date[] = [];
      for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
        days.push(new Date(cursor));
      }
      const weeks: Date[][] = [];
      for (let index = 0; index < days.length; index += 7) {
        weeks.push(days.slice(index, index + 7));
      }

      const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long' });
      // This month's HIVE Help focus lives right in the calendar header —
      // read from the "{Month} HIVE Helpers — {focus}" board thread, or type
      // it here and the thread is created automatically.
      // Canonical: "{Month} HIVE Help — {Focus}"; legacy "HIVE Helpers" still parses.
      const focusPattern = new RegExp(`^${monthLabel}\\s+HIVE Help(?:ers)?\\s*[—–-]+\\s*(.+)$`, 'i');
      const existingFocus = helperPosts
        .map((post) => (post.title ?? '').trim().match(focusPattern)?.[1])
        .find((match) => !!match);

      return (
        <View key={monthStart.toISOString()} style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(26, 16), color: CHARCOAL, marginBottom: sz(8, 5) }}>
            {monthLabel}
          </Text>
          <View
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(18, 14),
              padding: sz(10, 6),
            }}
          >
            {/* The month's HIVE Help focus lives top-center of the calendar —
                type it here and the board thread is created automatically. */}
            {existingFocus ? (
              <Text
                numberOfLines={1}
                style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(19, 12), color: GOLD_DEEP, textAlign: 'center', marginBottom: sz(8, 5) }}
              >
                Help Focus: {existingFocus.replace(/!+$/, '')}
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(6, 4), justifyContent: 'center', marginBottom: sz(8, 5) }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(18, 11), color: GOLD_DEEP }}>
                  Help Focus:
                </Text>
                <TextInput
                  value={monthFocusDrafts[monthLabel] ?? ''}
                  onChangeText={(value) => setMonthFocusDrafts((drafts) => ({ ...drafts, [monthLabel]: value }))}
                  onSubmitEditing={() => handlePostHelpFocus(monthLabel)}
                  placeholder={monthFocusSaving === monthLabel ? 'posting…' : 'type it, press enter'}
                  placeholderTextColor="rgba(154,128,96,0.5)"
                  style={{
                    minWidth: sz(180, 120),
                    borderBottomWidth: 1,
                    borderColor: GOLD_SOFT,
                    paddingVertical: sz(3, 2),
                    fontFamily: 'Lato_400Regular',
                    fontStyle: 'italic',
                    fontSize: sz(18, 11),
                    color: GOLD_DEEP,
                  }}
                />
              </View>
            )}
            <View style={{ flexDirection: 'row', marginBottom: sz(6, 4) }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayLabel) => (
                <Text
                  key={dayLabel}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontFamily: 'Lato_700Bold',
                    fontSize: sz(13, 9),
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    color: MUTED,
                  }}
                >
                  {dayLabel}
                </Text>
              ))}
            </View>
            {weeks.map((week) => (
              <View key={week[0].toISOString()} style={{ flexDirection: 'row' }}>
                {week.map((day) => {
                  const dayIso = getLocalIsoDate(day);
                  const inMonth = day.getMonth() === monthStart.getMonth();
                  if (!inMonth) {
                    return <View key={dayIso} style={{ flex: 1, margin: sz(2, 1) }} />;
                  }
                  const isPast = dayIso < todayIso;
                  const dayEvents = eventsOnDay(dayIso);
                  const awayEvents = dayEvents.filter(isAwayEvent);
                  const plannedEvents = dayEvents.filter((event) => !isAwayEvent(event));
                  const isMeetingDay = plannedEvents.some((event) => event.event_type === 'meeting');
                  // Away stretches don't claim the day — someone being out of
                  // town still leaves the rest of the HIVE free to hang.
                  const isBusy = plannedEvents.length > 0;
                  const isToday = dayIso === todayIso;
                  const primaryEvent = plannedEvents[0];
                  // ✈️ marks the day a trip starts; → carries through the rest
                  // of the stretch so a long trip reads as one thin line.
                  const awayDeparts = awayEvents.some((event) => event.event_date === dayIso);
                  const shownAway = awayEvents.slice(0, 3);
                  const bubbleSize = sz(20, 13);
                  return (
                    <Pressable
                      key={dayIso}
                      disabled={isPast}
                      onPress={() => {
                        if (planMode === 'meeting') {
                          setMeetingSchedulerDate(dayIso);
                          return;
                        }
                        setQuickAddDate(dayIso);
                        // An armed idea rides in as the title; you fill in the
                        // time and place. Nothing armed = blank, as before.
                        setQuickAddTitle(armedHangIdea ?? '');
                        setQuickAddTime('');
                        setQuickAddError(null);
                      }}
                      style={{
                        flex: 1,
                        minHeight: sz(56, 40),
                        margin: sz(2, 1),
                        borderRadius: sz(10, 7),
                        borderWidth: isMeetingDay || isToday ? 2 : 1,
                        borderColor: isMeetingDay || isToday ? GOLD : isBusy ? GOLD_SOFT : 'rgba(222,193,129,0.24)',
                        backgroundColor: isBusy ? 'rgba(222,193,129,0.16)' : PAPER,
                        paddingHorizontal: sz(6, 3),
                        paddingVertical: sz(4, 2),
                        opacity: isPast ? 0.4 : 1,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: isToday || isMeetingDay ? 'Lato_700Bold' : 'Lato_400Regular',
                          fontSize: sz(15, 10),
                          color: isToday || isMeetingDay ? GOLD_DEEP : CHARCOAL,
                        }}
                      >
                        {day.getDate()}
                      </Text>
                      {primaryEvent ? (
                        <Text numberOfLines={isTV ? 2 : 1} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(12, 8), lineHeight: sz(16, 11), color: GOLD_DEEP, marginTop: sz(2, 1) }}>
                          {eventEmoji(primaryEvent)}{isTV ? ` ${primaryEvent.title}` : ''}
                          {plannedEvents.length > 1 ? `  +${plannedEvents.length - 1}` : ''}
                        </Text>
                      ) : null}
                      {shownAway.length > 0 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: sz(2, 1) }}>
                          {shownAway.map((event, index) => {
                            const member = memberForAwayEvent(event);
                            return (
                              <View
                                key={event.id}
                                style={{
                                  marginLeft: index === 0 ? 0 : -bubbleSize * 0.35,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: PAPER,
                                }}
                              >
                                <Avatar
                                  name={member?.name ?? event.title}
                                  url={member?.avatar_url}
                                  size={bubbleSize}
                                />
                              </View>
                            );
                          })}
                          {awayEvents.length > shownAway.length ? (
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(11, 8), color: MUTED, marginLeft: sz(2, 1) }}>
                              +{awayEvents.length - shownAway.length}
                            </Text>
                          ) : null}
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(11, 8), color: MUTED, marginLeft: sz(2, 1) }}>
                            {awayDeparts ? '✈️' : '→'}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      );
    };

    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: sz(26, 16) }}>
          <View>
            <Kicker>Ways we gather · on the calendar</Kicker>
            <SlideTitle>Plan the Meet Ups</SlideTitle>
          </View>
          <EditPill noteKey="meetups" />
        </View>

        {/* Top: the three ways we gather — now the controls. Meeting/Hang pick
            what a calendar tap schedules; Help expands with the focus + the
            check-in voices. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(16, 8) }}>
          {MEETUP_COLUMNS.map((column) => {
            // Exactly ONE card carries the highlight: the open panel wins;
            // with nothing expanded, the active schedule mode does. The ●/○
            // line still shows which mode calendar taps use.
            const isSelected = expandedPlanCard
              ? expandedPlanCard === column.key
              : planMode === column.key;
            return (
              <Pressable
                key={column.title}
                onPress={() => {
                  if (column.key === 'meeting') {
                    setPlanMode('meeting');
                    setExpandedPlanCard(null);
                  } else if (column.key === 'hang') {
                    setPlanMode('hang');
                    setExpandedPlanCard((card) => (card === 'hang' ? null : 'hang'));
                  } else {
                    setExpandedPlanCard((card) => (card === 'help' ? null : 'help'));
                  }
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  minWidth: sz(260, 150),
                  backgroundColor: isSelected ? 'rgba(222,193,129,0.18)' : CARD,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? GOLD : GOLD_SOFT,
                  borderRadius: sz(18, 14),
                  paddingHorizontal: sz(22, 14),
                  paddingVertical: sz(14, 10),
                  opacity: pressed ? 0.8 : 1,
                  outlineWidth: 0,
                })}
              >
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(24, 16), color: GOLD_DEEP }}>
                  {column.title}
                </Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 12), lineHeight: sz(25, 18), color: MUTED, marginTop: sz(4, 3) }}>
                  {column.blurb}
                </Text>
                {/* The hang card says nothing extra — the panel it opens
                    explains itself (Nat 2026-07-24). */}
                {column.key === 'hang' ? null : (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: isSelected ? GOLD_DEEP : 'rgba(154,128,96,0.55)', marginTop: sz(6, 4) }}>
                    {column.key === 'meeting'
                      ? isSelected ? '● tap a day below to schedule the meeting' : '○ select, then tap a day to schedule'
                      : expandedPlanCard === 'help' ? '▾ voices from the check-ins' : '▸ tap for voices from the check-ins'}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* HIVE Hang expansion — the POP formula for hangs. Left: how did
            last cycle land (real turnout meters from the check-in "I went 🙌"
            taps — survey says!). Right: what should we do next. Async voices
            count the same as in-person ones. */}
        {expandedPlanCard === 'hang' ? (
          <View
            style={{
              marginTop: sz(14, 8),
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(18, 14),
              paddingHorizontal: sz(22, 14),
              paddingVertical: sz(16, 10),
              flexDirection: isTV ? 'row' : 'column',
              gap: sz(32, 14),
            }}
          >
            <View style={{ flex: isTV ? 1 : undefined, gap: sz(10, 7) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(8, 5) }}>
                <HiveIcon name="chart" size={sz(16, 12)} color={GOLD} />
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD }}>
                  How did we do?
                </Text>
              </View>
              {hangPoll.length === 0 ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(14, 10), color: MUTED }}>
                  No hangs this cycle — blank scoreboard, let's fix that.
                </Text>
              ) : (
                hangPoll.map((hang) => (
                  <View key={hang.id} style={{ gap: sz(3, 2) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(10, 6) }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 12), color: CHARCOAL, flexShrink: 1 }}>
                        {hang.title}
                      </Text>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: GOLD_DEEP }}>
                        {hang.went > 0
                          ? `🙌 ${hang.went} went${hang.avgRating ? ` · 🍯 ${hang.avgRating}/5${hang.avgRating >= 4.5 ? ' — we LOVED it' : hang.avgRating >= 3.5 ? ' — a hit' : ''}` : ''}`
                          : 'waiting on the check-ins'}
                      </Text>
                    </View>
                    <View style={{ height: sz(10, 7), borderRadius: 999, backgroundColor: 'rgba(222,193,129,0.18)', overflow: 'hidden' }}>
                      <View
                        style={{
                          width: `${Math.round((hang.went / Math.max(1, members.length)) * 100)}%`,
                          height: '100%',
                          borderRadius: 999,
                          backgroundColor: GOLD,
                        }}
                      />
                    </View>
                  </View>
                ))
              )}
              {hangVoices.length > 0 ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(14, 10), color: MUTED, marginTop: sz(4, 3) }}>
                  🗣️ {hangVoices.length} written thought{hangVoices.length === 1 ? '' : 's'} in the check-ins — worth a skim out loud.
                </Text>
              ) : null}
            </View>

            {/* One question, one answer box: the ideas, then the plan you
                write. The "how" line lives in the note's empty state instead
                of standing as a third block (Nat 2026-07-24: "same thing
                three times"). */}
            <View style={{ flex: isTV ? 1 : undefined, gap: sz(10, 7) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(8, 5) }}>
                  <HiveIcon name="star" size={sz(16, 12)} color={GOLD} />
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD }}>
                    What should we do next?
                  </Text>
                </View>
                <EditPill noteKey="meetups" />
              </View>
              {hangIdeas.length === 0 ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(14, 10), color: MUTED }}>
                  No ideas on the board yet — first to post picks the venue.
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(10, 7) }}>
                  {/* Arm an idea, then tap a day — the quick-add opens with the
                      title already filled so you only add time and place.
                      Tapping the armed pill again disarms it, and a day tapped
                      with nothing armed behaves exactly as it always did: you
                      are never forced to pick from this list (Nat 2026-07-24). */}
                  {hangIdeas.map((idea) => {
                    const label = (idea.title ?? 'Untitled idea').trim() || 'Untitled idea';
                    const isArmed = armedHangIdea === label;
                    return (
                      <Pressable
                        key={idea.id}
                        onPress={() => {
                          setArmedHangIdea(isArmed ? null : label);
                          // Make sure a day tap pencils in a hang, not a meeting.
                          setPlanMode('hang');
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isArmed }}
                        accessibilityLabel={isArmed ? `Unpick ${label}` : `Pick ${label}, then tap a day to schedule it`}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: sz(6, 4),
                          backgroundColor: isArmed ? GOLD : pressed ? 'rgba(222,193,129,0.34)' : 'rgba(222,193,129,0.18)',
                          borderWidth: 1,
                          borderColor: isArmed ? GOLD : 'transparent',
                          borderRadius: 999,
                          paddingHorizontal: sz(18, 12),
                          paddingVertical: sz(8, 6),
                        })}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(16, 11), color: isArmed ? 'white' : GOLD_DEEP }}>
                          {isArmed ? `✓ ${label}` : label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {armedHangIdea ? (
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), color: GOLD_DEEP }}>
                  Now tap a day on the calendar to pencil in “{armedHangIdea}”.
                </Text>
              ) : null}
              <NoteBody noteKey="meetups" emptyText="No meet-up plans written down yet." />
            </View>
          </View>
        ) : null}

        {/* HIVE Help expansion: what everyone said in their check-ins —
            absent voices still get heard. The monthly focus lives up in the
            calendar headers now ("Help Focus: …"). */}
        {expandedPlanCard === 'help' ? (
          <View
            style={{
              marginTop: sz(14, 8),
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(18, 14),
              paddingHorizontal: sz(22, 14),
              paddingVertical: sz(16, 10),
              gap: sz(12, 8),
            }}
          >
            {/* Survey says, for the focus: how many did it and how it landed.
                This is the whole reason the recap is structured rather than a
                paragraph — counts and averages can be shown, prose can only be
                read aloud. */}
            {focusTally.did > 0 ? (
              <View style={{ gap: sz(4, 3) }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(19, 13), color: GOLD_DEEP }}>
                  🙌 {focusTally.did} of {members.length} did it
                  {focusAvg ? ` · 🍯 ${focusAvg}/5${focusAvg >= 4.5 ? ' — we LOVED it' : focusAvg >= 3.5 ? ' — a hit' : ''}` : ''}
                </Text>
                {focusTally.instead.length > 0 ? (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(15, 10), color: MUTED }}>
                    Did their own thing — {focusTally.instead.join(' · ')}
                  </Text>
                ) : null}
                <View style={{ height: sz(10, 7), borderRadius: 999, backgroundColor: 'rgba(222,193,129,0.18)', overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.round((focusTally.did / Math.max(1, members.length)) * 100)}%`,
                      height: '100%',
                      borderRadius: 999,
                      backgroundColor: GOLD,
                    }}
                  />
                </View>
              </View>
            ) : null}
            {helpVoices.length > 0 ? (
              <View style={{ gap: sz(4, 3) }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD, marginTop: sz(4, 3) }}>
                  🗣️ Voices from the check-ins
                </Text>
                {helpVoices.map((voice) => (
                  <Text key={voice.id} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(16, 11), lineHeight: sz(24, 16), color: CHARCOAL }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', color: GOLD_DEEP }}>{voice.name}: </Text>
                    {voice.text}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(14, 10), color: MUTED }}>
                No HIVE Help thoughts in the check-ins yet — they'll gather here as people fill theirs out.
              </Text>
            )}
          </View>
        ) : null}

        {/* Mini month pager — pages the calendar window, NOT the slides */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: sz(10, 7), marginTop: sz(18, 10) }}>
          {monthOffset !== 0 ? (
            <Pressable
              onPress={() => setMonthOffset(0)}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                borderRadius: 999,
                paddingHorizontal: sz(14, 10),
                paddingVertical: sz(6, 4),
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: GOLD_DEEP }}>back to now</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Middle: two months side by side on the TV — with carousel-style
            pager arrows riding the calendar's flanks, vertically centered
            (Nat: "between the 12 & 19"). */}
        <View style={{ position: 'relative', marginTop: sz(8, 5) }}>
          <View style={{ flexDirection: isTV ? 'row' : 'column', gap: sz(28, 14), paddingHorizontal: sz(52, 38) }}>
            {monthStarts.map(renderMonth)}
          </View>
          {[
            { label: '‹', delta: -1, hint: 'previous month', side: { left: 0 } },
            { label: '›', delta: 1, hint: 'next month', side: { right: 0 } },
          ].map((pager) => (
            <Pressable
              key={pager.label}
              onPress={() => setMonthOffset((offset) => offset + pager.delta)}
              accessibilityLabel={pager.hint}
              style={({ pressed }) => ({
                position: 'absolute',
                top: '50%',
                marginTop: -sz(21, 16),
                ...pager.side,
                width: sz(42, 32),
                height: sz(42, 32),
                borderRadius: 999,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                backgroundColor: CARD,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
                shadowColor: '#bd9348',
                shadowOpacity: 0.14,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
                elevation: 2,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(22, 17), color: GOLD_DEEP, marginTop: -2 }}>
                {pager.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Everything lives in the cards above now — recaps, polls, ideas,
            and plans all expand from Meeting/Hang/Help. */}

        {/* Breathing room so the last row scrolls clear of the footer. */}
        <View style={{ height: sz(90, 64) }} />
      </View>
    );
  };

  // The HummDinger sesh, consolidated onto one page: a compact POP-formula
  // header (the talking points people follow during the go-around) above a grid
  // of member bubbles (name-for-today + their top HD goal).
  //
  // NOTE: Earlier this was a full formula slide + one slide PER MEMBER + a
  // grouped "Member HDs" overview. Per-member slides were intentionally folded
  // into these bubbles — early on most people haven't filled out the check-in,
  // and an empty personal slide makes them feel singled out. As the check-in
  // data richens, per-member slides can be reintroduced from git history.
  const bubbleColumns = isTV ? 5 : width >= 1024 ? 4 : width >= 760 ? 3 : width >= 480 ? 2 : 1;

  const HUMMDINGER_DETAIL_SECTIONS = [
    { key: 'q_pop_progress', label: 'Progress' },
    { key: 'q_pop_obstacles', label: 'Obstacles' },
    { key: 'q_pop_priorities', label: 'Priorities' },
  ] as const;

  const renderHummdinger = () => (
    <View style={{ flex: 1 }}>
      <Kicker>Obstacles · the HD sesh</Kicker>
      <SlideTitle>HummDinger Sesh</SlideTitle>
      <Text
        style={{
          fontFamily: 'Lato_400Regular',
          fontStyle: 'italic',
          fontSize: sz(20, 12),
          lineHeight: sz(30, 18),
          color: MUTED,
          marginTop: sz(12, 8),
        }}
      >
        {POP_ALT_PHRASING}
      </Text>

      {/* POP-formula header — a legend, not a headline. Kept deliberately
          slim so the member bubbles below get the room (Nat 2026-07-24). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(12, 7), marginTop: sz(14, 10) }}>
        {POP_SECTIONS.map((section) => (
          <View
            key={section.key}
            style={{
              flex: 1,
              minWidth: sz(200, 140),
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(14, 11),
              paddingHorizontal: sz(16, 11),
              paddingVertical: sz(9, 7),
            }}
          >
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(18, 13), color: CHARCOAL }}>
              {section.label}
            </Text>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(13, 10), lineHeight: sz(18, 14), color: GOLD_DEEP, marginTop: sz(2, 1) }}>
              {section.prompt}
            </Text>
          </View>
        ))}
      </View>

      {/* Member bubbles — one per member, uniform size so no one looks
          emptier. Tap a bubble to expand the full check-in (and tap again to
          tuck it away) — thorough write-ups get their moment without empty
          ones being singled out. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: sz(-8, -5), marginTop: sz(20, 13) }}>
        {memberOrder.map((member) => {
          const response = responsesByUser.get(member.id);
          const answers = response?.answers ?? {};
          const nameToday = getTextAnswer(answers, 'q_name_today') || getFirstName(member.name);
          const memberWishes = wishesByUserId.get(member.id) ?? [];
          const topWish = pickSpotlightWish(memberWishes) ?? memberWishes[0];
          const hdGoal = topWish ? getWishQuickTitle(topWish, 40) : null;
          const priorities = getTextAnswer(answers, 'q_pop_priorities');
          const detailSections = HUMMDINGER_DETAIL_SECTIONS
            .map((section) => ({ ...section, text: getTextAnswer(answers, section.key) }))
            .filter((section) => !!section.text);
          const assistsForMember = completedAssists.filter(
            (assist) => assist.relatedUserId === member.id && assist.assignedTo !== member.id
          );
          const assistsByMember = completedAssists.filter((assist) => assist.assignedTo === member.id);
          const grantedThisCycle = grantedWishes.filter((wish) => wish.user_id === member.id);
          const attendance = getAttendance(response);
          // Whether they brought anything WRITTEN. Every bubble opens either
          // way: the meeting happens out loud, and someone who skipped the
          // digital part still gets a turn — often the idea only forms once
          // they start talking, and it needs somewhere to land (Nat
          // 2026-07-24). An empty spotlight is still a live-note pad.
          const hasDetails =
            detailSections.length > 0 ||
            !!topWish?.description ||
            assistsForMember.length > 0 ||
            assistsByMember.length > 0 ||
            grantedThisCycle.length > 0;
          return (
            <View key={member.id} style={{ width: `${100 / bubbleColumns}%`, padding: sz(8, 5) }}>
              <Pressable
                onPress={() => {
                  setExpandedHummdingerId(member.id);
                  setHummdingerVisited((visited) => new Set(visited).add(member.id));
                  setLiveNoteDraft('');
                  setLiveNoteConfirmation(null);
                }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  backgroundColor: CARD,
                  borderWidth: hummdingerVisited.has(member.id) ? 2 : 1,
                  borderColor: hummdingerVisited.has(member.id) ? GOLD : GOLD_SOFT,
                  borderRadius: sz(20, 14),
                  paddingHorizontal: sz(18, 11),
                  paddingVertical: sz(26, 16),
                  outlineWidth: 0,
                }}
              >
                <Avatar name={member.name} url={member.avatar_url} size={sz(88, 56)} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'LibreBaskerville_700Bold',
                    fontSize: sz(26, 16),
                    color: CHARCOAL,
                    marginTop: sz(12, 8),
                    textAlign: 'center',
                  }}
                >
                  {nameToday}
                </Text>
                {attendance === 'missing' ? (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: MUTED, marginTop: sz(3, 2) }}>
                    😢 not here tonight — carry the torch
                  </Text>
                ) : attendance === 'remote' ? (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: GOLD_DEEP, marginTop: sz(3, 2) }}>
                    💻 zooming in
                  </Text>
                ) : null}
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: sz(17, 11),
                    lineHeight: sz(24, 16),
                    color: hdGoal ? GOLD_DEEP : MUTED,
                    fontStyle: hdGoal ? 'normal' : 'italic',
                    textAlign: 'center',
                    marginTop: sz(6, 4),
                  }}
                >
                  {hdGoal ?? 'open to ideas'}
                </Text>
                {priorities ? (
                  <Text
                    numberOfLines={2}
                    style={{
                      fontFamily: 'Lato_400Regular',
                      fontSize: sz(15, 10),
                      lineHeight: sz(21, 14),
                      color: MUTED,
                      textAlign: 'center',
                      marginTop: sz(6, 4),
                    }}
                  >
                    {priorities}
                  </Text>
                ) : null}
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(13, 9), color: MUTED, marginTop: sz(8, 5) }}>
                  {hasDetails
                    ? hummdingerVisited.has(member.id) ? '✓ tap for the full story' : 'tap for the full story ↓'
                    : hummdingerVisited.has(member.id) ? '✓ tap to take notes' : 'tap to take notes ↓'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );

  // The spotlight: one member's full story in an overlay, so the group grid
  // never reflows. Big obvious way back — Lucas got lost in the inline
  // version ("I wanted to get back to wide view").
  const renderHummdingerSpotlight = () => {
    const member = memberOrder.find((candidate) => candidate.id === expandedHummdingerId);
    if (!member) return null;
    const response = responsesByUser.get(member.id);
    const answers = response?.answers ?? {};
    const nameToday = getTextAnswer(answers, 'q_name_today') || getFirstName(member.name);
    const memberWishList = wishesByUserId.get(member.id) ?? [];
    const topWish = pickSpotlightWish(memberWishList) ?? memberWishList[0];
    // The tune-up SEEDS an empty Progress answer with "Checked off: …" and
    // "Done for me 💛: …" lines. This card already renders both as their own
    // properly-formatted sections below, so echoing the seed under PROGRESS
    // said everything twice (Nat 2026-07-24: "kind of messy"). Drop the seeded
    // lines here and keep whatever the member actually wrote; if that's
    // nothing, the section doesn't appear at all.
    const detailSections = HUMMDINGER_DETAIL_SECTIONS
      .map((section) => {
        const text = getTextAnswer(answers, section.key);
        if (section.key !== 'q_pop_progress') return { ...section, text };
        const ownWords = text
          .split('\n')
          .filter((line) => !/^\s*(checked off|done for me\s*💛?)\s*:/i.test(line))
          .join('\n')
          .trim();
        return { ...section, text: ownWords };
      })
      .filter((section) => !!section.text);
    const assistsForMember = completedAssists.filter(
      (assist) => assist.relatedUserId === member.id && assist.assignedTo !== member.id
    );
    const assistsByMember = completedAssists.filter((assist) => assist.assignedTo === member.id);
    const grantedThisCycle = grantedWishes.filter((wish) => wish.user_id === member.id);
    const attendance = getAttendance(response);
    const sectionLabel = { fontFamily: 'Lato_700Bold' as const, fontSize: sz(15, 11), letterSpacing: 1.5, textTransform: 'uppercase' as const, color: GOLD, marginBottom: sz(4, 3) };
    const sectionText = { fontFamily: 'Lato_400Regular' as const, fontSize: sz(18, 13), lineHeight: sz(27, 19), color: CHARCOAL };
    const sectionContext = { fontFamily: 'Lato_400Regular' as const, fontSize: sz(14, 10), lineHeight: sz(19, 14), color: MUTED };

    return (
      <Modal visible animationType="fade" transparent onRequestClose={() => setExpandedHummdingerId(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(49,49,48,0.5)', alignItems: 'center', justifyContent: 'center', padding: sz(40, 14) }}
          onPress={() => setExpandedHummdingerId(null)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: sz(880, 640),
              maxHeight: '88%',
              backgroundColor: PAPER,
              borderRadius: sz(26, 18),
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              overflow: 'hidden',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(16, 10), paddingHorizontal: sz(28, 16), paddingTop: sz(24, 14), paddingBottom: sz(14, 9), borderBottomWidth: 1, borderColor: GOLD_SOFT }}>
              <Avatar name={member.name} url={member.avatar_url} size={sz(64, 44)} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(30, 19), color: CHARCOAL }}>
                  {nameToday}
                </Text>
                {attendance === 'missing' ? (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 11), color: MUTED }}>
                    😢 not here tonight — carry the torch
                  </Text>
                ) : attendance === 'remote' ? (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 11), color: GOLD_DEEP }}>
                    💻 zooming in
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => setExpandedHummdingerId(null)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: 'rgba(222,193,129,0.18)',
                  borderRadius: 999,
                  paddingHorizontal: sz(18, 12),
                  paddingVertical: sz(9, 7),
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(16, 11), color: GOLD_DEEP }}>
                  ← back to the group
                </Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: sz(28, 16), paddingVertical: sz(20, 12), gap: sz(16, 10) }}>
              {!topWish?.description
                && grantedThisCycle.length === 0
                && detailSections.length === 0
                && assistsForMember.length === 0
                && assistsByMember.length === 0 ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(17, 12), lineHeight: sz(25, 18), color: MUTED }}>
                  Nothing written down yet — that's what the floor is for. Catch what {nameToday} says below.
                </Text>
              ) : null}
              {topWish?.description ? (
                <View>
                  <Text style={sectionLabel}>This month's HD</Text>
                  <Text style={sectionText}>{topWish.description}</Text>
                </View>
              ) : null}
              {grantedThisCycle.length > 0 ? (
                <View>
                  <Text style={sectionLabel}>Wishes granted this cycle 🌟</Text>
                  {grantedThisCycle.map((wish) => (
                    <Text key={wish.id} style={sectionText}>
                      {getWishQuickTitle(wish, 72)}
                      {wish.granterNames.length > 0 ? (
                        <Text style={{ fontFamily: 'Lato_700Bold', color: GOLD_DEEP }}>
                          {'  —  granted by '}{wish.granterNames.join(' & ')}
                        </Text>
                      ) : null}
                    </Text>
                  ))}
                </View>
              ) : null}
              {detailSections.map((section) => (
                <View key={section.key}>
                  <Text style={sectionLabel}>{section.label}</Text>
                  <Text style={sectionText}>{section.text}</Text>
                </View>
              ))}
              {assistsForMember.length > 0 ? (
                <View style={{ gap: sz(6, 4) }}>
                  <Text style={sectionLabel}>Done for {getFirstName(member.name)} this cycle 💛</Text>
                  {assistsForMember.map((assist) => {
                    const jot = parseActionItemDescription(assist.description);
                    return (
                      <View key={assist.id}>
                        <Text style={sectionText}>
                          {getFirstName(assist.assigneeName)}: {jot.text}
                        </Text>
                        {jot.context ? <Text style={sectionContext}>{jot.context}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {assistsByMember.length > 0 ? (
                <View style={{ gap: sz(6, 4) }}>
                  <Text style={sectionLabel}>{getFirstName(member.name)} checked off ✓</Text>
                  {/* Jots arrive as raw routing text ("@Nat do the thing (re:
                      Someone's HummDinger)") — the @token and re: subject are
                      addressing, not reading material, so they drop to a quiet
                      second line the way the Home to-do list shows them. */}
                  {assistsByMember.map((assist) => {
                    const jot = parseActionItemDescription(assist.description);
                    return (
                      <View key={assist.id}>
                        <Text style={sectionText}>{jot.text}</Text>
                        {jot.context ? <Text style={sectionContext}>{jot.context}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
              <View style={{ borderTopWidth: 1, borderColor: GOLD_SOFT, paddingTop: sz(14, 9), gap: sz(8, 6) }}>
                <Text style={sectionLabel}>Live note → to-do list</Text>
                {/* What the note is ABOUT, which is not always the card it's
                    taken on. Picking an HD links the to-do to that wish and
                    leaves the note as a comment there; "Not about an HD" files
                    a plain to-do about the member and touches no wish. */}
                {memberWishList.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sz(6, 4) }}>
                    <Text style={{ ...sectionContext, marginRight: sz(2, 1) }}>About:</Text>
                    {[
                      ...memberWishList.map((wish) => ({ id: wish.id, label: getWishQuickTitle(wish, 30) })),
                      { id: null, label: 'Not about an HD' },
                    ].map((option) => {
                      const selected = liveNoteWishId === option.id;
                      return (
                        <Pressable
                          key={option.id ?? 'no-hd'}
                          onPress={() => setLiveNoteWishId(option.id)}
                          style={({ pressed }) => ({
                            paddingHorizontal: sz(12, 9),
                            paddingVertical: sz(5, 4),
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: selected ? GOLD : GOLD_SOFT,
                            backgroundColor: selected ? 'rgba(222,193,129,0.22)' : 'transparent',
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Text
                            style={{
                              fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                              fontSize: sz(14, 10),
                              color: selected ? GOLD_DEEP : MUTED,
                            }}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                {(() => {
                  const mentionQuery = getActiveMentionQuery(liveNoteDraft, liveNoteCursor);
                  if (mentionQuery === null) return null;
                  return (
                    <MentionSuggestions
                      suggestions={getMentionSuggestions(mentionQuery, members)}
                      query={mentionQuery}
                      active
                      placement="above"
                      onSelect={(target) => {
                        const next = insertMention(liveNoteDraft, liveNoteCursor, target);
                        setLiveNoteDraft(next.text);
                        setLiveNoteCursor(next.cursorIndex);
                      }}
                    />
                  );
                })()}
                <TextInput
                  value={liveNoteDraft}
                  onChangeText={(value) => {
                    setLiveNoteDraft(value);
                    if (liveNoteConfirmation) setLiveNoteConfirmation(null);
                  }}
                  onSelectionChange={(event) => setLiveNoteCursor(event.nativeEvent.selection.end)}
                  placeholder={`Jot a to-do — it lands on ${getFirstName(member.name)}'s list. Start a word with @ (like @Charlee, or @all) to send it to them instead.`}
                  placeholderTextColor={MUTED}
                  multiline
                  // Enter files the jot; Shift+Enter is the newline. Mid-meeting
                  // you're typing fast — reaching for the button broke the flow.
                  blurOnSubmit={false}
                  onKeyPress={submitOnEnter(() => handleSaveLiveNote(member, liveNoteWishId))}
                  style={{
                    borderWidth: 1,
                    borderColor: GOLD_SOFT,
                    borderRadius: sz(12, 9),
                    backgroundColor: CARD,
                    paddingHorizontal: sz(14, 10),
                    paddingVertical: sz(10, 8),
                    fontFamily: 'Lato_400Regular',
                    fontSize: sz(17, 12),
                    color: CHARCOAL,
                    minHeight: sz(64, 48),
                  }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(12, 8) }}>
                  <Pressable
                    onPress={() => handleSaveLiveNote(member, liveNoteWishId)}
                    disabled={liveNoteSaving || !liveNoteDraft.trim()}
                    style={({ pressed }) => ({
                      paddingHorizontal: sz(22, 16),
                      paddingVertical: sz(9, 7),
                      borderRadius: 999,
                      backgroundColor: GOLD,
                      opacity: pressed || liveNoteSaving || !liveNoteDraft.trim() ? 0.6 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 11), color: 'white' }}>
                      {liveNoteSaving ? 'Saving…' : 'Add to list'}
                    </Text>
                  </Pressable>
                  {liveNoteConfirmation ? (
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: GOLD_DEEP, flexShrink: 1 }}>
                      {liveNoteConfirmation}
                    </Text>
                  ) : null}
                </View>
                {liveNotesTaken.filter((note) => note.aboutId === member.id).map((note) => (
                  <View key={note.id} style={{ flexDirection: 'row', gap: sz(8, 6), alignItems: 'flex-start' }}>
                    <View style={{ paddingTop: sz(3, 2) }}>
                      <HiveIcon name="note" size={sz(15, 12)} color={GOLD} />
                    </View>
                    <Text style={{ flex: 1, fontFamily: 'Lato_400Regular', fontSize: sz(15, 11), lineHeight: sz(22, 16), color: CHARCOAL }}>
                      {note.text}
                      <Text style={{ fontFamily: 'Lato_700Bold', color: GOLD_DEEP }}>  → {note.assignees}</Text>
                    </Text>
                    <Pressable onPress={() => handleUndoLiveNote(note.id)} hitSlop={8}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 11), color: MUTED }}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const WRAPUP_REMINDERS = [
    'Next meeting — second Wednesday of the month',
    'Newsletter lands on the 1st',
    'Dues: $25 / quarter · CashApp $HiveLV',
  ];

  const renderWrapup = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: sz(30, 18) }}>
        <View>
          <Kicker>Priorities · take it home</Kicker>
          <SlideTitle>Wrap-Up</SlideTitle>
        </View>
        <EditPill noteKey="wrapup" />
      </View>
      <NoteBody
        noteKey="wrapup"
        emptyText="No wrap-up notes yet — decisions made tonight can land here."
      />
      {/* The meeting happens IN the app now, so the summary writes itself:
          everything that changed today, straight from the database. */}
      {tonightRecap &&
      (tonightRecap.events.length > 0 ||
        tonightRecap.todoCount > 0 ||
        tonightRecap.wishComments > 0 ||
        tonightRecap.granted.length > 0 ||
        tonightRecap.threads.length > 0) ? (
        <View
          style={{
            marginTop: sz(26, 14),
            backgroundColor: 'rgba(222,193,129,0.12)',
            borderWidth: 1,
            borderColor: GOLD_SOFT,
            borderRadius: sz(20, 14),
            paddingHorizontal: sz(24, 14),
            paddingVertical: sz(18, 11),
            gap: sz(8, 5),
          }}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 11), letterSpacing: 2, textTransform: 'uppercase', color: GOLD_DEEP }}>
            📸 Tonight in the app
          </Text>
          {tonightRecap.events.length > 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: CHARCOAL }}>
              🗓️ Scheduled: {tonightRecap.events.join(' · ')}
            </Text>
          ) : null}
          {tonightRecap.todoCount > 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: CHARCOAL }}>
              ✅ {tonightRecap.todoCount} to-do{tonightRecap.todoCount === 1 ? '' : 's'} handed out across {tonightRecap.todoPeople} list{tonightRecap.todoPeople === 1 ? '' : 's'}
            </Text>
          ) : null}
          {tonightRecap.wishComments > 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: CHARCOAL }}>
              💬 {tonightRecap.wishComments} note{tonightRecap.wishComments === 1 ? '' : 's'} left on wishes
            </Text>
          ) : null}
          {tonightRecap.granted.length > 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: CHARCOAL }}>
              🌟 Granted: {tonightRecap.granted.join(' · ')}
            </Text>
          ) : null}
          {tonightRecap.threads.length > 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: CHARCOAL }}>
              📌 New threads: {tonightRecap.threads.join(' · ')}
            </Text>
          ) : null}
          <Pressable
            onPress={handleSealMeeting}
            disabled={sealState === 'saving' || sealState === 'done'}
            style={{
              alignSelf: 'flex-start',
              marginTop: sz(10, 6),
              backgroundColor: sealState === 'done' ? 'rgba(189,147,72,0.16)' : GOLD,
              borderWidth: sealState === 'done' ? 1 : 0,
              borderColor: GOLD_SOFT,
              borderRadius: 999,
              paddingHorizontal: sz(22, 14),
              paddingVertical: sz(11, 8),
            }}
          >
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: sz(17, 12),
                color: sealState === 'done' ? GOLD_DEEP : '#ffffff',
              }}
            >
              {sealState === 'saving'
                ? 'Sealing…'
                : sealState === 'done'
                  ? '✓ Sealed — it’s in Meeting Summaries'
                  : sealState === 'error'
                    ? 'Hmm, try sealing again'
                    : '🍯 Seal tonight’s notes → Meeting Summaries'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View
        style={{
          marginTop: sz(40, 22),
          backgroundColor: CARD,
          borderWidth: 1,
          borderColor: GOLD_SOFT,
          borderRadius: sz(22, 16),
          padding: sz(30, 16),
          gap: sz(14, 9),
        }}
      >
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(19, 12), letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>
          Standing reminders
        </Text>
        {WRAPUP_REMINDERS.map((reminder) => (
          <View key={reminder} style={{ flexDirection: 'row', alignItems: 'baseline', gap: sz(12, 8) }}>
            <View style={{ width: sz(9, 6), height: sz(9, 6), borderRadius: 999, backgroundColor: GOLD, transform: [{ translateY: -2 }] }} />
            <Text style={{ flex: 1, fontFamily: 'Lato_400Regular', fontSize: sz(24, 14), lineHeight: sz(34, 21), color: CHARCOAL }}>
              {reminder}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderThanks = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={hiveBee}
        style={{ width: sz(190, 100), height: sz(190, 100) }}
        contentFit="contain"
      />
      <Text
        style={{
          fontFamily: 'LibreBaskerville_700Bold',
          fontSize: sz(78, 36),
          color: CHARCOAL,
          marginTop: sz(28, 16),
        }}
      >
        Thank you
      </Text>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(26, 15), color: MUTED, marginTop: sz(14, 8) }}>
        See you next month.
      </Text>
    </View>
  );

  const slides = [
    { key: 'room', render: renderRoom },
    { key: 'outline', render: renderOutline },
    { key: 'news', render: renderNews },
    { key: 'treasurer', render: renderTreasurer },
    { key: 'meetups', render: renderMeetups },
    { key: 'hummdinger', render: renderHummdinger },
    { key: 'wrapup', render: renderWrapup },
    { key: 'thanks', render: renderThanks },
  ];

  const slideCount = slides.length;
  const clampedIndex = Math.min(slideIndex, slideCount - 1);
  const activeSlide = slides[clampedIndex];

  const goNext = useCallback(() => {
    setSlideIndex((index) => Math.min(index + 1, slideCount - 1));
  }, [slideCount]);

  const goPrev = useCallback(() => {
    setSlideIndex((index) => Math.max(index - 1, 0));
  }, []);

  // Keyboard navigation on web: ← → and Space (the TV/laptop use case).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKeyDown = (event: any) => {
      if (editKey !== null) return; // don't page while the edit modal is open
      if (event.key === 'ArrowRight' || event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editKey, goNext, goPrev]);

  const navStripWidth = sz(96, 52);
  const editMeta = editKey ? EDIT_SLIDE_META[editKey] : null;

  // The frozen agenda rail (wide screens): analog clock + countdown on top,
  // tonight's outline below with the current stop in gold, and the HummDinger
  // roster showing who's been through, who's up, and who's still to go.
  const showRail = isTV || width >= 1000;

  const renderRail = () => {
    const [hour, minute] = hardOutTime.split(':').map(Number);
    const hardOutDate = new Date(clockNow);
    hardOutDate.setHours(hour, minute, 0, 0);
    const minutesLeft = Math.round((hardOutDate.getTime() - clockNow.getTime()) / 60_000);
    const meetingIsNear = minutesLeft > 0 && minutesLeft <= 180;
    const clockLabel = clockNow.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const hardOutLabel = hardOutDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const leftLabel =
      minutesLeft <= 0
        ? `past ${hardOutLabel} 🌙`
        : minutesLeft >= 60
          ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m 'til ${hardOutLabel}`
          : `${minutesLeft} min 'til ${hardOutLabel}`;
    const clockSize = sz(110, 84);
    const hourAngle = (clockNow.getHours() % 12) * 30 + clockNow.getMinutes() * 0.5;
    const minuteAngle = clockNow.getMinutes() * 6;
    const activeKey = activeSlide.key;
    const membersToGo = memberOrder.filter((member) => !hummdingerVisited.has(member.id)).length;
    const hdPaceMinutes =
      meetingIsNear && activeKey === 'hummdinger' && membersToGo > 0
        ? Math.max(1, Math.floor(minutesLeft / membersToGo))
        : null;

    return (
      <View
        style={{
          width: sz(300, 224),
          borderLeftWidth: 1,
          borderColor: GOLD_SOFT,
          backgroundColor: 'rgba(255,253,245,0.75)',
          paddingHorizontal: sz(22, 14),
          paddingTop: sz(28, 16),
          paddingBottom: sz(20, 12),
        }}
      >
        <Pressable
          onPress={() => {
            setHardOutDraft('');
            setShowHardOutEditor(true);
          }}
          style={({ pressed }) => ({ alignItems: 'center', gap: sz(8, 5), opacity: pressed ? 0.75 : 1 })}
        >
          <View
            style={{
              width: clockSize,
              height: clockSize,
              borderRadius: clockSize / 2,
              borderWidth: 2,
              borderColor: GOLD,
              backgroundColor: CARD,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {[0, 90, 180, 270].map((angle) => (
              <View
                key={angle}
                style={{
                  position: 'absolute',
                  width: 2,
                  height: clockSize * 0.08,
                  backgroundColor: GOLD_SOFT,
                  transform: [{ rotate: `${angle}deg` }, { translateY: -clockSize * 0.4 }],
                }}
              />
            ))}
            <View
              style={{
                position: 'absolute',
                width: 3,
                height: clockSize * 0.24,
                borderRadius: 2,
                backgroundColor: CHARCOAL,
                transform: [{ rotate: `${hourAngle}deg` }, { translateY: -clockSize * 0.12 }],
              }}
            />
            <View
              style={{
                position: 'absolute',
                width: 2,
                height: clockSize * 0.34,
                borderRadius: 2,
                backgroundColor: GOLD_DEEP,
                transform: [{ rotate: `${minuteAngle}deg` }, { translateY: -clockSize * 0.17 }],
              }}
            />
            <View style={{ position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD_DEEP }} />
          </View>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 14), color: CHARCOAL }}>{clockLabel}</Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: sz(15, 10),
              color: minutesLeft <= 15 && minutesLeft > 0 ? '#b3261e' : MUTED,
              textAlign: 'center',
            }}
          >
            {leftLabel}
          </Text>
        </Pressable>

        <View style={{ height: 1, backgroundColor: GOLD_SOFT, marginVertical: sz(18, 11) }} />

        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), letterSpacing: 2, textTransform: 'uppercase', color: GOLD, marginBottom: sz(10, 7) }}>
          Tonight
        </Text>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {AGENDA.map((item, agendaIndex) => {
            const slidePosition = slides.findIndex((slide) => slide.key === item.key);
            const isActive = activeKey === item.key;
            return (
              <View key={item.key}>
                <Pressable
                  onPress={() => setSlideIndex(slidePosition)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: sz(10, 7),
                    paddingVertical: sz(7, 5),
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(17, 12), color: isActive ? GOLD_DEEP : 'rgba(189,147,72,0.45)' }}>
                    {agendaIndex + 1}
                  </Text>
                  <Text
                    style={{
                      fontFamily: isActive ? 'Lato_700Bold' : 'Lato_400Regular',
                      fontSize: sz(18, 12),
                      color: isActive ? GOLD_DEEP : 'rgba(49,49,48,0.45)',
                      flex: 1,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
                {item.key === 'hummdinger' ? (
                  <View style={{ paddingLeft: sz(26, 18), paddingBottom: sz(6, 4) }}>
                    {hdPaceMinutes !== null ? (
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(13, 9), color: '#b3261e', marginBottom: sz(4, 3) }}>
                        {membersToGo} to go · ≈{hdPaceMinutes} min each
                      </Text>
                    ) : null}
                    {memberOrder.map((member) => {
                      const isUp = expandedHummdingerId === member.id;
                      const wasVisited = hummdingerVisited.has(member.id) && !isUp;
                      const railAttendance = getAttendance(responsesByUser.get(member.id));
                      const attendanceMark =
                        railAttendance === 'missing' ? ' 😢' : railAttendance === 'remote' ? ' 💻' : '';
                      return (
                        <Text
                          key={member.id}
                          numberOfLines={1}
                          style={{
                            fontFamily: isUp ? 'Lato_700Bold' : 'Lato_400Regular',
                            fontSize: sz(15, 10),
                            lineHeight: sz(23, 16),
                            color: isUp
                              ? GOLD_DEEP
                              : wasVisited
                                ? 'rgba(49,49,48,0.28)'
                                : activeKey === 'hummdinger'
                                  ? 'rgba(49,49,48,0.6)'
                                  : 'rgba(49,49,48,0.35)',
                          }}
                        >
                          {wasVisited ? '✓ ' : isUp ? '→ ' : '· '}
                          {getFirstName(member.name)}{attendanceMark}
                        </Text>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAPER }} edges={['top']}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: 1 }}>
        {/* Corner watermark on every slide */}
        <Image
          source={hiveBee}
          style={{
            position: 'absolute',
            right: sz(-40, -24),
            bottom: sz(-30, -18),
            width: sz(360, 190),
            height: sz(360, 190),
            opacity: 0.06,
          }}
          contentFit="contain"
          pointerEvents="none"
        />

        {/* Slide content */}
        <ScrollView
          key={activeSlide.key}
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: contentPadH,
            paddingTop: contentPadTop,
            paddingBottom: contentPadBottom,
            minHeight: height - 120,
          }}
        >
          {activeSlide.render()}
        </ScrollView>

        {/* Edge navigation: tap zones with quiet chevrons */}
        {clampedIndex > 0 ? (
          <Pressable
            onPress={goPrev}
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
            style={({ pressed }) => ({
              position: 'absolute',
              left: 0,
              top: sz(90, 60),
              bottom: sz(70, 54),
              width: navStripWidth,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 1 : 0.35,
            })}
          >
            <Ionicons name="chevron-back" size={sz(46, 28)} color={GOLD} />
          </Pressable>
        ) : null}
        {clampedIndex < slideCount - 1 ? (
          <Pressable
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel="Next slide"
            style={({ pressed }) => ({
              position: 'absolute',
              right: 0,
              top: sz(90, 60),
              bottom: sz(70, 54),
              width: navStripWidth,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 1 : 0.35,
            })}
          >
            <Ionicons name="chevron-forward" size={sz(46, 28)} color={GOLD} />
          </Pressable>
        ) : null}

        {/* Quiet top controls: exit + refresh */}
        <Pressable
          onPress={closeDeck}
          accessibilityRole="button"
          accessibilityLabel="Leave the deck"
          hitSlop={10}
          style={({ pressed }) => ({
            position: 'absolute',
            top: sz(22, 12),
            left: sz(26, 14),
            opacity: pressed ? 0.9 : 0.35,
          })}
        >
          <Ionicons name="close" size={sz(30, 22)} color={GOLD_DEEP} />
        </Pressable>
        <Pressable
          onPress={() => void refreshDeck()}
          accessibilityRole="button"
          accessibilityLabel="Refresh deck data"
          hitSlop={10}
          style={({ pressed }) => ({
            position: 'absolute',
            top: sz(22, 12),
            right: sz(26, 14),
            opacity: pressed ? 0.9 : 0.35,
          })}
        >
          {deckRefreshing ? (
            <ActivityIndicator size="small" color={GOLD_DEEP} />
          ) : (
            <Ionicons name="refresh" size={sz(28, 20)} color={GOLD_DEEP} />
          )}
        </Pressable>

        {/* Footer: tagline + slide counter */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: sz(40, 18),
            paddingBottom: sz(24, 14),
          }}
        >
          <View style={{ flex: 1 }} />
          <Text
            style={{
              fontFamily: 'Lato_700Bold',
              fontSize: sz(15, 9),
              letterSpacing: sz(4, 2.5),
              color: 'rgba(189,147,72,0.65)',
              textAlign: 'center',
            }}
          >
            {TAGLINE}
          </Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 11), color: 'rgba(154,128,96,0.7)' }}>
              {clampedIndex + 1} / {slideCount}
            </Text>
          </View>
        </View>

        {/* Compact timekeeper for narrow screens — wide screens get the full
            agenda rail instead. Pace hint only appears once the meeting is
            actually near (within 3h of the hard-out) — at lunchtime it's noise. */}
        {!showRail && (() => {
          const [hour, minute] = hardOutTime.split(':').map(Number);
          const hardOutDate = new Date(clockNow);
          hardOutDate.setHours(hour, minute, 0, 0);
          const minutesLeft = Math.round((hardOutDate.getTime() - clockNow.getTime()) / 60_000);
          const slidesLeft = Math.max(1, slideCount - clampedIndex);
          const meetingIsNear = minutesLeft > 0 && minutesLeft <= 180;
          const paceMinutes = meetingIsNear ? Math.max(1, Math.floor(minutesLeft / slidesLeft)) : null;
          const clockLabel = clockNow.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const hardOutLabel = hardOutDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const leftLabel =
            minutesLeft <= 0
              ? `past ${hardOutLabel} 🌙`
              : minutesLeft >= 60
                ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m 'til ${hardOutLabel}`
                : `${minutesLeft} min 'til ${hardOutLabel}`;
          const clockSize = sz(96, 54);
          const hourAngle = (clockNow.getHours() % 12) * 30 + clockNow.getMinutes() * 0.5;
          const minuteAngle = clockNow.getMinutes() * 6;
          return (
            <Pressable
              onPress={() => {
                setHardOutDraft('');
                setHardOutMeridiem('PM');
                setShowHardOutEditor(true);
              }}
              style={({ pressed }) => ({
                position: 'absolute',
                right: sz(28, 10),
                bottom: sz(72, 52),
                alignItems: 'center',
                gap: sz(8, 5),
                backgroundColor: 'rgba(255,253,245,0.94)',
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                borderRadius: sz(20, 14),
                paddingHorizontal: sz(16, 10),
                paddingVertical: sz(14, 9),
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View
                style={{
                  width: clockSize,
                  height: clockSize,
                  borderRadius: clockSize / 2,
                  borderWidth: 2,
                  borderColor: GOLD,
                  backgroundColor: CARD,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {[0, 90, 180, 270].map((angle) => (
                  <View
                    key={angle}
                    style={{
                      position: 'absolute',
                      width: 2,
                      height: clockSize * 0.08,
                      backgroundColor: GOLD_SOFT,
                      transform: [{ rotate: `${angle}deg` }, { translateY: -clockSize * 0.4 }],
                    }}
                  />
                ))}
                <View
                  style={{
                    position: 'absolute',
                    width: 3,
                    height: clockSize * 0.24,
                    borderRadius: 2,
                    backgroundColor: CHARCOAL,
                    transform: [{ rotate: `${hourAngle}deg` }, { translateY: -clockSize * 0.12 }],
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    width: 2,
                    height: clockSize * 0.34,
                    borderRadius: 2,
                    backgroundColor: GOLD_DEEP,
                    transform: [{ rotate: `${minuteAngle}deg` }, { translateY: -clockSize * 0.17 }],
                  }}
                />
                <View style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD_DEEP }} />
              </View>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 11), color: CHARCOAL }}>
                {clockLabel}
              </Text>
              <Text
                style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: sz(14, 9),
                  color: minutesLeft <= 15 && minutesLeft > 0 ? '#b3261e' : MUTED,
                  textAlign: 'center',
                }}
              >
                {leftLabel}
              </Text>
              {paceMinutes !== null ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(13, 8), color: MUTED, textAlign: 'center' }}>
                  ≈{paceMinutes} min each for the{'\n'}{slidesLeft} slide{slidesLeft === 1 ? '' : 's'} left
                </Text>
              ) : null}
            </Pressable>
          );
        })()}

        {/* Admin note editor */}
        <Modal
          visible={editKey !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setEditKey(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(49,49,48,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 720,
                backgroundColor: CARD,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                padding: 24,
              }}
            >
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: CHARCOAL }}>
                Edit — {editMeta?.title ?? ''}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: MUTED, marginTop: 4 }}>
                Shows on the slide exactly as written. Line breaks are kept.
              </Text>
              <TextInput
                value={editDraft}
                onChangeText={setEditDraft}
                multiline
                autoFocus
                placeholder={editMeta?.placeholder}
                placeholderTextColor="#b8a888"
                style={{
                  marginTop: 16,
                  minHeight: 220,
                  borderWidth: 1,
                  borderColor: GOLD_SOFT,
                  borderRadius: 14,
                  padding: 14,
                  fontFamily: 'Lato_400Regular',
                  fontSize: 16,
                  lineHeight: 24,
                  color: CHARCOAL,
                  backgroundColor: '#fffefa',
                  textAlignVertical: 'top',
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <Pressable
                  onPress={() => setEditKey(null)}
                  disabled={savingNote}
                  style={({ pressed }) => ({
                    paddingHorizontal: 20,
                    paddingVertical: 11,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: GOLD_SOFT,
                    backgroundColor: pressed ? '#fbf0d7' : CARD,
                  })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: GOLD_DEEP }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void saveNote()}
                  disabled={savingNote}
                  style={({ pressed }) => ({
                    paddingHorizontal: 26,
                    paddingVertical: 11,
                    borderRadius: 12,
                    backgroundColor: GOLD,
                    opacity: pressed || savingNote ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: 'white' }}>
                    {savingNote ? 'Saving…' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Quick-add: pencil in a hang from a tapped calendar day */}
        <Modal
          visible={!!quickAddDate}
          animationType="fade"
          transparent
          onRequestClose={() => setQuickAddDate(null)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onPress={() => setQuickAddDate(null)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 460,
                backgroundColor: PAPER,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                padding: 24,
                gap: 12,
              }}
            >
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: CHARCOAL }}>
                Pencil it in
              </Text>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: GOLD_DEEP }}>
                {quickAddDate ? formatMeetingDate({ title: '', event_date: quickAddDate, event_time: null }) : ''}
              </Text>
              <TextInput
                value={quickAddTitle}
                onChangeText={setQuickAddTitle}
                placeholder="What's the hang? (e.g. Pool day at Charlee's)"
                placeholderTextColor={MUTED}
                autoFocus
                style={{
                  borderWidth: 1,
                  borderColor: GOLD_SOFT,
                  borderRadius: 12,
                  backgroundColor: CARD,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  fontFamily: 'Lato_400Regular',
                  fontSize: 16,
                  color: CHARCOAL,
                }}
              />
              <TextInput
                value={quickAddTime}
                onChangeText={setQuickAddTime}
                placeholder="Time (optional — e.g. 2:30 PM)"
                placeholderTextColor={MUTED}
                onSubmitEditing={handleQuickAddEvent}
                style={{
                  borderWidth: 1,
                  borderColor: GOLD_SOFT,
                  borderRadius: 12,
                  backgroundColor: CARD,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  fontFamily: 'Lato_400Regular',
                  fontSize: 16,
                  color: CHARCOAL,
                }}
              />
              <EventAudienceToggle value={quickAddAudience} onChange={setQuickAddAudience} />
              {quickAddError ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#b3261e' }}>
                  {quickAddError}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <Pressable
                  onPress={() => setQuickAddDate(null)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    borderRadius: 12,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: MUTED }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleQuickAddEvent}
                  disabled={quickAddSaving}
                  style={({ pressed }) => ({
                    paddingHorizontal: 26,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: GOLD,
                    opacity: pressed || quickAddSaving ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: 'white' }}>
                    {quickAddSaving ? 'Adding…' : 'Add to calendar'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* HummDinger spotlight — one member's full story, grid stays put */}
        {renderHummdingerSpotlight()}

        {/* Full meeting scheduler — same one as the Meetings page, seeded
            with the tapped calendar day */}
        <ScheduleMeetingModal
          visible={!!meetingSchedulerDate}
          onClose={() => setMeetingSchedulerDate(null)}
          communityId={communityId ?? null}
          initialDate={meetingSchedulerDate}
          onSchedule={async (data) => {
            await handleScheduleMeetingFromDeck(data);
            setMeetingSchedulerDate(null);
          }}
        />

        {/* Hard-out editor — "anyone got a hard out tonight?" */}
        <Modal
          visible={showHardOutEditor}
          animationType="fade"
          transparent
          onRequestClose={() => setShowHardOutEditor(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onPress={() => setShowHardOutEditor(false)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 420,
                backgroundColor: PAPER,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                padding: 24,
                gap: 12,
              }}
            >
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: CHARCOAL }}>
                Tonight's hard out
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 20, color: MUTED }}>
                When should the countdown aim for? No hard stop — people are always welcome to hang after.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TextInput
                  value={hardOutDraft}
                  onChangeText={setHardOutDraft}
                  placeholder="e.g. 8:00"
                  placeholderTextColor={MUTED}
                  autoFocus
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: GOLD_SOFT,
                    borderRadius: 12,
                    backgroundColor: CARD,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    fontFamily: 'Lato_400Regular',
                    fontSize: 16,
                    color: CHARCOAL,
                  }}
                />
                <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: GOLD_SOFT, borderRadius: 999, overflow: 'hidden' }}>
                  {(['AM', 'PM'] as const).map((meridiem) => (
                    <Pressable
                      key={meridiem}
                      onPress={() => setHardOutMeridiem(meridiem)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        backgroundColor: hardOutMeridiem === meridiem ? GOLD : 'transparent',
                      }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: hardOutMeridiem === meridiem ? 'white' : MUTED }}>
                        {meridiem}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <Pressable
                  onPress={() => setShowHardOutEditor(false)}
                  style={({ pressed }) => ({ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: MUTED }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const normalized = normalizeEventTimeInput(hardOutDraft);
                    if (normalized.time) {
                      let [hour, minute] = normalized.time.split(':').map(Number);
                      // The toggle only kicks in when the text itself didn't
                      // say am/pm — explicit text always wins.
                      if (!/\b(am|pm)\b/i.test(hardOutDraft)) {
                        if (hardOutMeridiem === 'PM' && hour < 12) hour += 12;
                        if (hardOutMeridiem === 'AM' && hour >= 12) hour -= 12;
                      }
                      setHardOutTime(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
                      setShowHardOutEditor(false);
                    }
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 26,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: GOLD,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: 'white' }}>Set</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>

      {/* Frozen agenda rail — clock, outline, and the HummDinger roster */}
      {showRail ? renderRail() : null}
      </View>
    </SafeAreaView>
  );
}
