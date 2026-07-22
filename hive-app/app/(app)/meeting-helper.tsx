import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '../../lib/hooks/useAuth';
import { fetchHoneyPotLedger } from '../../lib/honeyPot';
import { getWishQuickTitle } from '../../lib/wishDisplay';
import { Avatar } from '../../components/ui/Avatar';
import { ArrivalMemberCard } from '../../components/meetings/ArrivalMemberCard';
import {
  formatMeetingDate,
  getFirstName,
  getLocalIsoDate,
  getMonthNameFromPeriod,
  getTextAnswer,
  useArrivalBoard,
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

const AGENDA = [
  'News from Nat',
  'Treasurer',
  'Plan the Meet Ups',
  'HummDinger Sesh',
  'Wrap-Up',
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
};

type HangIdea = {
  id: string;
  title: string | null;
};

type GrantedWish = {
  id: string;
  title: string | null;
  description: string;
  granterNames: string[];
};

const EDIT_SLIDE_META: Record<EditableNoteKey, { title: string; placeholder: string }> = {
  news: {
    title: 'News from Nat',
    placeholder: "What's the news this month? Announcements, celebrations, house business…",
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
  const { communityId, communityRole, profile } = useAuth();
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
  const [helperPosts, setHelperPosts] = useState<HangIdea[]>([]);
  const [completedAssists, setCompletedAssists] = useState<
    { id: string; description: string; assignedTo: string | null; relatedUserId: string | null; assigneeName: string }[]
  >([]);
  const [deckRefreshing, setDeckRefreshing] = useState(false);

  // HummDinger: which member's full check-in is expanded on the bubbles grid.
  const [expandedHummdingerId, setExpandedHummdingerId] = useState<string | null>(null);

  // Live meeting notes typed into an expanded HummDinger card. "@name" routes
  // the note onto that member's to-do list; no @ = the expanded member's list.
  const [liveNoteDraft, setLiveNoteDraft] = useState('');
  const [liveNoteSaving, setLiveNoteSaving] = useState(false);
  const [liveNoteConfirmation, setLiveNoteConfirmation] = useState<string | null>(null);

  // Gentle timekeeper: a clock pill with time-'til-hard-out (default 8pm,
  // tap to change) and a soft per-remaining-slide pace hint — enough to say
  // "peep the time!" without anyone feeling on the clock.
  const [hardOutTime, setHardOutTime] = useState('20:00');
  const [hardOutDraft, setHardOutDraft] = useState('');
  const [showHardOutEditor, setShowHardOutEditor] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setClockNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // Quick-add: tap a calendar day on Plan the Meet Ups to pencil in a hang.
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddTime, setQuickAddTime] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const loadDeckData = useCallback(async () => {
    if (!communityId) return;

    const today = getLocalIsoDate(new Date());
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 75);
    const sinceLastMeeting = new Date();
    sinceLastMeeting.setDate(sinceLastMeeting.getDate() - 35);
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
          .select('id, title, description, status, is_active, user_id, user:profiles!user_id(id, name)')
          .eq('community_id', communityId)
          .eq('status', 'public')
          // Newest first so members with several active wishes lead with this
          // month's HD on the HummDinger bubbles.
          .order('created_at', { ascending: false });
        const rows = ((data ?? []) as any[])
          .filter((wish) => wish.is_active !== false)
          .map((wish) => ({
            id: wish.id as string,
            title: (wish.title ?? null) as string | null,
            description: (wish.description ?? '') as string,
            user_id: wish.user_id as string,
            memberName: (wish.user?.name ?? 'Someone') as string,
          }))
          .sort((a, b) => a.memberName.localeCompare(b.memberName));
        setWishes(rows);
      })().catch((error) => console.warn('Could not load wishes', error)),

      // Kudos: wishes granted since the last meeting (~35 days), with granters
      (async () => {
        const { data } = await (supabase as any)
          .from('wishes')
          .select('id, title, description, fulfilled_at, granters:wish_granters(granter_id, granter:profiles!granter_id(name))')
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
          granterNames: ((wish.granters ?? []) as any[])
            .map((granter) => (granter.granter?.name ? getFirstName(granter.granter.name) : null))
            .filter((name: string | null): name is string => !!name),
        }));
        setGrantedWishes(rows);
      })().catch((error) => console.warn('Could not load granted wishes', error)),

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

  // Go-around order: Lucas leads by example (his call — he thanks everyone,
  // so the sesh must reach him), then checked-in members in the order they
  // submitted (a different voice order each month), then the rest.
  const memberOrder = useMemo(() => {
    const lucas = members.find((member) => getFirstName(member.name).toLowerCase() === 'lucas');
    const others = members.filter((member) => member.id !== lucas?.id);
    const checkedIn = others
      .filter((member) => responsesByUser.has(member.id))
      .sort((a, b) => {
        const aTime = responsesByUser.get(a.id)?.submitted_at ?? '';
        const bTime = responsesByUser.get(b.id)?.submitted_at ?? '';
        return aTime.localeCompare(bTime);
      });
    const notYet = others.filter((member) => !responsesByUser.has(member.id));
    return [...(lucas ? [lucas] : []), ...checkedIn, ...notYet];
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

      const { error } = await supabase.functions.invoke('create-event', { body: newEvent });
      if (error) throw error;

      setQuickAddDate(null);
      setQuickAddTitle('');
      setQuickAddTime('');
      await loadDeckData();
    } catch (error: any) {
      setQuickAddError(error?.message || 'Could not save the event — please try again.');
    } finally {
      setQuickAddSaving(false);
    }
  };

  // Live meeting notes from an expanded HummDinger card. "@name" puts the
  // note on that member's to-do list (several @s fan out); no @ = the list of
  // whoever's card is open.
  const handleSaveLiveNote = async (aboutMember: { id: string; name: string }) => {
    const text = liveNoteDraft.trim();
    if (!text || !communityId || liveNoteSaving) return;

    const mentioned = [...text.matchAll(/@([a-zA-Z]+)/g)].map((match) => match[1].toLowerCase());
    const targets = members.filter((member) => mentioned.includes(getFirstName(member.name).toLowerCase()));
    const assignees = targets.length > 0 ? targets : members.filter((member) => member.id === aboutMember.id);
    if (assignees.length === 0) return;

    setLiveNoteSaving(true);
    try {
      const { error } = await (supabase as any).from('action_items').insert(
        assignees.map((member) => ({
          description:
            member.id === aboutMember.id
              ? text
              : `${text} (re: ${getFirstName(aboutMember.name)}'s HummDinger)`,
          assigned_to: member.id,
          community_id: communityId,
          related_user_id: aboutMember.id,
        }))
      );
      if (error) throw error;
      setLiveNoteConfirmation(`On ${assignees.map((member) => getFirstName(member.name)).join(' & ')}'s list ✓`);
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
      <Pressable
        onPress={() => openNoteEditor(noteKey)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${EDIT_SLIDE_META[noteKey].title}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          paddingHorizontal: sz(18, 12),
          paddingVertical: sz(9, 6),
          borderRadius: 999,
          borderWidth: 1,
          borderColor: GOLD_SOFT,
          backgroundColor: pressed ? '#fbf0d7' : CARD,
        })}
      >
        <Ionicons name="pencil" size={sz(18, 13)} color={GOLD_DEEP} />
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 12), color: GOLD_DEEP }}>
          Edit
        </Text>
      </Pressable>
    );
  }, [isAdmin, openNoteEditor, sz]);

  const NoteBody = useCallback(({ noteKey, emptyText }: { noteKey: EditableNoteKey; emptyText: string }) => {
    const value = (notes[noteKey] ?? '').trim();
    if (!value) return <EmptyNote>{emptyText}</EmptyNote>;
    return (
      <Text
        style={{
          fontFamily: 'Lato_400Regular',
          fontSize: sz(28, 16),
          lineHeight: sz(44, 26),
          color: CHARCOAL,
        }}
      >
        {value}
      </Text>
    );
  }, [EmptyNote, notes, sz]);

  // ---- Slides ----
  const renderWelcome = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={hiveLogo}
        style={{ width: sz(460, 240), height: sz(300, 160) }}
        contentFit="contain"
      />
      <Text
        style={{
          fontFamily: 'LibreBaskerville_700Bold',
          fontSize: sz(66, 32),
          lineHeight: sz(82, 42),
          color: CHARCOAL,
          textAlign: 'center',
          marginTop: sz(30, 18),
        }}
      >
        {monthName} {meetingYear} Meeting
      </Text>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(26, 15), color: GOLD_DEEP, marginTop: sz(18, 10) }}>
        {meetingLine}
      </Text>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), color: MUTED, marginTop: sz(14, 8) }}>
        We'll begin shortly — grab a plate and check in.
      </Text>
    </View>
  );

  const roomColumns = isTV ? 5 : width >= 1024 ? 4 : width >= 760 ? 3 : width >= 480 ? 2 : 1;
  const renderRoom = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: sz(18, 10), marginBottom: sz(24, 14) }}>
        <View style={{ flex: 1, minWidth: 240 }}>
          <Kicker>Arrivals</Kicker>
          <SlideTitle>Who's in the room</SlideTitle>
        </View>
        {survey ? (
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(22, 13), color: MUTED, paddingBottom: sz(10, 4) }}>
            {checkedInCount} of {members.length} checked in
            {lastUpdatedAt ? '  ·  live' : ''}
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: sz(-8, -5) }}>
          {members.map((member) => (
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
      )}
    </View>
  );

  const renderOutline = () => (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Kicker>Tonight</Kicker>
      <SlideTitle>Outline</SlideTitle>
      <View style={{ marginTop: sz(40, 22), gap: sz(20, 12) }}>
        {AGENDA.map((item, index) => (
          <View key={item} style={{ flexDirection: 'row', alignItems: 'baseline', gap: sz(24, 14) }}>
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
              {item}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderNews = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: sz(36, 20) }}>
        <View>
          <Kicker>Progress · credit where credit is due</Kicker>
          <SlideTitle>News from Nat</SlideTitle>
        </View>
        <EditPill noteKey="news" />
      </View>
      <NoteBody
        noteKey="news"
        emptyText="Nat hasn't dropped the news yet — drumroll, please."
      />
      <View style={{ marginTop: sz(40, 22) }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 13), letterSpacing: 2, textTransform: 'uppercase', color: GOLD, marginBottom: sz(14, 9) }}>
          🌟 Wishes granted since last meeting
        </Text>
        {grantedWishes.length === 0 ? (
          <EmptyNote>No wishes granted since we last met — plenty of wands still charged.</EmptyNote>
        ) : (
          <View style={{ gap: sz(14, 9) }}>
            {grantedWishes.map((wish) => (
              <Text
                key={wish.id}
                style={{ fontFamily: 'Lato_400Regular', fontSize: sz(24, 15), lineHeight: sz(36, 23), color: CHARCOAL }}
              >
                {getWishQuickTitle(wish, 72)}
                {wish.granterNames.length > 0 ? (
                  <Text style={{ fontFamily: 'Lato_700Bold', color: GOLD_DEEP }}>
                    {'  —  granted by '}{wish.granterNames.join(' & ')}
                  </Text>
                ) : null}
              </Text>
            ))}
          </View>
        )}
      </View>
      {helperPosts.length > 0 ? (
        <View style={{ marginTop: sz(30, 18) }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(18, 12), letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: sz(12, 8) }}>
            🤝 15-minute helpers this month
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(14, 8) }}>
            {helperPosts.map((post) => (
              <View
                key={post.id}
                style={{
                  backgroundColor: 'rgba(222,193,129,0.18)',
                  borderRadius: 999,
                  paddingHorizontal: sz(22, 14),
                  paddingVertical: sz(10, 7),
                }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(19, 12), color: GOLD_DEEP }}>
                  {(post.title ?? 'A quiet favor').trim() || 'A quiet favor'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
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
    { title: 'HIVE Meeting', blurb: 'Second Wednesday — dinner, business, and the HummDinger.' },
    { title: 'HIVE Hang', blurb: 'Casual get-togethers between meetings. Anyone can host.' },
    { title: 'HIVE Help', blurb: 'Fifteen-minute favors — small asks, quick wins.' },
  ];

  // Plan the Meet Ups: how we gather across the top, then a classic two-month
  // calendar (this month + next, side by side on the TV) painted with what's
  // already on the HIVE calendar. Tap any upcoming day to pencil in a hang
  // right from the deck — no tab-juggling mid-meeting.
  const renderMeetups = () => {
    const todayIso = getLocalIsoDate(new Date());
    const today = new Date();
    const monthStarts = [
      new Date(today.getFullYear(), today.getMonth(), 1),
      new Date(today.getFullYear(), today.getMonth() + 1, 1),
    ];

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

      return (
        <View key={monthStart.toISOString()} style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(26, 16), color: CHARCOAL, marginBottom: sz(8, 5) }}>
            {monthStart.toLocaleDateString('en-US', { month: 'long' })}
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
                        setQuickAddDate(dayIso);
                        setQuickAddTitle('');
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

        {/* Top: the three ways we gather, side by side */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(16, 8) }}>
          {MEETUP_COLUMNS.map((column) => (
            <View
              key={column.title}
              style={{
                flex: 1,
                minWidth: sz(260, 150),
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                borderRadius: sz(18, 14),
                paddingHorizontal: sz(22, 14),
                paddingVertical: sz(14, 10),
              }}
            >
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(24, 16), color: GOLD_DEEP }}>
                {column.title}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 12), lineHeight: sz(25, 18), color: MUTED, marginTop: sz(4, 3) }}>
                {column.blurb}
              </Text>
            </View>
          ))}
        </View>

        {/* Middle: this month and next, side by side on the TV */}
        <View style={{ flexDirection: isTV ? 'row' : 'column', gap: sz(28, 14), marginTop: sz(22, 12) }}>
          {monthStarts.map(renderMonth)}
        </View>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(16, 11), color: MUTED, marginTop: sz(10, 7) }}>
          🐝 meeting · 🎂 birthday · little faces → = who's away · 📌 event — tap any open day to pencil in a hang right here.
        </Text>

        {/* Bottom: this month's plans + fresh ideas */}
        <View style={{ flexDirection: isTV ? 'row' : 'column', gap: sz(40, 16), marginTop: sz(16, 10) }}>
          <View style={{ flex: isTV ? 1 : undefined }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(18, 12), letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: sz(10, 7) }}>
              This month
            </Text>
            <NoteBody
              noteKey="meetups"
              emptyText="No meet-up plans written down yet — hatch some tonight."
            />
          </View>
          <View style={{ flex: isTV ? 1 : undefined }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(18, 12), letterSpacing: 2, textTransform: 'uppercase', color: GOLD, marginBottom: sz(10, 7) }}>
              Fresh hang ideas
            </Text>
            {hangIdeas.length === 0 ? (
              <EmptyNote>No new ideas on the hang board yet — first one to post picks the venue.</EmptyNote>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(12, 8) }}>
                {hangIdeas.map((idea) => (
                  <View
                    key={idea.id}
                    style={{
                      backgroundColor: 'rgba(222,193,129,0.18)',
                      borderRadius: 999,
                      paddingHorizontal: sz(20, 14),
                      paddingVertical: sz(9, 7),
                    }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(18, 13), color: GOLD_DEEP }}>
                      {(idea.title ?? 'Untitled idea').trim() || 'Untitled idea'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
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

      {/* Compact POP-formula header — the talking points for the go-around */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(16, 8), marginTop: sz(20, 12) }}>
        {POP_SECTIONS.map((section) => (
          <View
            key={section.key}
            style={{
              flex: 1,
              minWidth: sz(240, 150),
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(16, 12),
              paddingHorizontal: sz(22, 13),
              paddingVertical: sz(14, 9),
            }}
          >
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(24, 15), color: CHARCOAL }}>
              {section.label}
            </Text>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 11), lineHeight: sz(24, 15), color: GOLD_DEEP, marginTop: sz(4, 2) }}>
              {section.prompt}
            </Text>
          </View>
        ))}
      </View>

      {/* Member bubbles — one per member, uniform size so no one looks
          emptier. Tap a bubble to expand the full check-in (and tap again to
          tuck it away) — thorough write-ups get their moment without empty
          ones being singled out. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: sz(-8, -5), marginTop: sz(28, 16) }}>
        {memberOrder.map((member) => {
          const response = responsesByUser.get(member.id);
          const answers = response?.answers ?? {};
          const nameToday = getTextAnswer(answers, 'q_name_today') || getFirstName(member.name);
          const memberWishes = wishesByUserId.get(member.id) ?? [];
          const topWish = memberWishes[0];
          const hdGoal = topWish ? getWishQuickTitle(topWish, 40) : null;
          const priorities = getTextAnswer(answers, 'q_pop_priorities');
          const detailSections = HUMMDINGER_DETAIL_SECTIONS
            .map((section) => ({ ...section, text: getTextAnswer(answers, section.key) }))
            .filter((section) => !!section.text);
          const assistsForMember = completedAssists.filter(
            (assist) => assist.relatedUserId === member.id && assist.assignedTo !== member.id
          );
          const assistsByMember = completedAssists.filter((assist) => assist.assignedTo === member.id);
          const hasDetails =
            detailSections.length > 0 || !!topWish?.description || assistsForMember.length > 0 || assistsByMember.length > 0;
          const isExpanded = expandedHummdingerId === member.id;
          return (
            <View
              key={member.id}
              style={{ width: isExpanded ? '100%' : `${100 / bubbleColumns}%`, padding: sz(8, 5) }}
            >
              <Pressable
                onPress={() => {
                  if (!hasDetails || isExpanded) return;
                  setExpandedHummdingerId(member.id);
                  setLiveNoteDraft('');
                  setLiveNoteConfirmation(null);
                }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  backgroundColor: CARD,
                  borderWidth: isExpanded ? 2 : 1,
                  borderColor: isExpanded ? GOLD : GOLD_SOFT,
                  borderRadius: sz(20, 14),
                  paddingHorizontal: sz(16, 10),
                  paddingVertical: sz(20, 13),
                }}
              >
                <Avatar name={member.name} url={member.avatar_url} size={sz(72, 48)} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'LibreBaskerville_700Bold',
                    fontSize: sz(24, 15),
                    color: CHARCOAL,
                    marginTop: sz(12, 8),
                    textAlign: 'center',
                  }}
                >
                  {nameToday}
                </Text>
                <Text
                  numberOfLines={isExpanded ? undefined : 2}
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
                {!isExpanded && priorities ? (
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
                {isExpanded ? (
                  <View style={{ alignSelf: 'stretch', marginTop: sz(16, 10), gap: sz(12, 8) }}>
                    {topWish?.description ? (
                      <View>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD, marginBottom: sz(4, 3) }}>
                          This month's HD
                        </Text>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 12), lineHeight: sz(25, 17), color: CHARCOAL }}>
                          {topWish.description}
                        </Text>
                      </View>
                    ) : null}
                    {detailSections.map((section) => (
                      <View key={section.key}>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD, marginBottom: sz(4, 3) }}>
                          {section.label}
                        </Text>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 12), lineHeight: sz(25, 17), color: CHARCOAL }}>
                          {section.text}
                        </Text>
                      </View>
                    ))}
                    {assistsForMember.length > 0 ? (
                      <View>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD, marginBottom: sz(4, 3) }}>
                          Done for {getFirstName(member.name)} this cycle 💛
                        </Text>
                        {assistsForMember.map((assist) => (
                          <Text key={assist.id} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 12), lineHeight: sz(25, 17), color: CHARCOAL }}>
                            {getFirstName(assist.assigneeName)}: {assist.description}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {assistsByMember.length > 0 ? (
                      <View>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD, marginBottom: sz(4, 3) }}>
                          {getFirstName(member.name)} checked off ✓
                        </Text>
                        {assistsByMember.map((assist) => (
                          <Text key={assist.id} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 12), lineHeight: sz(25, 17), color: CHARCOAL }}>
                            {assist.description}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {/* Live note → to-do lists, typed as the room talks */}
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderColor: GOLD_SOFT,
                        paddingTop: sz(12, 8),
                        gap: sz(8, 6),
                      }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD }}>
                        Live note → to-do list
                      </Text>
                      <TextInput
                        value={liveNoteDraft}
                        onChangeText={(value) => {
                          setLiveNoteDraft(value);
                          if (liveNoteConfirmation) setLiveNoteConfirmation(null);
                        }}
                        placeholder={`e.g. "@${getFirstName(member.name)} intro Brit to your PMU contact" — @name puts it on their list, no @ lands on ${getFirstName(member.name)}'s`}
                        placeholderTextColor={MUTED}
                        multiline
                        style={{
                          borderWidth: 1,
                          borderColor: GOLD_SOFT,
                          borderRadius: sz(12, 9),
                          backgroundColor: PAPER,
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
                          onPress={() => handleSaveLiveNote(member)}
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
                    </View>
                    <Pressable onPress={() => setExpandedHummdingerId(null)} hitSlop={8}>
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(14, 10), color: MUTED, textAlign: 'center' }}>
                        tap to tuck away ↑
                      </Text>
                    </Pressable>
                  </View>
                ) : hasDetails ? (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(13, 9), color: MUTED, marginTop: sz(8, 5) }}>
                    tap for the full story ↓
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );

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
    { key: 'welcome', render: renderWelcome },
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAPER }} edges={['top']}>
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

        {/* Timekeeper — a little analog clock in a right-side panel, with the
            countdown to tonight's hard-out. Tap to change the hard-out. The
            per-slide pace hint only appears once the meeting is actually
            near (within 3h of the hard-out) — at lunchtime it's noise. */}
        {(() => {
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
              <TextInput
                value={hardOutDraft}
                onChangeText={setHardOutDraft}
                placeholder="e.g. 8:00 PM"
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
                      setHardOutTime(normalized.time);
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
    </SafeAreaView>
  );
}
