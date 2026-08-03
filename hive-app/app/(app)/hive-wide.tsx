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
import { useRouter } from 'expo-router';
import Svg, { Polygon } from 'react-native-svg';
import { AppHeader } from '../../components/navigation';
import { HIVE_WIDE_GREEN } from '../../components/ui/HiveWideWelcome';
import { GlobeHero } from '../../components/ui/GlobeHero';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { STANDING_INVITATION } from '../../lib/hiveFocus';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { formatDateLong } from '../../lib/dateUtils';
import { formatMeetingDate, getLocalIsoDate } from '../../lib/hooks/useArrivalBoard';
import type { Community } from '../../types';

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
};

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

const GREEN_SOFT = 'rgba(63,125,92,0.10)';
const GREEN_EDGE = 'rgba(63,125,92,0.4)';

/** The same flat-top comb Home uses, in HIVE-Wide's green. */
function Comb({
  emoji,
  label,
  count,
  onPress,
}: {
  emoji: string;
  label: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', flex: 1 }} className="active:opacity-70">
      <View style={{ width: 80, height: 70, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={80} height={70} viewBox="0 0 80 70" style={{ position: 'absolute' }}>
          <Polygon points="20,1 60,1 79,35 60,69 20,69 1,35" fill="#eef5f0" stroke={GREEN_EDGE} strokeWidth={1.5} />
        </Svg>
        <Text style={{ fontSize: 26, lineHeight: 30 }}>{emoji}</Text>
      </View>
      <Text
        style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#2d2d2d', marginTop: 4, textAlign: 'center' }}
        numberOfLines={2}
      >
        {label}
      </Text>
      {typeof count === 'number' && count > 0 ? (
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: HIVE_WIDE_GREEN, marginTop: 1 }}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A HIVE, as a small coloured comb. Says where something came from without
 *  writing "from OG HIVE" eleven times down the page. */
function HiveDot({ colour }: { colour: string }) {
  return (
    <Svg width={11} height={12} viewBox="0 0 11 12">
      <Polygon points="5.5,0 11,3 11,9 5.5,12 0,9 0,3" fill={colour} />
    </Svg>
  );
}

/** One of the three boxes. Same shell for all three so they read as a set. */
function TopBox({ label, wide, children }: { label: string; wide: boolean; children: React.ReactNode }) {
  return (
    <View
      style={{
        // flex only when they're side by side — on a phone they're stacked and
        // a flex child inside a column would fight the scroll view for height.
        flex: wide ? 1 : undefined,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: GREEN_EDGE,
        backgroundColor: GREEN_SOFT,
        padding: 16,
      }}
    >
      <Text
        style={{
          fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 1.3,
          textTransform: 'uppercase', color: HIVE_WIDE_GREEN, marginBottom: 9,
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
  const colour = hiveAccent(hive);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ paddingTop: 4 }}>
        <HiveDot colour={colour} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#313130' }}>
          {hiveDisplayName(hive.name)}
        </Text>
        {event ? (
          <>
            <Text
              style={{
                fontFamily: 'Lato_400Regular', fontSize: 13.5, lineHeight: 19,
                color: 'rgba(49,49,48,0.78)', marginTop: 1,
              }}
              numberOfLines={2}
            >
              {event.title}
            </Text>
            {/* Same words, same order, same dot as the meeting helper — a date
                should read the same everywhere in the app (Nat 2026-08-03). */}
            <Text
              style={{
                fontFamily: 'Lato_400Regular', fontSize: 11.5,
                color: 'rgba(49,49,48,0.45)', marginTop: 1,
              }}
            >
              {formatMeetingDate(event)}
            </Text>
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

export default function HiveWideScreen() {
  const router = useRouter();
  const { communityId } = useAuth();
  const { width } = useWindowDimensions();
  // Three boxes need real width before they stop being three narrow columns of
  // broken words. Below this they stack, in Nat's order.
  const wide = width >= 900;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [hives, setHives] = useState<Community[]>([]);
  const [upcoming, setUpcoming] = useState<HiveEvent[]>([]);
  const [shared, setShared] = useState<SharedPost[]>([]);
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
      setFocus(
        rows.find((r) => r.community_id === communityId)
          ?? rows.find((r) => r.community_id === null)
          ?? null
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
          .select('id, title, event_date, event_time, event_type, community_id, end_date')
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fffdf5' }} edges={['top']}>
      {/* The hero IS the header here. A pale wash behind a cream page was
          invisible — "a giant fail" (Nat 2026-08-03) — so the world gets its own
          deep band to live in, and the title sits in it. */}
      <GlobeHero
        title="HIVE-Wide"
        subtitle="Every HIVE, one high street. Everything here is something somebody chose to share."
      />
      {/* You are standing above the HIVEs. It should look like it before you've
          read a word (Nat 2026-08-03). */}
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 44 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <ActivityIndicator color={HIVE_WIDE_GREEN} style={{ marginTop: 28 }} />
        ) : (
          <>
            {/* The three boxes. Everything that matters this month, in the order
                Nat named them: what we're all doing, where we're all going, and
                when we're all sitting down. */}
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
              <TopBox label="HIVE Help" wide={wide}>
                {focus ? (
                  <>
                    <Text
                      style={{
                        fontFamily: 'LibreBaskerville_700Bold', fontSize: 18,
                        color: '#313130', lineHeight: 26, marginBottom: 7,
                      }}
                    >
                      {focus.title}
                    </Text>
                    {focus.body ? (
                      <Text
                        style={{
                          fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21,
                          color: 'rgba(49,49,48,0.72)',
                        }}
                      >
                        {focus.body}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 14,
                      lineHeight: 21, color: 'rgba(49,49,48,0.55)',
                    }}
                  >
                    This month's focus lands here as soon as it's chosen.
                  </Text>
                )}
                {/* The line that never changes, kept under whatever the month
                    happens to be. Nobody is ever outside the focus. */}
                <Text
                  style={{
                    fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19.5,
                    color: 'rgba(49,49,48,0.66)', marginTop: 12, paddingTop: 12,
                    borderTopWidth: 1, borderTopColor: 'rgba(63,125,92,0.22)',
                  }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', color: '#313130' }}>
                    Always on the table:{' '}
                  </Text>
                  {STANDING_INVITATION}
                </Text>
              </TopBox>

              <TopBox label="HIVE Hangs" wide={wide}>
                {hives.length > 0 ? (
                  <View style={{ gap: 11 }}>
                    {hives.map((hive) => (
                      <HiveLine key={hive.id} hive={hive} event={nextHangByHive.get(hive.id) ?? null} />
                    ))}
                  </View>
                ) : (
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 14,
                      lineHeight: 21, color: 'rgba(49,49,48,0.55)',
                    }}
                  >
                    The HIVEs will show up here with whatever they've got planned.
                  </Text>
                )}
              </TopBox>

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
                      lineHeight: 21, color: 'rgba(49,49,48,0.55)',
                    }}
                  >
                    Each HIVE's next sit-down shows up here once it's on the books.
                  </Text>
                )}
              </TopBox>
            </View>

            <Text
              style={{
                fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 1.3,
                textTransform: 'uppercase', color: 'rgba(49,49,48,0.42)',
                marginBottom: -6,
              }}
            >
              What is happening HIVE-Wide
            </Text>

            {/* Where to go, in the app's own shape. */}
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4 }}>
              <Comb
                emoji="✅"
                label="HIVE Approved"
                count={counts.approved}
                onPress={() => router.push('/board' as never)}
              />
              <Comb
                emoji="📣"
                label="Announcements"
                count={counts.announcements}
                onPress={() => router.push('/board' as never)}
              />
              <Comb emoji="📰" label="The Buzz" onPress={() => router.push('/buzz' as never)} />
              <Comb emoji="🗓️" label="Calendar" onPress={() => router.push('/meetings' as never)} />
            </View>

            {/* A glance, not an archive. Four, then a way to the rest. */}
            {shared.length > 0 ? (
              <View style={{ gap: 9 }}>
                {shared.map((post) => (
                  <Pressable
                    key={post.id}
                    onPress={() => router.push('/board' as never)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingVertical: 11, paddingHorizontal: 13,
                      borderRadius: 12, borderWidth: 1,
                      borderColor: 'rgba(49,49,48,0.1)', backgroundColor: '#fffdf6',
                    }}
                  >
                    <HiveDot colour={post.community?.accent_color || '#bd9348'} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontFamily: 'Lato_700Bold', fontSize: 14.5, color: '#313130', lineHeight: 20 }}
                        numberOfLines={2}
                      >
                        {post.title}
                      </Text>
                      <Text
                        style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, color: 'rgba(49,49,48,0.45)', marginTop: 2 }}
                      >
                        {/* A post from a HIVE you're not in comes back with no
                            HIVE attached, and printing that left a stray dot
                            floating in front of the date (2026-08-03). */}
                        {post.community?.name
                          ? `${hiveDisplayName(post.community.name)} · ${formatDateLong(post.created_at)}`
                          : formatDateLong(post.created_at)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
