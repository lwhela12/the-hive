import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/navigation';
import { SpaceBackdrop } from '../../components/ui/SpaceBackdrop';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { formatDateLong } from '../../lib/dateUtils';
import { SPACE_SKIN } from '../../lib/pageSkin';
import type { Community } from '../../types';

/**
 * The Buzz — every newsletter you're entitled to read, in one place.
 *
 * Like a newspaper: the ones from your own HIVE, plus anything another HIVE
 * shared with all of them, plus anything published to the world. You never have
 * to swap HIVE to catch up, and you never see a HIVE you don't belong to —
 * the reach of each post is decided in the database, not here (Nat 2026-08-01).
 */

type Buzz = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  visibility: string;
  community_id: string;
  community?: Pick<Community, 'id' | 'name' | 'accent_color'> | null;
};

export default function BuzzScreen() {
  const { communityId, memberships } = useAuth();
  // The Buzz lives at HIVE-Wide and nowhere else (Nat 2026-08-03), so it is
  // always dressed for space rather than following whoever opened it.
  const skin = SPACE_SKIN;
  const [items, setItems] = useState<Buzz[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Row-level security already decides what comes back — this asks for every
    // newsletter post and receives only the ones this person may read.
    const { data: boards } = await supabase
      .from('board_categories')
      .select('id')
      .eq('topic_kind', 'newsletter');

    const boardIds = (boards ?? []).map((b: any) => b.id);
    if (boardIds.length === 0) {
      setItems([]); setLoading(false); return;
    }

    const { data } = await supabase
      .from('board_posts')
      .select('id, title, content, created_at, visibility, community_id, community:communities(id, name, accent_color)')
      .in('category_id', boardIds)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(40);

    const rows = (data ?? []) as unknown as Buzz[];
    setItems(rows);
    setOpenId((current) => current ?? rows[0]?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, communityId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const showWhichHive = memberships.length > 1;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: skin.page }} edges={['top']}>
      <SpaceBackdrop />
      <AppHeader title="The Buzz" tone="wide" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center' }}>
          {loading ? (
            <View style={{ paddingVertical: 48 }}>
              <ActivityIndicator size="large" color={skin.gold} />
            </View>
          ) : items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <Text style={{ fontSize: 34, marginBottom: 12 }}>📰</Text>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 17, color: skin.ink, marginBottom: 6 }}>
                Nothing to catch up on yet
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: skin.inkSoft, textAlign: 'center', maxWidth: 320 }}>
                The first newsletter will land here, and so will anything another HIVE shares.
              </Text>
            </View>
          ) : items.map((item) => {
            const open = openId === item.id;
            const accent = hiveAccent(item.community as Community | null);
            const fromElsewhere = item.community_id !== communityId;

            return (
              <View
                key={item.id}
                style={{
                  backgroundColor: skin.card,
                  borderWidth: 1,
                  borderColor: skin.border,
                  borderRadius: 18,
                  marginBottom: 12,
                  overflow: 'hidden',
                }}
              >
                <View style={{ height: 4, backgroundColor: accent }} />
                <Pressable
                  onPress={() => setOpenId(open ? null : item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                    padding: 16, backgroundColor: pressed ? skin.cardPressed : 'transparent',
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 16, color: skin.ink }}>
                      {item.title}
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: skin.inkSoft, marginTop: 3 }}>
                      {formatDateLong(item.created_at)}
                      {showWhichHive && fromElsewhere
                        ? ` · from ${hiveDisplayName(item.community?.name)}`
                        : ''}
                      {item.visibility === 'public' ? ' · on the website' : ''}
                    </Text>
                  </View>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={19}
                    color={skin.gold}
                  />
                </Pressable>

                {open ? (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
                    <Text
                      style={{
                        fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 24,
                        color: skin.inkBody,
                      }}
                    >
                      {item.content}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
