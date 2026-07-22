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
  { key: 'q_pop_priorities', label: 'Priorities', prompt: "what's your focus this month?" },
] as const;

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
  const [deckRefreshing, setDeckRefreshing] = useState(false);

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

  // Go-around order: checked-in members first, then the rest (both alphabetical).
  const memberOrder = useMemo(() => {
    const checkedIn = members.filter((member) => responsesByUser.has(member.id));
    const notYet = members.filter((member) => !responsesByUser.has(member.id));
    return [...checkedIn, ...notYet];
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

  // Plan the Meet Ups + Upcoming Dates, merged: a light calendar of the
  // stretch between tonight and the next meeting, painted with what's already
  // on the HIVE calendar (meetings, birthdays, out-of-town stretches), so the
  // open days — the best hang candidates — are visible at a glance.
  const renderMeetups = () => {
    const todayIso = getLocalIsoDate(new Date());
    const parseIsoDay = (iso: string) => {
      const [year, month, day] = iso.split('-').map(Number);
      return new Date(year, month - 1, day);
    };

    // Meetings run mid-month to mid-month, so one cycle straddles two calendar
    // months — show through the meeting after next (or ~2 months) so tonight's
    // planning can reach past the immediate cycle.
    const upcomingMeetings = events.filter(
      (event) => event.event_type === 'meeting' && event.event_date > todayIso
    );
    const farMeeting = upcomingMeetings[1] ?? null;
    const rangeStart = parseIsoDay(todayIso);
    const rangeEnd = farMeeting
      ? parseIsoDay(farMeeting.event_date)
      : new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 60);

    // Whole weeks, Sunday through Saturday.
    const gridStart = new Date(rangeStart);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(rangeEnd);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const days: Date[] = [];
    for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
      days.push(new Date(cursor));
    }
    const weeks: Date[][] = [];
    for (let index = 0; index < days.length; index += 7) {
      weeks.push(days.slice(index, index + 7));
    }

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

    const monthLabel = (date: Date) => date.toLocaleDateString('en-US', { month: 'short' });
    const calendarTitle = farMeeting
      ? `Between tonight & ${formatShortDate(farMeeting.event_date)}`
      : 'The next two months';

    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: sz(26, 16) }}>
          <View>
            <Kicker>Ways we gather · on the calendar</Kicker>
            <SlideTitle>Plan the Meet Ups</SlideTitle>
          </View>
          <EditPill noteKey="meetups" />
        </View>

        <View style={{ flexDirection: isTV ? 'row' : 'column', gap: sz(44, 20), flex: 1 }}>
          {/* Left: how we gather + this month's plans + fresh ideas */}
          <View style={{ flex: isTV ? 4 : undefined, gap: sz(20, 12) }}>
            <View style={{ gap: sz(12, 8) }}>
              {MEETUP_COLUMNS.map((column) => (
                <View
                  key={column.title}
                  style={{
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
            <View>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(18, 12), letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: sz(10, 7) }}>
                This month
              </Text>
              <NoteBody
                noteKey="meetups"
                emptyText="No meet-up plans written down yet — hatch some tonight."
              />
            </View>
            <View>
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

          {/* Right: the availability calendar */}
          <View style={{ flex: isTV ? 6 : undefined }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(18, 12), letterSpacing: 2, textTransform: 'uppercase', color: MUTED, marginBottom: sz(12, 8) }}>
              {calendarTitle}
            </Text>
            <View
              style={{
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                borderRadius: sz(20, 14),
                padding: sz(16, 8),
              }}
            >
              <View style={{ flexDirection: 'row', marginBottom: sz(8, 5) }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayLabel) => (
                  <Text
                    key={dayLabel}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontFamily: 'Lato_700Bold',
                      fontSize: sz(15, 10),
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
                    const inWindow = day >= rangeStart && day <= rangeEnd;
                    const dayEvents = inWindow ? eventsOnDay(dayIso) : [];
                    const awayEvents = dayEvents.filter(isAwayEvent);
                    const plannedEvents = dayEvents.filter((event) => !isAwayEvent(event));
                    const isMeetingDay = plannedEvents.some((event) => event.event_type === 'meeting');
                    // Away stretches don't claim the day — someone being out of
                    // town still leaves the rest of the HIVE free to hang.
                    const isBusy = plannedEvents.length > 0;
                    const isToday = dayIso === todayIso;
                    const firstOfMonth = day.getDate() === 1 || dayIso === getLocalIsoDate(gridStart);
                    const primaryEvent = plannedEvents[0];
                    // ✈️ marks the day a trip starts; → carries through the rest
                    // of the stretch so a long trip reads as one thin line.
                    const awayDeparts = awayEvents.some((event) => event.event_date === dayIso);
                    const shownAway = awayEvents.slice(0, 3);
                    const bubbleSize = sz(24, 14);
                    return (
                      <View
                        key={dayIso}
                        style={{
                          flex: 1,
                          minHeight: sz(60, 42),
                          margin: sz(3, 2),
                          borderRadius: sz(12, 8),
                          borderWidth: isMeetingDay || isToday ? 2 : 1,
                          borderColor: isMeetingDay || isToday ? GOLD : isBusy ? GOLD_SOFT : 'rgba(222,193,129,0.24)',
                          backgroundColor: !inWindow
                            ? 'transparent'
                            : isBusy
                              ? 'rgba(222,193,129,0.16)'
                              : PAPER,
                          paddingHorizontal: sz(8, 4),
                          paddingVertical: sz(6, 3),
                          opacity: inWindow ? 1 : 0.35,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: isToday || isMeetingDay ? 'Lato_700Bold' : 'Lato_400Regular',
                            fontSize: sz(17, 11),
                            color: isToday || isMeetingDay ? GOLD_DEEP : CHARCOAL,
                          }}
                        >
                          {firstOfMonth ? `${monthLabel(day)} ` : ''}{day.getDate()}
                        </Text>
                        {primaryEvent ? (
                          <Text numberOfLines={isTV ? 2 : 1} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(14, 9), lineHeight: sz(19, 12), color: GOLD_DEEP, marginTop: sz(3, 2) }}>
                            {eventEmoji(primaryEvent)}{isTV ? ` ${primaryEvent.title}` : ''}
                            {plannedEvents.length > 1 ? `  +${plannedEvents.length - 1}` : ''}
                          </Text>
                        ) : null}
                        {shownAway.length > 0 ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: sz(3, 2) }}>
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
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(12, 8), color: MUTED, marginLeft: sz(3, 2) }}>
                                +{awayEvents.length - shownAway.length}
                              </Text>
                            ) : null}
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(13, 9), color: MUTED, marginLeft: sz(3, 2) }}>
                              {awayDeparts ? '✈️' : '→'}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(16, 11), color: MUTED, marginTop: sz(10, 7) }}>
              🐝 meeting · 🎂 birthday · little faces → = who's away · 📌 event — blank days are your best shot at a hang.
            </Text>
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

      {/* Member bubbles — one per member, uniform size so no one looks emptier */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: sz(-8, -5), marginTop: sz(28, 16) }}>
        {memberOrder.map((member) => {
          const response = responsesByUser.get(member.id);
          const answers = response?.answers ?? {};
          const nameToday = getTextAnswer(answers, 'q_name_today') || getFirstName(member.name);
          const memberWishes = wishesByUserId.get(member.id) ?? [];
          const hdGoal = memberWishes.length > 0 ? getWishQuickTitle(memberWishes[0], 40) : null;
          const priorities = getTextAnswer(answers, 'q_pop_priorities');
          return (
            <View key={member.id} style={{ width: `${100 / bubbleColumns}%`, padding: sz(8, 5) }}>
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: GOLD_SOFT,
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
              </View>
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
