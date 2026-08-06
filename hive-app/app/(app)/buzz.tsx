import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/navigation';
import { SpaceBackdrop } from '../../components/ui/SpaceBackdrop';
import { CollapsiblePanel } from '../../components/ui/CollapsiblePanel';
import { ComposerBar } from '../../components/ui/ComposerBar';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useMentionableMembers, useMentionReach } from '../../lib/hooks/useMentionableMembers';
import { taggableHiveFromCommunity } from '../../lib/mentionableMembers';
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
  const { profile, communityId, memberships } = useAuth();
  // The Buzz lives at HIVE-Wide and nowhere else (Nat 2026-08-03), so it is
  // always dressed for space rather than following whoever opened it.
  const skin = SPACE_SKIN;
  const [items, setItems] = useState<Buzz[]>([]);
  /** This month's collecting thread, kept out of the archive of sent letters. */
  const [collecting, setCollecting] = useState<Buzz | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  /** The shout-out box, open only once somebody asks for it. */
  const [adding, setAdding] = useState(false);
  const [shoutOut, setShoutOut] = useState('');
  const [posting, setPosting] = useState(false);
  const [shoutOutError, setShoutOutError] = useState<string | null>(null);
  /** What this person has already put in this month's letter, read back. */
  const [added, setAdded] = useState<string[]>([]);

  const load = useCallback(async () => {
    // Row-level security already decides what comes back — this asks for every
    // newsletter post and receives only the ones this person may read.
    const { data: boards } = await supabase
      .from('board_categories')
      .select('id')
      .eq('topic_kind', 'newsletter');

    const boardIds = (boards ?? []).map((b: any) => b.id);
    if (boardIds.length === 0) {
      setItems([]); setCollecting(null); setAdded([]); setLoading(false); return;
    }

    const { data } = await supabase
      .from('board_posts')
      .select('id, title, content, created_at, visibility, community_id, community:communities(id, name, accent_color)')
      .in('category_id', boardIds)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(40);

    const rows = (data ?? []) as unknown as Buzz[];
    const memberIn = new Set(memberships.map((m) => m.community_id));

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
    const brewingRows = rows.filter((row) => BREWING.test(row.content ?? ''));
    // Your own HIVE's collecting thread first. A shout-out is a reply on that
    // thread, and the database only accepts a reply from somebody who belongs
    // to the HIVE the thread lives in — so offering another HIVE's thread would
    // be offering a box that cannot post.
    const mine = brewingRows.find((row) => memberIn.has(row.community_id));
    const brewing = mine ?? brewingRows[0] ?? null;
    setCollecting(brewing);
    const brewingIds = new Set(brewingRows.map((row) => row.id));
    const archive = rows.filter((row) => !brewingIds.has(row.id));
    setItems(archive);
    // Nothing is opened for you. Nat, 2026-08-06: *"I think the first view of
    // the newsletter page should always start out with them all collapsed & you
    // can expand the one you want to read."* A newsletter runs to about two
    // thousand words, so opening the newest one made the page a wall you had to
    // scroll past to find out what else was here. Whatever the reader has open
    // stays open through a refresh — `openId` is left alone here on purpose.
    setLoading(false);

    // What this person has already put in this month, read back off the thread
    // rather than remembered in the page. A shout-out you added yesterday is
    // still in the letter today, and the card should say so.
    if (brewing && profile?.id) {
      const { data: mineOnThread } = await supabase
        .from('board_replies')
        .select('id, content')
        .eq('post_id', brewing.id)
        .eq('author_id', profile.id)
        .order('created_at', { ascending: true });
      setAdded(((mineOnThread ?? []) as { content: string | null }[])
        .map((reply) => String(reply.content ?? '').trim())
        .filter((content) => content.length > 0));
    } else {
      setAdded([]);
    }
  }, [memberships, profile?.id]);

  useEffect(() => { void load(); }, [load, communityId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const showWhichHive = memberships.length > 1;

  /**
   * Adding a shout-out, without leaving The Buzz.
   *
   * "Add yours →" used to push you to `/board?postId=…` — a newsletter board
   * that Nat deliberately deleted (2026-08-05: *"i'm feeling very confident
   * right now that we dont want a news letter board"*). So the invitation
   * pointed at a room that had been taken down, and the app rebuilt it around
   * you for the length of one screen.
   *
   * The words were never the problem. A shout-out is one line, and one line
   * deserves a box, not a trip. It is stored exactly where it always was — a
   * reply on this month's collecting thread — which is the same row Admin's
   * "Shout-outs" tab lists and the same row the newsletter draft harvests, so
   * nothing that already works has to learn anything new.
   *
   * Words only, on purpose: the Shout-outs tab and the draft both read the
   * reply's text, so a photo attached here would be a photo nobody downstream
   * ever sees. What you add is exactly what lands in the letter.
   */
  const canAddShoutOut = !!profile
    && !!collecting
    && memberships.some((m) => m.community_id === collecting.community_id);

  /**
   * The people you can name in a shout-out.
   *
   * Nat typed "@n" into this box and asked: *"this 'add it' feature is really
   * cool, but we need to make sure that the at feature works!"* It did nothing —
   * the box was the app's shared composer with the tagging switched off, because
   * turning it on means handing it a list of people and nobody had.
   *
   * It is the same list, from the same place, that board replies and room chat
   * use, so "@n" offers the same names here as everywhere else and lands a real
   * person's handle in the text. The list is the HIVE whose letter this is —
   * the one you are allowed to add to — rather than whichever HIVE you last
   * stood in.
   *
   * Naming a whole HIVE ("@OG HIVE, don't forget…") works here, and this is the
   * one box where it is free of consequence: a shout-out is words in a letter
   * and sends no notification to anybody. So the picker names the HIVE whose
   * letter this is — not whichever HIVE you last stood in — and what you type
   * is read back by the Shout-outs tab and the draft exactly as written.
   */
  const { members: mentionableMembers, loading: mentionsLoading } = useMentionableMembers(
    canAddShoutOut ? collecting?.community_id : null
  );
  const mentionReach = useMentionReach({
    reach: 'hive',
    hive: taggableHiveFromCommunity(collecting?.community),
  });

  const submitShoutOut = async () => {
    const content = shoutOut.trim();
    if (!content || !profile || !collecting || posting) return;

    setPosting(true);
    setShoutOutError(null);
    // The same four columns every other reply in the app is written with. The
    // thread's reply count and last-reply time are kept up to date by a
    // database trigger, so there is nothing else to touch.
    const { error } = await (supabase as any).from('board_replies').insert({
      community_id: collecting.community_id,
      post_id: collecting.id,
      author_id: profile.id,
      content,
    });
    setPosting(false);

    if (error) {
      // The box keeps what you wrote, so the reason goes beside it rather than
      // into an alert you have to dismiss before you can try again.
      setShoutOutError(`Your words are still here. ${error.message}`);
      return;
    }

    setAdded((current) => [...current, content]);
    setShoutOut('');
    setAdding(false);
  };

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

          {/* This month, still being written. An invitation, drawn as one —
              and answerable right here. "Add it here" now means here.

              It opens and shuts like the letters below it, and it arrives SHUT
              like them too. Nat, from her phone on 2026-08-06: *"it should
              always start out with the collapsed view, otherwise its very
              confusing."* An earlier pass judged this one card worth leaving
              open because it is the thing you can act on; she has overruled
              that. Every card on the page now looks the same on arrival, so the
              page reads as a list of things you may open rather than one open
              thing with a list hiding under it. The eyebrow says "Still being
              written" while it is shut, which is the invitation. */}
          {!loading && collecting ? (
            <CollapsiblePanel
              eyebrow="Still being written"
              title={collecting.title}
              dashed
              defaultOpen={false}
              colours={{
                ink: skin.ink,
                inkSoft: skin.inkSoft,
                fill: 'rgba(255,248,233,0.05)',
                border: 'rgba(255,226,166,0.45)',
                accent: '#E8C77E',
                pressed: 'rgba(255,248,233,0.09)',
              }}
              style={{ marginBottom: 18 }}
              bodyStyle={{ gap: 6 }}
            >
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13.5, lineHeight: 20, color: skin.inkSoft }}>
                Want a shout-out, a plug, or a reminder in it? Add it here and it goes
                into the letter.
              </Text>

              {/* What you have already put in, read back to you. Nat's own test
                  of whether a thing worked is seeing it afterwards. */}
              {added.length > 0 ? (
                <View style={{ gap: 6, marginTop: 4 }}>
                  {added.map((entry, index) => (
                    <View
                      key={`${index}-${entry.slice(0, 12)}`}
                      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
                    >
                      <Ionicons name="checkmark-circle" size={15} color="#E8C77E" style={{ marginTop: 2 }} />
                      <Text
                        style={{
                          flex: 1, fontFamily: 'Lato_400Regular', fontSize: 13.5,
                          lineHeight: 20, color: skin.ink,
                        }}
                      >
                        {entry}
                      </Text>
                    </View>
                  ))}
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, color: skin.inkFaint }}>
                    {added.length === 1 ? "That's in the letter." : "They're in the letter."}
                  </Text>
                </View>
              ) : null}

              {shoutOutError ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, color: '#F2A5A5', marginTop: 2 }}>
                  {shoutOutError}
                </Text>
              ) : null}

              {adding ? (
                <View style={{ marginTop: 6, gap: 10 }}>
                  {/* The app's one text box, in its form shape: the mic and the
                      character count sit inside its own border. Its buttons are
                      drawn here instead of asked for, because the built-in pair
                      is charcoal-on-cream and this card hangs in space. Enter
                      makes a new line — a shout-out often wants two. */}
                  <ComposerBar
                    variant="form"
                    tone="dark"
                    value={shoutOut}
                    onChangeText={setShoutOut}
                    placeholder="A shout-out, a plug, a reminder — one or two lines is plenty."
                    minHeight={92}
                    maxLength={600}
                    autoFocus
                    submitOnEnterKey={false}
                    editable={!posting}
                    // Type "@" and the same picker the boards and the rooms use
                    // opens, so the name you choose is a real member's, spelled
                    // the way the letter writer and the Shout-outs tab will read
                    // it back. Nobody is pinged from here — a shout-out arrives
                    // in the newsletter, which is the whole point of writing one.
                    mentionMembers={mentionableMembers}
                    mentionsLoading={mentionsLoading}
                    mentionReach={mentionReach}
                    currentUserId={profile?.id}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Pressable
                      onPress={submitShoutOut}
                      disabled={!shoutOut.trim() || posting}
                      accessibilityRole="button"
                      style={({ pressed }) => ({
                        paddingHorizontal: 18,
                        paddingVertical: 10,
                        borderRadius: 999,
                        backgroundColor: shoutOut.trim() && !posting ? '#E8C77E' : 'rgba(255,248,233,0.12)',
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: 'Lato_700Bold',
                          fontSize: 13.5,
                          color: shoutOut.trim() && !posting ? '#1A1A22' : skin.inkFaint,
                        }}
                      >
                        {posting ? 'Adding…' : 'Add it'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setAdding(false);
                        setShoutOut('');
                        setShoutOutError(null);
                      }}
                      disabled={posting}
                      accessibilityRole="button"
                      hitSlop={6}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13.5, color: skin.inkSoft }}>
                        Cancel
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : canAddShoutOut ? (
                <Pressable
                  onPress={() => { setAdding(true); setShoutOutError(null); }}
                  accessibilityRole="button"
                  accessibilityLabel="Add something to this month's newsletter"
                  hitSlop={6}
                  style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1, marginTop: 2 })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#E8C77E' }}>
                    {added.length > 0 ? 'Add another →' : 'Add yours →'}
                  </Text>
                </Pressable>
              ) : (
                // The letter on screen belongs to a HIVE this person is reading
                // across into. They can read every word of it; adding to it is
                // for the people whose letter it is.
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, color: skin.inkFaint, marginTop: 2 }}>
                  This one is {hiveDisplayName(collecting.community?.name)}&rsquo;s letter to write.
                </Text>
              )}
            </CollapsiblePanel>
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
              <CollapsiblePanel
                key={item.id}
                title={item.title}
                subtitle={
                  formatDateLong(item.created_at)
                  + (showWhichHive && fromElsewhere
                    ? ` · from ${hiveDisplayName(item.community?.name)}`
                    : '')
                  + (item.visibility === 'public' ? ' · on the website' : '')
                }
                // One at a time — opening a letter shuts the one you were
                // reading, which is what "expand the one you want to read"
                // means when each of these is two thousand words.
                open={open}
                onToggle={(next) => setOpenId(next ? item.id : null)}
                // Whose letter it is, in that HIVE's colour.
                topAccent={accent}
                colours={{
                  ink: skin.ink,
                  inkSoft: skin.inkSoft,
                  // Opaque on the dark page, not a 5% wash.
                  //
                  // A whole newsletter is a long read, and this page is a
                  // photograph of a sunrise — over the bright edge of the planet
                  // the letter simply disappeared (Nat: "i also cant read the
                  // news letter"). A card you glance at can float; a card you
                  // READ needs ground under it.
                  fill: skin.dark ? '#12131A' : skin.card,
                  border: skin.border,
                  accent: skin.gold,
                  pressed: skin.cardPressed,
                }}
                titleStyle={{ fontSize: 16, letterSpacing: 0 }}
                style={{ borderRadius: 18, marginBottom: 12 }}
                bodyStyle={{ paddingBottom: 18 }}
              >
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
              </CollapsiblePanel>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
