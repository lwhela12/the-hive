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
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useQueenBee } from '../../lib/hooks/useQueenBee';
import { fetchHoneyPotLedger } from '../../lib/honeyPot';
import { getWishQuickTitle } from '../../lib/wishDisplay';
import { Avatar } from '../../components/ui/Avatar';
import { ArrivalMemberCard } from '../../components/meetings/ArrivalMemberCard';
import {
  formatMeetingDate,
  getFirstName,
  getLocalIsoDate,
  getMonthNameFromPeriod,
  getNumberAnswer,
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
  'Welcome',
  'News from Nat',
  'Cabinet Reports',
  'Meet Ups',
  'Check-in Highlights',
  'HummDinger',
  'Wrap-Up',
];

const HUMMDINGER_FORMULA = [
  'Where I am',
  'Where I want to be',
  "What I've tried",
  "Where I'm blocked",
];

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

type NamedLine = { memberName: string; text: string };

const EDIT_SLIDE_META: Record<EditableNoteKey, { title: string; placeholder: string }> = {
  news: {
    title: 'News from Nat',
    placeholder: "What's the news this month? Announcements, celebrations, house business…",
  },
  meetups: {
    title: 'Meet Ups',
    placeholder: "This month's plans — who's hosting the hang, help requests, meeting notes…",
  },
  wrapup: {
    title: 'Wrap-Up',
    placeholder: 'Final notes, decisions made tonight, things to remember…',
  },
};

function formatShortDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatBalance(balance: number) {
  return `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MeetingHelperScreen() {
  const router = useRouter();
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

  const { currentQueenBee, refresh: refreshQueenBee } = useQueenBee();

  // Deck data — loaded once on mount, refreshed via the subtle refresh button.
  const [notes, setNotes] = useState<MeetingHelperNotes>({});
  const [events, setEvents] = useState<DeckEvent[]>([]);
  const [honeyPotBalance, setHoneyPotBalance] = useState<number | null>(null);
  const [hangIdeas, setHangIdeas] = useState<HangIdea[]>([]);
  const [wishes, setWishes] = useState<DeckWish[]>([]);
  const [deckRefreshing, setDeckRefreshing] = useState(false);

  const loadDeckData = useCallback(async () => {
    if (!communityId) return;

    const today = getLocalIsoDate(new Date());
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 35);

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

      // Historian: birthdays + events for the next ~35 days
      (async () => {
        const { data } = await supabase
          .from('events')
          .select('id, title, event_date, event_time, event_type')
          .eq('community_id', communityId)
          .gte('event_date', today)
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
          .eq('status', 'public');
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
    ]);
  }, [communityId]);

  useEffect(() => {
    void loadDeckData();
  }, [loadDeckData]);

  const refreshDeck = useCallback(async () => {
    if (deckRefreshing) return;
    setDeckRefreshing(true);
    try {
      await Promise.all([loadDeckData(), refreshArrivals(), refreshQueenBee()]);
    } finally {
      setDeckRefreshing(false);
    }
  }, [deckRefreshing, loadDeckData, refreshArrivals, refreshQueenBee]);

  // Check-in aggregation for Highlights + POP slides (from the same live
  // responses the arrival cards use).
  const checkIn = useMemo(() => {
    const energyValues: number[] = [];
    const modeCounts = new Map<string, number>();
    const topics: NamedLine[] = [];
    const progress: NamedLine[] = [];
    const obstacles: NamedLine[] = [];
    const priorities: NamedLine[] = [];

    members.forEach((member) => {
      const response = responsesByUser.get(member.id);
      if (!response) return;
      const answers = response.answers ?? {};
      const memberName = getFirstName(member.name);

      const energy = getNumberAnswer(answers, 'q_energy_level');
      if (energy !== null) energyValues.push(energy);

      const mode = getTextAnswer(answers, 'q_energy_mode');
      if (mode) modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);

      const pushIf = (list: NamedLine[], key: string) => {
        const text = getTextAnswer(answers, key);
        if (text) list.push({ memberName, text });
      };
      pushIf(topics, 'q_meeting_topic');
      pushIf(progress, 'q_pop_progress');
      pushIf(obstacles, 'q_pop_obstacles');
      pushIf(priorities, 'q_pop_priorities');
    });

    const energyAverage = energyValues.length
      ? energyValues.reduce((sum, value) => sum + value, 0) / energyValues.length
      : null;
    const modes = Array.from(modeCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return { energyAverage, energyCount: energyValues.length, modes, topics, progress, obstacles, priorities };
  }, [members, responsesByUser]);

  const wishesByMember = useMemo(() => {
    const grouped = new Map<string, DeckWish[]>();
    wishes.forEach((wish) => {
      const list = grouped.get(wish.memberName) ?? [];
      list.push(wish);
      grouped.set(wish.memberName, list);
    });
    return Array.from(grouped.entries());
  }, [wishes]);

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

  const NameLine = useCallback(({ line }: { line: NamedLine }) => (
    <Text
      style={{
        fontFamily: 'Lato_400Regular',
        fontSize: sz(24, 15),
        lineHeight: sz(36, 23),
        color: CHARCOAL,
      }}
    >
      <Text style={{ fontFamily: 'Lato_700Bold', color: GOLD_DEEP }}>{line.memberName}: </Text>
      {line.text}
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
          <Kicker>From our founder</Kicker>
          <SlideTitle>News from Nat</SlideTitle>
        </View>
        <EditPill noteKey="news" />
      </View>
      <NoteBody
        noteKey="news"
        emptyText="Nat hasn't dropped the news yet — drumroll, please."
      />
    </View>
  );

  const renderHistorian = () => {
    const birthdays = events.filter((event) => event.event_type === 'birthday');
    const otherEvents = events.filter((event) => event.event_type !== 'birthday');
    const EventRows = ({ rows, emptyText }: { rows: DeckEvent[]; emptyText: string }) =>
      rows.length === 0 ? (
        <EmptyNote>{emptyText}</EmptyNote>
      ) : (
        <View style={{ gap: sz(16, 10) }}>
          {rows.map((event) => (
            <View key={event.id} style={{ flexDirection: 'row', alignItems: 'baseline', gap: sz(18, 10) }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(21, 13), color: GOLD_DEEP, width: sz(160, 100) }}>
                {formatShortDate(event.event_date)}
              </Text>
              <Text style={{ flex: 1, fontFamily: 'Lato_400Regular', fontSize: sz(24, 15), color: CHARCOAL }}>
                {event.title}
              </Text>
            </View>
          ))}
        </View>
      );

    return (
      <View style={{ flex: 1 }}>
        <Kicker>Cabinet Reports</Kicker>
        <SlideTitle>Historian Report — Charlee</SlideTitle>
        <View style={{ flexDirection: isTV ? 'row' : 'column', gap: sz(70, 28), marginTop: sz(40, 22) }}>
          <View style={{ flex: 1, gap: sz(20, 12) }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 13), letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>
              Birthdays ahead
            </Text>
            <EventRows rows={birthdays} emptyText="No birthdays in the next few weeks — the cake tin gets a rest." />
          </View>
          <View style={{ flex: 1, gap: sz(20, 12) }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 13), letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>
              Coming up
            </Text>
            <EventRows rows={otherEvents} emptyText="Nothing on the calendar yet — a blank page for the historian." />
          </View>
        </View>
      </View>
    );
  };

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

  const renderMeetups = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: sz(30, 18) }}>
        <View>
          <Kicker>Ways we gather</Kicker>
          <SlideTitle>Meet Ups</SlideTitle>
        </View>
        <EditPill noteKey="meetups" />
      </View>
      <View style={{ flexDirection: isTV ? 'row' : 'column', gap: sz(24, 12) }}>
        {MEETUP_COLUMNS.map((column) => (
          <View
            key={column.title}
            style={{
              flex: 1,
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(22, 16),
              padding: sz(28, 16),
            }}
          >
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(30, 18), color: GOLD_DEEP }}>
              {column.title}
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 20), color: MUTED, marginTop: sz(10, 6) }}>
              {column.blurb}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: sz(34, 18) }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 13), letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: sz(12, 8) }}>
          This month
        </Text>
        <NoteBody
          noteKey="meetups"
          emptyText="No meet-up plans written down yet — hatch some tonight."
        />
      </View>
      <View style={{ marginTop: sz(30, 18) }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 13), letterSpacing: 2, textTransform: 'uppercase', color: GOLD, marginBottom: sz(12, 8) }}>
          Fresh hang ideas
        </Text>
        {hangIdeas.length === 0 ? (
          <EmptyNote>No new ideas on the hang board yet — first one to post picks the venue.</EmptyNote>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(14, 8) }}>
            {hangIdeas.map((idea) => (
              <View
                key={idea.id}
                style={{
                  backgroundColor: 'rgba(222,193,129,0.18)',
                  borderRadius: 999,
                  paddingHorizontal: sz(22, 14),
                  paddingVertical: sz(10, 7),
                }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 13), color: GOLD_DEEP }}>
                  {(idea.title ?? 'Untitled idea').trim() || 'Untitled idea'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  const renderHighlights = () => (
    <View style={{ flex: 1 }}>
      <Kicker>Monthly check-in</Kicker>
      <SlideTitle>Check-in Highlights</SlideTitle>
      <View style={{ flexDirection: isTV ? 'row' : 'column', gap: sz(70, 28), marginTop: sz(40, 22) }}>
        <View style={{ width: isTV ? 420 : undefined, gap: sz(18, 10) }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 13), letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>
            Energy
          </Text>
          {checkIn.energyAverage === null ? (
            <EmptyNote>No energy readings yet — everyone must be conserving it.</EmptyNote>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: sz(12, 8) }}>
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(84, 42), color: GOLD }}>
                  {checkIn.energyAverage.toFixed(1)}
                </Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(24, 14), color: MUTED }}>
                  / 10 average · {checkIn.energyCount} check-in{checkIn.energyCount === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={{ gap: sz(10, 6), marginTop: sz(8, 4) }}>
                {checkIn.modes.map((mode) => (
                  <View key={mode.label} style={{ flexDirection: 'row', alignItems: 'center', gap: sz(12, 8) }}>
                    <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(22, 14), color: GOLD_DEEP, width: sz(46, 30) }}>
                      ×{mode.count}
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(24, 15), color: CHARCOAL }}>
                      {mode.label}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
        <View style={{ flex: 1, gap: sz(18, 10) }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 13), letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>
            Bring to the meeting
          </Text>
          {checkIn.topics.length === 0 ? (
            <EmptyNote>No meeting topics submitted — the floor is wide open.</EmptyNote>
          ) : (
            <View style={{ gap: sz(16, 10) }}>
              {checkIn.topics.map((line, index) => (
                <NameLine key={`${line.memberName}-${index}`} line={line} />
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );

  const renderPop = (label: string, sub: string, lines: NamedLine[], emptyText: string) => () => (
    <View style={{ flex: 1 }}>
      <Kicker>{`P.O.P. — ${sub}`}</Kicker>
      <SlideTitle>{label}</SlideTitle>
      <View style={{ marginTop: sz(36, 20) }}>
        {lines.length === 0 ? (
          <EmptyNote>{emptyText}</EmptyNote>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: sz(-24, 0) }}>
            {lines.map((line, index) => (
              <View
                key={`${line.memberName}-${index}`}
                style={{
                  width: isTV && lines.length > 4 ? '50%' : '100%',
                  paddingHorizontal: sz(24, 0),
                  paddingBottom: sz(22, 12),
                }}
              >
                <NameLine line={line} />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  const renderHummdinger = () => (
    <View style={{ flex: 1 }}>
      <Kicker>Spotlight</Kicker>
      <SlideTitle>HummDinger</SlideTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(14, 8), marginTop: sz(30, 16) }}>
        {HUMMDINGER_FORMULA.map((step, index) => (
          <View
            key={step}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: sz(10, 6),
              backgroundColor: 'rgba(222,193,129,0.18)',
              borderRadius: 999,
              paddingHorizontal: sz(22, 13),
              paddingVertical: sz(11, 7),
            }}
          >
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(20, 12), color: GOLD }}>
              {index + 1}
            </Text>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(21, 13), color: GOLD_DEEP }}>
              {step}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {currentQueenBee ? (
          <View
            style={{
              flexDirection: isTV ? 'row' : 'column',
              alignItems: 'center',
              gap: sz(40, 18),
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(28, 18),
              padding: sz(44, 22),
            }}
          >
            <Avatar
              name={currentQueenBee.user?.name ?? 'Queen Bee'}
              url={currentQueenBee.user?.avatar_url ?? null}
              size={sz(150, 84)}
            />
            <View style={{ flex: isTV ? 1 : undefined, alignItems: isTV ? 'flex-start' : 'center' }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(19, 12), letterSpacing: 3, textTransform: 'uppercase', color: GOLD }}>
                {monthName}'s Queen Bee
              </Text>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(48, 24), color: CHARCOAL, marginTop: sz(8, 4), textAlign: isTV ? 'left' : 'center' }}>
                {currentQueenBee.user?.name ?? 'Our Queen Bee'}
              </Text>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(28, 16), color: GOLD_DEEP, marginTop: sz(12, 8), textAlign: isTV ? 'left' : 'center' }}>
                {currentQueenBee.project_title}
              </Text>
              {currentQueenBee.project_description ? (
                <Text
                  numberOfLines={4}
                  style={{ fontFamily: 'Lato_400Regular', fontSize: sz(22, 14), lineHeight: sz(33, 21), color: MUTED, marginTop: sz(10, 6), textAlign: isTV ? 'left' : 'center' }}
                >
                  {currentQueenBee.project_description}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <EmptyNote>No Queen Bee crowned for {monthName} yet — the throne is warm and waiting.</EmptyNote>
        )}
      </View>
    </View>
  );

  const renderWishes = () => (
    <View style={{ flex: 1 }}>
      <Kicker>High-definition wishing</Kicker>
      <SlideTitle>Member HDs</SlideTitle>
      <View style={{ marginTop: sz(36, 20) }}>
        {wishesByMember.length === 0 ? (
          <EmptyNote>No public wishes on the board right now — time to dream in high definition.</EmptyNote>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: sz(-28, 0) }}>
            {wishesByMember.map(([memberName, memberWishes]) => (
              <View
                key={memberName}
                style={{
                  width: isTV ? '50%' : '100%',
                  paddingHorizontal: sz(28, 0),
                  paddingBottom: sz(28, 16),
                }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(25, 15), color: GOLD_DEEP, marginBottom: sz(8, 5) }}>
                  {getFirstName(memberName)}
                </Text>
                {memberWishes.map((wish) => (
                  <Text
                    key={wish.id}
                    style={{ fontFamily: 'Lato_400Regular', fontSize: sz(23, 14), lineHeight: sz(35, 22), color: CHARCOAL }}
                  >
                    — {getWishQuickTitle(wish, 72)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  const WRAPUP_REMINDERS = [
    'Next meeting — second Wednesday of the month',
    'Newsletter lands on the 1st',
    'Dues: $25 / quarter · CashApp $HiveLV',
    'Crown the next Queen Bee before we leave',
  ];

  const renderWrapup = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: sz(30, 18) }}>
        <View>
          <Kicker>Before we go</Kicker>
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
    { key: 'historian', render: renderHistorian },
    { key: 'treasurer', render: renderTreasurer },
    { key: 'meetups', render: renderMeetups },
    { key: 'highlights', render: renderHighlights },
    {
      key: 'pop-progress',
      render: renderPop('Progress', 'wins since last month', checkIn.progress, 'Nothing logged yet — perfect attendance at the snack table.'),
    },
    {
      key: 'pop-obstacles',
      render: renderPop('Obstacles', "what's in the way", checkIn.obstacles, 'No obstacles reported — suspiciously smooth sailing.'),
    },
    {
      key: 'pop-priorities',
      render: renderPop('Priorities', 'what matters next', checkIn.priorities, 'No priorities submitted yet — the month is a blank canvas.'),
    },
    { key: 'hummdinger', render: renderHummdinger },
    { key: 'wishes', render: renderWishes },
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
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/meetings'))}
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
      </View>
    </SafeAreaView>
  );
}
