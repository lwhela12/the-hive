import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppHeader } from '../../components/navigation';
import { HiveWideWelcome, HIVE_WIDE_GREEN } from '../../components/ui/HiveWideWelcome';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { loadHiveWideWelcomeSeen, persistHiveWideWelcomeSeen } from '../../lib/readState';
import { STANDING_INVITATION } from '../../lib/hiveFocus';

/**
 * HIVE-Wide — the shared high street, and where you land.
 *
 * "Everything here is HIVE-wide" (Nat, 2026-08-03). The month's focus, the
 * boards every HIVE shares, and anything a member has opened up. Your own HIVE
 * is a tap away in the rail.
 *
 * Nothing on this page is copied from anywhere. Each thing lives in exactly one
 * HIVE and appears here because somebody set its reach — which is why a wish can
 * show up here and in its own HIVE without existing twice.
 */

type Focus = { title: string; body: string | null; community_id: string | null };
type SharedPost = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  community: { name: string; accent_color: string | null } | null;
  category: { name: string } | null;
};

export default function HiveWideScreen() {
  const router = useRouter();
  const { profile, communityId, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [shared, setShared] = useState<SharedPost[]>([]);

  const load = useCallback(async () => {
    const month = new Date().toISOString().slice(0, 7);

    // Your HIVE's own variant wins if it has one; otherwise everyone's. Asked
    // for both and picked here, so a HIVE that hasn't chosen simply follows.
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

    // The shared noticeboards. Row-level security already decides what comes
    // back — this asks for everything on a shared board and receives only what
    // this person is entitled to read.
    const { data: boards } = await supabase
      .from('board_categories')
      .select('id')
      .eq('reach', 'all_hives');

    const boardIds = ((boards ?? []) as { id: string }[]).map((b) => b.id);
    if (boardIds.length > 0) {
      const { data: posts } = await supabase
        .from('board_posts')
        .select('id, title, content, created_at, community:communities(name, accent_color), category:board_categories!category_id(name)')
        .in('category_id', boardIds)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(20);
      setShared((posts ?? []) as unknown as SharedPost[]);
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
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <HiveWideWelcome
          community={null}
          seenVersion={loadHiveWideWelcomeSeen(profile)}
          onDismiss={dismissWelcome}
        />

        {loading ? (
          <ActivityIndicator color={HIVE_WIDE_GREEN} style={{ marginTop: 24 }} />
        ) : (
          <>
            {focus ? (
              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(63,125,92,0.25)',
                  borderLeftWidth: 4,
                  borderLeftColor: HIVE_WIDE_GREEN,
                  backgroundColor: '#fffdf6',
                  padding: 18,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 1.2,
                    textTransform: 'uppercase', color: 'rgba(49,49,48,0.45)', marginBottom: 6,
                  }}
                >
                  This month&rsquo;s HIVE Focus
                </Text>
                <Text
                  style={{
                    fontFamily: 'LibreBaskerville_700Bold', fontSize: 17,
                    color: '#313130', lineHeight: 24, marginBottom: 7,
                  }}
                >
                  {focus.title}
                </Text>
                {focus.body ? (
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21,
                      color: 'rgba(49,49,48,0.7)',
                    }}
                  >
                    {focus.body}
                  </Text>
                ) : null}
                <View
                  style={{
                    marginTop: 12, paddingTop: 12,
                    borderTopWidth: 1, borderTopColor: 'rgba(49,49,48,0.1)',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular', fontSize: 13.5, lineHeight: 20,
                      color: 'rgba(49,49,48,0.7)',
                    }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', color: '#313130' }}>
                      Always on the table:{' '}
                    </Text>
                    {STANDING_INVITATION}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={{ gap: 10 }}>
              <Text
                style={{
                  fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 1.2,
                  textTransform: 'uppercase', color: HIVE_WIDE_GREEN,
                }}
              >
                Shared across the HIVEs
              </Text>
              {shared.length === 0 ? (
                <Text
                  style={{
                    fontFamily: 'Lato_400Regular', fontSize: 14,
                    color: 'rgba(49,49,48,0.5)', lineHeight: 21,
                  }}
                >
                  HIVE Approved and Announcements land here. Post to either and
                  every HIVE sees it.
                </Text>
              ) : (
                shared.map((post) => (
                  <Pressable
                    key={post.id}
                    onPress={() => router.push(`/board?post=${post.id}` as never)}
                    style={{
                      borderRadius: 12, borderWidth: 1, borderColor: 'rgba(49,49,48,0.12)',
                      borderLeftWidth: 3, borderLeftColor: HIVE_WIDE_GREEN,
                      backgroundColor: '#fffdf6', padding: 14,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Lato_700Bold', fontSize: 10, letterSpacing: 0.9,
                        textTransform: 'uppercase', color: 'rgba(49,49,48,0.42)', marginBottom: 4,
                      }}
                    >
                      {post.category?.name ?? 'Shared'}
                      {post.community?.name ? ` · from ${post.community.name}` : ''}
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'Lato_700Bold', fontSize: 15,
                        color: '#313130', lineHeight: 21,
                      }}
                    >
                      {post.title}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
