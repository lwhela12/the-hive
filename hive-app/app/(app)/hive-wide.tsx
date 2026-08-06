import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// No AppHeader here on purpose — the title floats in the sky, and a gold bar
// across the top would put you back inside a HIVE (Nat 2026-08-03). The import
// hung around after the header came out.
import { SpaceGlobe, SPACE_BLACK } from '../../components/ui/SpaceGlobe';
import { HiveMark } from '../../components/ui/HiveMark';
import { HiveWideWelcome } from '../../components/ui/HiveWideWelcome';
import { HIVE_WIDE_WELCOME_VERSION } from '../../lib/hiveWide';
import { loadHiveWideWelcomeSeen, persistHiveWideWelcomeSeen } from '../../lib/readState';
import { supabase } from '../../lib/supabase';
import { useAuth, type HiveMembership } from '../../lib/hooks/useAuth';
import { STANDING_INVITATION } from '../../lib/hiveFocus';
import { getAppNews } from '../../lib/appNews';
import { accentOnDark, hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { formatDateLong } from '../../lib/dateUtils';
import { formatMeetingDate, getLocalIsoDate } from '../../lib/hooks/useArrivalBoard';
import type { Community } from '../../types';

import { ThinkingBee } from '../../components/ui/ThinkingBee';
/**
 * HIVE-Wide — the shared high street.
 *
 * The first pass was a flat list of eleven identical cards, every one of them
 * stamped "FROM OG HIVE" — "so much reading, just plain text all over, I'd never
 * read that... it doesn't match the rest of the site at all" (Nat 2026-08-03).
 * She was right on both counts, and the second one explains the first: Home
 * speaks in honeycombs and warm panels, and this spoke in a spreadsheet.
 *
 * So it's built out of what the app already uses. Combs to go somewhere, a warm
 * panel for the focus, and the last few things a HIVE opened up — shown as a
 * short glance rather than the entire archive. The HIVE a thing came from is a
 * coloured comb rather than the same four words on every line.
 *
 * The top of the page is three boxes, Nat's own sketch from later the same day:
 * HIVE Help, HIVE Hangs, Meetings. Side by side when there's room, stacked on a
 * phone. Boxes two and three carry one line per HIVE, so the shape of the whole
 * street is visible in a glance — including the HIVEs with nothing planned yet,
 * which say "tbd" in their own colour. An empty line is an invitation.
 */

type Focus = { title: string; body: string | null; community_id: string | null };
/**
 * A wish somebody marked HIVE-Wide.
 *
 * Nat's own diagnosis, 2026-08-04: "we haven't figured out the quick action
 * toggle to make profiles & wishes HIVE-Wide. I just realised that part of the
 * problem might be that we don't actually have a place for all that in the
 * HIVE-Wide." Exactly right — marking a wish HIVE-Wide worked and then it went
 * nowhere visible, so the setting looked broken because its RESULT was missing.
 * This box is where those wishes now land.
 */
type WideWish = {
  id: string;
  title: string | null;
  description: string;
  user: { name: string | null; avatar_url: string | null } | null;
  community: { name: string; accent_color: string | null } | null;
};

type SharedPost = {
  id: string;
  title: string;
  created_at: string;
  community: { name: string; accent_color: string | null } | null;
  category: { name: string } | null;
};
type HiveEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  event_type: string;
  community_id: string;
  end_date: string | null;
  /**
   * How far this event was allowed to travel. HIVE-Wide shows the WHAT of every
   * HIVE's plans — that there is a pool day — and the when and where only when
   * the person who made it said so.
   *
   * "The 'what' shows up, very generically, but all other info (who what when
   * where why) is only available inside that hive. UNLESS it was specifically
   * marked hive wide" (Nat 2026-08-03). It was showing the date and time on
   * everything, which is more than anybody agreed to.
   */
  visibility: string | null;
};

/** Did whoever made this say it could leave their HIVE? */
function travelsOutward(event: HiveEvent) {
  return event.visibility === 'all_hives' || event.visibility === 'public';
}

/**
 * A hang is somewhere you can turn up. A date range on the calendar is almost
 * always somebody out of town, which is the opposite of an invitation — so it
 * stays out of the Hangs box, the same way the monthly tune-up keeps it out of
 * the hang recap (2026-08-03). Same words, same test, one place to change it.
 */
function isAHang(event: HiveEvent) {
  if (event.event_type === 'meeting' || event.event_type === 'birthday') return false;
  if (event.end_date) return false;
  return !/\b(out of town|away|trip|travel|galavant)/i.test(event.title);
}

// See-through, so the world shows through the cards the way the studio site
// does — a solid panel over a globe is just a globe with a lid on it.
const CARD_FILL = 'rgba(255,248,233,0.055)';
const CARD_EDGE = 'rgba(255,226,166,0.22)';
const INK = '#FFF8E9';
const INK_SOFT = 'rgba(255,248,233,0.72)';
const INK_FAINT = 'rgba(255,248,233,0.45)';
/** The gold that reads on space — the same one the welcome panel wears. */
const GOLD_ON_SPACE = '#E8C77E';

/** One of the four boxes. Same shell for all of them so they read as a set. */
function TopBox({ label, wide, children }: { label: string; wide: boolean; children: React.ReactNode }) {
  return (
    <View
      style={{
        // Two to a row on a wide screen, one per row on a phone.
        //
        // flexBasis rather than flex:1 — with four boxes in a wrapping row,
        // flex:1 would squeeze all four onto one line and never wrap. 48% plus
        // grow leaves room for the gap and still lets a lonely last box fill
        // its row. On a phone they stack, and a flex child inside a column
        // would fight the scroll view for height.
        flexGrow: wide ? 1 : 0,
        flexBasis: wide ? '48%' : 'auto',
        // All four the same height (Nat 2026-08-04: "why are these bottom boxes
        // shorter than the top ones? they should all be equal"). A wrapping row
        // sizes each ROW to its own tallest child, so a short second row sat
        // shorter than a full first one. `alignItems: stretch` cannot fix that
        // across a wrap — it only equalises within a row — so the boxes are
        // given a floor instead, and the tallest content still grows past it.
        minHeight: wide ? 270 : undefined,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: CARD_EDGE,
        backgroundColor: CARD_FILL,
        padding: 16,
      }}
    >
      <Text
        style={{
          fontFamily: 'LibreBaskerville_700Bold', fontSize: 17, letterSpacing: 0.6,
          color: INK, marginBottom: 12,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

/** A HIVE and the one thing it has coming up. The hexagon carries the colour,
 *  which is how you know whose line you're reading before you read the name. */
function HiveLine({ hive, event }: { hive: Community; event: HiveEvent | null }) {
  // Lifted for space: Tech's #2f4a63 on this page is about 1.9:1, i.e. a HIVE
  // name nobody can read. accentOnDark keeps the hue and raises it (2026-08-03).
  const colour = accentOnDark(hiveAccent(hive));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ paddingTop: 4 }}>
        <HiveMark size={12} colour={colour} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: INK }}>
          {hiveDisplayName(hive.name)}
        </Text>
        {event ? (
          <>
            <Text
              style={{
                fontFamily: 'Lato_400Regular', fontSize: 13.5, lineHeight: 19,
                color: INK_SOFT, marginTop: 1,
              }}
              numberOfLines={2}
            >
              {event.title}
            </Text>
            {/* The when, only if it was cleared to leave its HIVE. Same words
                and same order as the meeting helper when it does show, so a date
                reads the same everywhere in the app. */}
            {travelsOutward(event) ? (
              <Text
                style={{
                  fontFamily: 'Lato_400Regular', fontSize: 11.5,
                  color: INK_FAINT, marginTop: 1,
                }}
              >
                {formatMeetingDate(event)}
              </Text>
            ) : (
              <Text
                style={{
                  fontFamily: 'Lato_400Regular', fontSize: 11,
                  color: 'rgba(255,248,233,0.3)', marginTop: 2,
                }}
              >
                details inside {hiveDisplayName(hive.name)}
              </Text>
            )}
          </>
        ) : (
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: colour, marginTop: 1 }}>
            tbd
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * The way down into your own HIVE.
 *
 * HIVE-Wide stays the page everybody lands on — Nat, 2026-08-06: "otherwise you
 * might never go there." What that costs is paid here. Somebody who accepted an
 * invite an hour ago opens the app to a black photograph of the Earth, and the
 * five numbered steps in their invite email — fill in your profile, read the
 * other members, answer the daily question, add what you are good at, post a
 * wish — are all inside their own HIVE, along with Clive, who the email calls
 * the fastest way to get unstuck. Standing above the HIVEs, every one of those
 * doors is out of the menu on purpose (`atWholeHive: 'hidden'` in
 * lib/navigation.ts), so the page has to say where they went.
 *
 * So this is the first thing under the title: the member's HIVE, by name, in
 * its own colour, as one big button that goes there. Nat on who is reading it:
 * "we have very very very very not tech savvy people."
 */
function WayIntoYourHive({
  memberships,
  firstName,
  firstVisit,
  onEnter,
}: {
  memberships: HiveMembership[];
  firstName: string | null;
  /** Shown the long explanation, until they put the welcome away. */
  firstVisit: boolean;
  onEnter: (communityId: string) => void;
}) {
  if (memberships.length === 0) return null;

  const names = memberships.map((m) => hiveDisplayName(m.community?.name));
  const many = names.length > 1;
  // "OG HIVE", "OG HIVE and Tech HIVE", "OG HIVE, Tech HIVE and Production HIVE"
  const nameList = names.length <= 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: CARD_EDGE,
        borderLeftWidth: 4,
        borderLeftColor: GOLD_ON_SPACE,
        // A little brighter than the cards below it. On a first visit this sits
        // right above the HIVE-Wide welcome, which wears the same gold edge, and
        // two identical panels one on top of the other read as one long
        // paragraph. The door is the thing to look at first.
        backgroundColor: 'rgba(255,248,233,0.09)',
        padding: 20,
        gap: 14,
      }}
    >
      <Text
        style={{
          fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, color: INK,
        }}
      >
        {firstVisit
          ? `Welcome${firstName ? `, ${firstName}` : ''} 🐝`
          : many ? 'Your HIVEs' : 'Your HIVE'}
      </Text>

      {firstVisit ? (
        <Text
          style={{
            fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 23, color: INK_SOFT,
          }}
        >
          This page shows all the HIVEs at once. {many ? 'Yours are' : 'Yours is'}{' '}
          <Text style={{ fontFamily: 'Lato_700Bold', color: INK }}>{nameList}</Text>, and
          that is where the rest of the app is: your profile, the other members, the
          daily question, your wishes, and Clive, who answers questions. Tap
          {many ? ' one of the buttons' : ' the button'} below to go in.
        </Text>
      ) : null}

      <View style={{ gap: 10 }}>
        {memberships.map((m) => {
          const name = hiveDisplayName(m.community?.name);
          // The HIVE's own colour, lifted until it reads on the night sky, and
          // filled rather than outlined — this is the one thing on the page
          // that has to look like a button to somebody who has never seen it.
          const colour = accentOnDark(hiveAccent(m.community));
          return (
            <Pressable
              key={m.community_id}
              onPress={() => onEnter(m.community_id)}
              accessibilityRole="button"
              accessibilityLabel={`Go into ${name}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
                paddingVertical: 15,
                paddingHorizontal: 18,
                borderRadius: 14,
                backgroundColor: colour,
              }}
            >
              <HiveMark size={16} colour={SPACE_BLACK} />
              <Text
                style={{
                  flex: 1, fontFamily: 'Lato_700Bold', fontSize: 16, color: SPACE_BLACK,
                }}
                numberOfLines={2}
              >
                Go into {name}
              </Text>
              <Ionicons name="arrow-forward" size={19} color={SPACE_BLACK} />
            </Pressable>
          );
        })}
      </View>

      {/* Said once, and said the same way the rail is drawn: HIVE-Wide is the
          first row under "My HIVEs", with the Earth on it. Somebody who goes in
          needs to know the way back before they take it. */}
      <Text
        style={{
          fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19, color: INK_FAINT,
        }}
      >
        HIVE-Wide is here whenever you want it — it is the top of the menu on the
        left, with the little world beside it.
      </Text>
    </View>
  );
}

export default function HiveWideScreen() {
  const router = useRouter();
  const { communityId, community, profile, refreshProfile, memberships, switchCommunity } = useAuth();

  // Whether this person has put the HIVE-Wide welcome away is the same question
  // as whether they have been here before, so the door reads it rather than
  // inventing a second "have you seen this?" flag on the profile.
  const firstVisit = loadHiveWideWelcomeSeen(profile) !== HIVE_WIDE_WELCOME_VERSION;

  // Read once rather than on every render — it is a constant in a file.
  const allAppNews = useMemo(() => getAppNews(), []);

  /**
   * The record, in days.
   *
   * Nat, 2026-08-05: "this is what we implemented on this date & this date &
   * this date? that would be cool to see." A flat list of forty-five lines is a
   * list; the same lines under their dates are a history, and the shape of the
   * work — a quiet week, then eleven things in one afternoon — only shows up
   * once the days are drawn.
   */
  const appNewsByDay = useMemo(() => {
    const days: { date: string; entries: typeof allAppNews }[] = [];
    allAppNews.forEach((entry) => {
      const last = days[days.length - 1];
      if (last && last.date === entry.date) last.entries.push(entry);
      else days.push({ date: entry.date, entries: [entry] });
    });
    return days;
  }, [allAppNews]);
  const oldestAppNews = allAppNews.length
    ? allAppNews[allAppNews.length - 1].date
    : new Date().toISOString().slice(0, 10);
  const { width } = useWindowDimensions();
  // Three boxes need real width before they stop being three narrow columns of
  // broken words. Below this they stack, in Nat's order.
  const wide = width >= 900;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharedFocus, setSharedFocus] = useState<Focus | null>(null);
  const [focusByHive, setFocusByHive] = useState<Map<string, Focus>>(new Map());
  const [hives, setHives] = useState<Community[]>([]);
  const [upcoming, setUpcoming] = useState<HiveEvent[]>([]);
  const [shared, setShared] = useState<SharedPost[]>([]);
  const [wideWishes, setWideWishes] = useState<WideWish[]>([]);
  const [counts, setCounts] = useState<{ approved: number; announcements: number }>({
    approved: 0,
    announcements: 0,
  });

  const load = useCallback(async () => {
    try {
      // The month you are actually standing in. toISOString() answers in UTC,
      // so on the evening of the 31st in Florida it has already rolled over and
      // the focus box would go empty hours early (2026-08-03).
      const month = getLocalIsoDate(new Date()).slice(0, 7);

      const { data: focusRows } = await supabase
        .from('monthly_focus')
        .select('title, body, community_id')
        .eq('month', month);

      const rows = (focusRows ?? []) as Focus[];
      setSharedFocus(rows.find((r) => r.community_id === null) ?? null);
      setFocusByHive(
        new Map(rows.filter((r) => r.community_id).map((r) => [r.community_id as string, r]))
      );

      // Every HIVE this person can see, oldest first — which puts OG HIVE at
      // the top of both lists without anyone hard-coding an order.
      const { data: hiveRows } = await supabase
        .from('communities')
        .select('id, name, slug, accent_color, created_at')
        .order('created_at', { ascending: true });
      const hiveList = (hiveRows ?? []) as unknown as Community[];
      setHives(hiveList);

      if (hiveList.length > 0) {
        const today = getLocalIsoDate(new Date());
        const { data: eventRows } = await supabase
          .from('events')
          .select('id, title, event_date, event_time, event_type, community_id, end_date, visibility')
          .in('community_id', hiveList.map((hive) => hive.id))
          .gte('event_date', today)
          .or('status.is.null,status.eq.scheduled')
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true });
        setUpcoming((eventRows ?? []) as unknown as HiveEvent[]);
      } else {
        setUpcoming([]);
      }

      const { data: boards } = await supabase
        .from('board_categories')
        .select('id, name')
        .eq('reach', 'all_hives');

      // Every wish that was marked to travel. The RLS policy already decides
      // which of these this person may see, so no community filter here — that
      // is the whole point of the scope.
      const { data: wishRows } = await supabase
        .from('wishes')
        .select('id, title, description, user:profiles!user_id(name, avatar_url), community:communities(name, accent_color)')
        .in('share_scope', ['all_hives', 'public'])
        .eq('status', 'public')
        .or('is_active.is.true,is_active.is.null')
        .order('created_at', { ascending: false })
        .limit(6);
      setWideWishes((wishRows ?? []) as unknown as WideWish[]);

      const boardRows = (boards ?? []) as { id: string; name: string }[];
      if (boardRows.length > 0) {
        const { data: posts } = await supabase
          .from('board_posts')
          .select('id, title, created_at, community:communities(name, accent_color), category:board_categories!category_id(name)')
          .in('category_id', boardRows.map((b) => b.id))
          .neq('status', 'archived')
          .order('created_at', { ascending: false })
          .limit(40);

        const all = (posts ?? []) as unknown as SharedPost[];
        setShared(all.slice(0, 4));
        setCounts({
          approved: all.filter((p) => /approved/i.test(p.category?.name ?? '')).length,
          announcements: all.filter((p) => /announce/i.test(p.category?.name ?? '')).length,
        });
      } else {
        setShared([]);
        // The combs count what's on screen, so an empty list has to zero them
        // too — otherwise a refresh leaves last load's numbers under them.
        setCounts({ approved: 0, announcements: 0 });
      }
    } catch (error) {
      // One query falling over used to leave the whole page spinning with
      // nothing on it. Keep whatever did load, say so in the log, and let a
      // pull-down try again (2026-08-03).
      console.warn('Could not load HIVE-Wide', error);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // The events come back in date order, so the first one a HIVE puts in the map
  // is the next one it has. Birthdays are made for us by the app rather than
  // planned by anybody, so they'd bury the real plans — the monthly tune-up
  // leaves them out of its hang list for the same reason.
  const nextHangByHive = useMemo(() => {
    const byHive = new Map<string, HiveEvent>();
    upcoming.forEach((event) => {
      if (!isAHang(event)) return;
      if (!byHive.has(event.community_id)) byHive.set(event.community_id, event);
    });
    return byHive;
  }, [upcoming]);

  const nextMeetingByHive = useMemo(() => {
    const byHive = new Map<string, HiveEvent>();
    upcoming.forEach((event) => {
      if (event.event_type !== 'meeting') return;
      if (!byHive.has(event.community_id)) byHive.set(event.community_id, event);
    });
    return byHive;
  }, [upcoming]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: SPACE_BLACK }} edges={['top']}>
      {/* The hero IS the header here. A pale wash behind a cream page was
          invisible — "a giant fail" (Nat 2026-08-03) — so the world gets its own
          deep band to live in, and the title sits in it. */}
      {/* You are standing above the HIVEs. It should look like it before you've
          read a word (Nat 2026-08-03). */}
      <SpaceGlobe />
      {/* Room at the top, above the world, said the way the HIVE home pages say
          it — small line, big name, small line (Nat 2026-08-03). */}
      <View style={{ paddingTop: 26, paddingBottom: 4, paddingHorizontal: 20 }}>
        <Text
          style={{
            fontFamily: 'Lato_400Regular', fontSize: 13, letterSpacing: 3,
            textTransform: 'uppercase', color: 'rgba(255,248,233,0.55)', textAlign: 'center',
          }}
        >
          See what&rsquo;s happening
        </Text>
        <Text
          style={{
            fontFamily: 'LibreBaskerville_700Bold', fontSize: 46, letterSpacing: 1.5,
            color: INK, textAlign: 'center', marginTop: 4,
          }}
        >
          HIVE-Wide
        </Text>
        <Text
          style={{
            fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 14.5,
            color: 'rgba(255,248,233,0.6)', textAlign: 'center', marginTop: 6,
          }}
        >
          Have a look around and see what&rsquo;s happening across all the HIVEs.
        </Text>
      </View>
      {/* The title lives in the sky rather than in a bar. There is no header on
          HIVE-Wide on purpose — "it's just part of outer space" (Nat 2026-08-03),
          and a gold bar across the top would put you back inside a HIVE. */}
      <ScrollView
        // Held to a column in the middle of the page rather than run edge to
        // edge (Nat 2026-08-04: "this feels a little too squishy to me, the
        // boxes should sit in the middle of the page please"). On a wide
        // monitor two half-width boxes stretched to nearly a metre each, so
        // three words of content sat in an acre of card and the eye had to
        // travel the whole screen to read a line. 1240 is the same width the
        // profile and settings pages already hold themselves to.
        contentContainerStyle={{
          padding: 16,
          gap: 18,
          paddingBottom: 44,
          // More air under the title (Nat 2026-08-04: "these boxes can shift
          // down a little, so they aren't so close to the header"). The page
          // has no header bar — the title floats in the sky — so the only thing
          // separating a 46pt serif headline from the first card is this
          // number, and 30 was reading as a collision rather than a gap.
          // Eased from 84 once the welcome became the first thing here rather
          // than the four boxes — Nat, 2026-08-05: "i'd shift it up a teeny tiny
          // bit closer to the heading". A panel that opens with a title of its
          // own needs less air under the headline than a row of cards does.
          paddingTop: 62,
          width: '100%',
          maxWidth: 1240,
          alignSelf: 'center',
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Outside the loading branch on purpose. The door is built entirely
            from who you are, which the app already knows the moment you sign
            in — so a new member sees the way into their HIVE while the rest of
            this page is still fetching, rather than after it. */}
        <WayIntoYourHive
          memberships={memberships}
          firstName={(profile?.name ?? '').trim().split(/\s+/)[0] || null}
          firstVisit={firstVisit}
          // Picking a HIVE by name is how you come down out of HIVE-Wide —
          // `switchCommunity` clears the HIVE-Wide standing and lands you on
          // that HIVE's home page (see lib/hiveSwitchRoute.ts).
          onEnter={(id) => { void switchCommunity(id); }}
        />
        {loading ? (
          <ThinkingBee />
        ) : (
          <>
            {/* The welcome Nat asked for on 2026-08-03. It was built that day,
                given a column to remember its dismissal (`hive_wide_welcome_seen`)
                and then never put on a page — so no member has ever seen it. It
                goes first, above the boxes, which is where an explanation of a
                page belongs. Dismissing it follows the person rather than the
                device, so putting it away on the phone puts it away on the
                laptop. */}
            <HiveWideWelcome
              community={community}
              seenVersion={loadHiveWideWelcomeSeen(profile)}
              onDismiss={(version) => {
                void persistHiveWideWelcomeSeen(profile, version).then(() => refreshProfile());
              }}
            />
            {/* Four boxes, two by two — the same shape as a HIVE's own home
                page, so HIVE-Wide stops being a layout of its own (Nat
                2026-08-03: "I love the colours and the look, but I want it to
                have the same layout as other HIVEs").

                A wrapping row of half-width cells rather than two hand-built
                columns: it collapses to a single stack on a phone without a
                second set of rules, and a fifth box later just lands in the
                next slot. */}
            <View
              style={{
                flexDirection: wide ? 'row' : 'column',
                flexWrap: wide ? 'wrap' : 'nowrap',
                gap: 12,
              }}
            >
              <TopBox label="Meetings" wide={wide}>
                {hives.length > 0 ? (
                  <View style={{ gap: 11 }}>
                    {hives.map((hive) => (
                      <HiveLine key={hive.id} hive={hive} event={nextMeetingByHive.get(hive.id) ?? null} />
                    ))}
                  </View>
                ) : (
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 14,
                      lineHeight: 21, color: INK_SOFT,
                    }}
                  >
                    Each HIVE's next sit-down shows up here once it's on the books.
                  </Text>
                )}
              </TopBox>
              {/* The wishes that travel — the home they never had.
                  Marking a wish HIVE-Wide worked all along and then it went
                  nowhere visible, so the setting read as broken because its
                  RESULT was missing. HIVE Help and HIVE Hangs came out to make
                  room: both were three lines of "tbd" repeated per HIVE, and
                  neither is a thing you can act on from up here. */}
              <TopBox label="HIVE-Wide Wishes" wide={wide}>
                {wideWishes.length > 0 ? (
                  <View style={{ gap: 9 }}>
                    {wideWishes.slice(0, 4).map((wish) => (
                      <Pressable
                        key={wish.id}
                        onPress={() => router.push('/members' as never)}
                        style={{
                          flexDirection: 'row', alignItems: 'flex-start', gap: 9,
                          paddingVertical: 10, paddingHorizontal: 12,
                          borderRadius: 12, borderWidth: 1,
                          borderColor: CARD_EDGE, backgroundColor: CARD_FILL,
                        }}
                      >
                        <View style={{ paddingTop: 3 }}>
                          <HiveMark size={12} colour={accentOnDark(hiveAccent(wish.community))} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: INK, lineHeight: 19 }}
                            numberOfLines={2}
                          >
                            {wish.title?.trim() || wish.description}
                          </Text>
                          <Text
                            style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, color: INK_FAINT, marginTop: 2 }}
                          >
                            {[wish.user?.name?.split(/\s+/)[0], wish.community?.name ? hiveDisplayName(wish.community.name) : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 14,
                      lineHeight: 21, color: INK_SOFT,
                    }}
                  >
                    Mark a wish HIVE-Wide and it turns up here, where every HIVE can see it.
                  </Text>
                )}
              </TopBox>

              {/* HIVE-Wide Chat came out (Nat 2026-08-04): "when we're ready
                  for the chat, we'll just add that into the vertical nav bar."
                  Which is right — a room is a destination, and destinations
                  live in the rail. A box that only says "not yet" is a box
                  taking up a slot that something real could use. */}
              {/* What's new in the app.
                  Nat remembered what this slot was always for (2026-08-04):
                  "one of them is supposed to be for what's new tech-wise in the
                  app! So all my little updates go right there!"

                  It reads `lib/appNews.ts` — the same list the Home strip and
                  the newsletter draft already read, so shipping a feature
                  updates all three at once and there is no fourth place to
                  remember. This replaced "What's happening", which could never
                  fill up: the shared boards went home to OG in migration 142,
                  so nothing was coming. */}
              {/* Everything, not a sample.
                  Nat, 2026-08-05: "its cool to see too, if we populate that at
                  the end of every session? So people can see how much work goes
                  into it? or i can see how much work i've done and know i'm
                  actually doing something?" She was offered a members-see-the-
                  highlights version and picked the whole record on purpose. So
                  it scrolls inside its own box rather than showing the top four,
                  and it opens with the count, because the count is the part that
                  answers her question. */}
              <TopBox label="What We've Been Building" wide={wide}>
                <Text
                  style={{
                    fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 12.5,
                    color: INK_FAINT, marginBottom: 9,
                  }}
                >
                  {allAppNews.length} changes since {formatDateLong(oldestAppNews)}
                </Text>
                <ScrollView
                  // Taller now that it is a history with dates in it rather
                  // than a handful of lines — 208px showed about two days.
                  style={{ maxHeight: wide ? 340 : 380 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                <View style={{ gap: 9 }}>
                  {appNewsByDay.map((day) => (
                    <View key={day.date} style={{ gap: 9 }}>
                      <Text
                        style={{
                          fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 1.1,
                          textTransform: 'uppercase', color: INK_FAINT, marginTop: 4,
                        }}
                      >
                        {formatDateLong(day.date)}
                        {day.entries.length > 1 ? ` · ${day.entries.length} things` : ''}
                      </Text>
                      {day.entries.map((entry) => (
                    <Pressable
                      key={entry.id}
                      disabled={!entry.href}
                      onPress={() => entry.href && router.push(entry.href as never)}
                      style={{
                        paddingVertical: 10, paddingHorizontal: 12,
                        borderRadius: 12, borderWidth: 1,
                        borderColor: CARD_EDGE, backgroundColor: CARD_FILL,
                      }}
                    >
                      <Text
                        style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: INK, lineHeight: 19 }}
                        numberOfLines={2}
                      >
                        {entry.title}
                      </Text>
                      {entry.detail ? (
                        <Text
                          style={{
                            fontFamily: 'Lato_400Regular', fontSize: 12.5,
                            color: INK_SOFT, lineHeight: 18, marginTop: 2,
                          }}
                          numberOfLines={2}
                        >
                          {entry.detail}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                    </View>
                  ))}
                </View>
                </ScrollView>
              </TopBox>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
