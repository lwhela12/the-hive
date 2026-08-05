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
import { LetterProse, type LetterPalette } from './newsletter';
import type { Community } from '../../types';

/**
 * The letter colours for space. The Buzz hangs in the same near-black as
 * HIVE-Wide, so paper's charcoal-on-cream would be unreadable here — headings
 * take the gold that reads on a dark ground, body takes the page's own ink.
 */
const SPACE_LETTER: LetterPalette = {
  heading: '#E8C77E',
  label: '#C9A961',
  body: SPACE_SKIN.inkBody,
  quiet: SPACE_SKIN.inkFaint,
  rule: 'rgba(255,226,166,0.4)',
  link: SPACE_SKIN.gold,
};

import { ThinkingBee } from '../../components/ui/ThinkingBee';
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
              <ThinkingBee />
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
                    {/* The letters read like letters here too.
                        Nat has asked three times. The archive imported from the
                        old Wix site kept every paragraph break — the text really
                        does carry its `\n\n` — but lost every mark of what a
                        line was FOR, and this printed the whole thing into one
                        `<Text>` at 15px. So a 6,000-character newsletter arrived
                        as one slab. `readLetter` reads the shape back out of the
                        plain text and `LetterProse` gives each piece its weight;
                        this is the same component the letter screen uses, in the
                        space skin's colours rather than paper's. */}
                    <LetterProse text={item.content} palette={SPACE_LETTER} />
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
