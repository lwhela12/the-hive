import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Polygon } from 'react-native-svg';
import { AppHeader } from '../../components/navigation';
import { HiveWideWelcome, HIVE_WIDE_GREEN } from '../../components/ui/HiveWideWelcome';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { loadHiveWideWelcomeSeen, persistHiveWideWelcomeSeen } from '../../lib/readState';
import { STANDING_INVITATION } from '../../lib/hiveFocus';
import { formatDateLong } from '../../lib/dateUtils';

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
 */

type Focus = { title: string; body: string | null; community_id: string | null };
type SharedPost = {
  id: string;
  title: string;
  created_at: string;
  community: { name: string; accent_color: string | null } | null;
  category: { name: string } | null;
};

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

export default function HiveWideScreen() {
  const router = useRouter();
  const { profile, communityId, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [shared, setShared] = useState<SharedPost[]>([]);
  const [counts, setCounts] = useState<{ approved: number; announcements: number }>({
    approved: 0,
    announcements: 0,
  });

  const load = useCallback(async () => {
    const month = new Date().toISOString().slice(0, 7);

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
    }

    setLoading(false);
  }, [communityId]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const dismissWelcome = async (version: string) => {
    await persistHiveWideWelcomeSeen(profile, version);
    void refreshProfile();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fffdf5' }} edges={['top']}>
      <AppHeader title="HIVE-Wide" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 44 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <HiveWideWelcome
          community={null}
          seenVersion={loadHiveWideWelcomeSeen(profile)}
          onDismiss={dismissWelcome}
        />

        {loading ? (
          <ActivityIndicator color={HIVE_WIDE_GREEN} style={{ marginTop: 28 }} />
        ) : (
          <>
            {/* The month, first and biggest. It's the one thing everybody is
                meant to act on. */}
            {focus ? (
              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: GREEN_EDGE,
                  backgroundColor: GREEN_SOFT,
                  padding: 18,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 1.3,
                    textTransform: 'uppercase', color: HIVE_WIDE_GREEN, marginBottom: 7,
                  }}
                >
                  This month, across every HIVE
                </Text>
                <Text
                  style={{
                    fontFamily: 'LibreBaskerville_700Bold', fontSize: 20,
                    color: '#313130', lineHeight: 28, marginBottom: 8,
                  }}
                >
                  {focus.title}
                </Text>
                {focus.body ? (
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular', fontSize: 14.5, lineHeight: 22,
                      color: 'rgba(49,49,48,0.72)',
                    }}
                  >
                    {focus.body}
                  </Text>
                ) : null}
                <Text
                  style={{
                    fontFamily: 'Lato_400Regular', fontSize: 13.5, lineHeight: 20,
                    color: 'rgba(49,49,48,0.66)', marginTop: 12, paddingTop: 12,
                    borderTopWidth: 1, borderTopColor: 'rgba(63,125,92,0.22)',
                  }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', color: '#313130' }}>
                    Always on the table:{' '}
                  </Text>
                  {STANDING_INVITATION}
                </Text>
              </View>
            ) : null}

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
                <Text
                  style={{
                    fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 1.3,
                    textTransform: 'uppercase', color: 'rgba(49,49,48,0.42)',
                  }}
                >
                  Lately, across the HIVEs
                </Text>
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
                        {post.community?.name} · {formatDateLong(post.created_at)}
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
