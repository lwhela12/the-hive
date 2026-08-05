import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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

/** How the app's own "still collecting" thread introduces itself. */
const BREWING = /newsletter's brewing/i;

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
  const router = useRouter();
  const [items, setItems] = useState<Buzz[]>([]);
  /** This month's collecting thread, kept out of the archive of sent letters. */
  const [collecting, setCollecting] = useState<Buzz | null>(null);
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

    // The month that is still collecting is NOT an issue of the newsletter.
    //
    // Nat, 2026-08-05: "will this always look like this... the whole month
    // leading up to that, does it look like this? like its brewing? I think the
    // 'brewing' view isn't nice."
    //
    // It was sitting at the top of the archive wearing the same card as the
    // finished letters, so an invitation to add something looked like an issue
    // you had already missed. It is an invitation, so it is drawn like one, and
    // the archive underneath is only letters that were actually sent.
    const brewing = rows.find((row) => BREWING.test(row.content ?? ''));
    setCollecting(brewing ?? null);
    const archive = brewing ? rows.filter((row) => row.id !== brewing.id) : rows;
    setItems(archive);
    setOpenId((current) => current ?? archive[0]?.id ?? null);
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
          ) : null}

          {/* This month, still being written. An invitation, drawn as one. */}
          {!loading && collecting ? (
            <Pressable
              // `postId`, not `post` — the boards screen reads `postId`, so the
              // first version handed it a parameter it did not know and the
              // screen fell back to whatever thread you had open last. Nat
              // pressed "Add yours" and landed in HIVE Approved.
              onPress={() => router.push({
                pathname: '/board',
                params: { postId: collecting.id },
              } as never)}
              accessibilityRole="button"
              accessibilityLabel="Add something to this month's newsletter"
              style={({ pressed }) => ({
                borderRadius: 16,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: 'rgba(255,226,166,0.45)',
                backgroundColor: pressed ? 'rgba(255,248,233,0.1)' : 'rgba(255,248,233,0.05)',
                padding: 16,
                marginBottom: 18,
                gap: 6,
              })}
            >
              <Text
                style={{
                  fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 1.1,
                  textTransform: 'uppercase', color: '#E8C77E',
                }}
              >
                Still being written
              </Text>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 17, color: skin.ink }}>
                {collecting.title}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13.5, lineHeight: 20, color: skin.inkSoft }}>
                Want a shout-out, a plug, or a reminder in it? Add it here and it goes
                into the letter.
              </Text>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#E8C77E', marginTop: 2 }}>
                Add yours →
              </Text>
            </Pressable>
          ) : null}

          {loading ? null : items.length === 0 ? (
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
