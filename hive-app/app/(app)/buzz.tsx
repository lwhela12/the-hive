import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../components/navigation';
import { userFacingError } from '../../lib/userFacingError';
import { currentNewsletterDraft, newsletterIssueHistory } from '../../lib/newsletterIssues';
import { SpaceBackdrop } from '../../components/ui/SpaceBackdrop';
import { CollapsiblePanel } from '../../components/ui/CollapsiblePanel';
import { ComposerBar } from '../../components/ui/ComposerBar';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useMentionableMembers, useMentionReach } from '../../lib/hooks/useMentionableMembers';
import { useDeepTrail } from '../../lib/hooks/usePathTrail';
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
import { BounceScrollView } from '../../components/ui/BounceScrollView';
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
  /** Written but never sent or published — owners only (2026-08-12). */
  unsent?: boolean;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A month named anywhere in a letter's title, written out or shortened, with
 * the year beside it when the title bothers to give one.
 */
const MONTH_IN_TITLE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?[\s,—-]*(20\d{2})?/i;

/**
 * Which month a letter is FOR.
 *
 * Two dates are in play and they are often different. The day the letter was
 * posted is `created_at` — the date already on the card. The month the letter
 * is about is the one on its masthead. In the live archive on 2026-08-06 they
 * disagreed on half the letters:
 *
 * | letter | posted | about |
 * |---|---|---|
 * | The Buzz — June 2026 HIVE Recap | 2026-07-08 | June |
 * | May 2026 — The Buzz | 2026-06-01 | May |
 * | H.I.V.E. Newsletter #4, May 2026 | 2026-05-05 | May |
 * | H.I.V.E. Newsletter #3, April 2026 | 2026-04-01 | April |
 * | H.I.V.E. Newsletter #2, March 2026 | 2026-02-23 | March |
 * | Our First Newsletter | 2026-02-16 | February |
 *
 * A recap goes out after the month it recaps, and March's letter went out in
 * February — so the posting date alone would have put "July" along the bottom
 * while the letter on screen said June, and "February" on two different
 * letters. The month word in the title is a date, so it is read as one and the
 * rest of the title is thrown away: only the month survives, which is why the
 * three shapes ("#3, April 2026", "May 2026 — The Buzz", "— June 2026 HIVE
 * Recap") all come out the same. A letter whose title names no month at all —
 * "Our First Newsletter" — falls back to the day it was posted, the same date
 * its card shows.
 *
 * `created_at` carries a time and a zone, so `new Date()` is safe here; the
 * date-only trap that `parseDateString` exists for does not apply.
 */
function letterMonth(item: Buzz): { month: number; year: number } {
  const posted = new Date(item.created_at);
  const found = MONTH_IN_TITLE.exec(item.title ?? '');
  const month = found
    ? MONTH_NAMES.findIndex((name) => name.slice(0, 3).toLowerCase() === found[1].slice(0, 3).toLowerCase())
    : -1;
  if (month < 0) return { month: posted.getMonth(), year: posted.getFullYear() };
  if (found?.[2]) return { month, year: Number(found[2]) };

  // A title that names a month and no year takes the year that lands it nearest
  // the day it went out, so a "January" letter posted in late December belongs
  // to the January a week away rather than the one eleven months behind.
  const postedIndex = posted.getFullYear() * 12 + posted.getMonth();
  const distance = (year: number) => Math.abs(year * 12 + month - postedIndex);
  const year = [posted.getFullYear() - 1, posted.getFullYear(), posted.getFullYear() + 1]
    .reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
  return { month, year };
}

/**
 * What one letter is called in the path along the bottom.
 *
 * Nat, from her phone on 2026-08-06: *"it should show The Buzz > April."* A
 * month, the way she says it out loud, rather than the title she is already
 * looking at at the top of the letter.
 *
 * The year is added once the month stops being enough to say which letter this
 * is — a letter from any year but this one. While the archive is all 2026 and
 * it is 2026, every crumb is a bare month; the day an April 2025 letter is
 * still on the page, it says "April 2025" and the two cannot be confused.
 */
const letterTrailLabel = (item: Buzz): string => {
  const { month, year } = letterMonth(item);
  const name = MONTH_NAMES[month];
  return year === new Date().getFullYear() ? name : `${name} ${year}`;
};

export default function BuzzScreen() {
  const { profile, communityId, memberships } = useAuth();
  const isOwner = !!profile?.is_owner;
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

  /**
   * Where you are once you open a letter.
   *
   * A letter is not its own address — it unfolds inside the archive while the
   * route still says `/buzz`, so the strip along the bottom had no way to know
   * anything had happened and kept saying `HIVE-Wide › The Buzz` while Nat sat
   * inside April's letter on her phone (2026-08-06): *"when i go into different
   * news letters, the footer nav didnt update with me: it should show The Buzz >
   * April."*
   *
   * One crumb, because the archive opens one letter at a time and arrives with
   * every card shut — so there is exactly one thing you can be inside, and it
   * disappears the moment the letter does.
   *
   * The card at the top that is still collecting gets NO crumb. It is a box you
   * add a line to rather than a letter you read; it belongs to the month you are
   * standing in, so "The Buzz › August" would name a letter nobody has written
   * yet. It also opens and shuts on its own, alongside an open letter, and two
   * crumbs from two cards would describe a place you are not.
   *
   * "The Buzz" is the way back, the same as the boards' page crumb sheds an open
   * thread: pressing it closes the letter and the archive is there again.
   */
  const openLetter = items.find((item) => item.id === openId) ?? null;
  useDeepTrail(
    openLetter ? [{ label: letterTrailLabel(openLetter) }] : [],
    openLetter ? () => setOpenId(null) : undefined,
  );

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
      // `archived_at`, not `status`. This filtered on `status <> 'archived'`,
      // and the column's own constraint only permits 'active' or 'completed' —
      // so the test could never be true and an archived letter stayed on the
      // page. Archiving a board post has always been `archived_at` (it is what
      // useCarryForwardContext and the newsletter-release query both read).
      .is('archived_at', null)
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

    /**
     * An issue joins the archive when it has actually GONE OUT — never before.
     *
     * Nat, 2026-08-12, finding this month's half-written letter sitting in the
     * list under every finished one: *"shouldnt the one we're working on
     * technically fall under 'still being written' until we click 'send to
     * everyone'?? what if people were in here reading the unfinished one?"*
     * They could, and it read as an issue they had somehow missed.
     *
     * Gone out means one of two things, because the archive predates the send
     * button: published to the public site (`visibility = 'public'`, which is
     * what the `public_newsletters` view reads and what every issue before
     * today has), or emailed to the list at least once.
     *
     * A draft that is neither is shown to OWNERS ONLY, wearing its own label,
     * so Nat can read hers back without it being on anybody else's page.
     */
    const { data: sends } = await supabase
      .from('newsletter_sends')
      .select('post_id, created_at')
      .eq('mode', 'live');
    const sentAtById = new Map(
      ((sends ?? []) as { post_id: string; created_at: string }[]).map((send) => [send.post_id, send.created_at])
    );
    const candidates = rows
      .filter((row) => !brewingIds.has(row.id))
      .map((row) => ({ ...row, sentAt: sentAtById.get(row.id) ?? null }));
    const draft = currentNewsletterDraft(candidates);
    const history = newsletterIssueHistory(candidates, draft);

    // One policy across Admin, the writer, and this archive. Only a genuinely
    // current draft is private to an owner; imported pre-send issues are past
    // newsletters, not six forever-drafts. Once the real draft is sent it moves
    // into history immediately.
    const archive = [
      ...(isOwner && draft ? [{ ...draft, unsent: true }] : []),
      ...history.map((row) => ({ ...row, unsent: false })),
    ];
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
  }, [memberships, profile?.id, isOwner]);

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
      setShoutOutError(userFacingError(error, 'Your words are still here. Try posting again in a moment.'));
      return;
    }

    setAdded((current) => [...current, content]);
    setShoutOut('');
    setAdding(false);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: skin.page }} edges={['top']}>
      <SpaceBackdrop />
      <AppHeader title="The Buzz" />
      <BounceScrollView
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
                // A draft says so, and says who can see it — the whole point of
                // it being here is that Nat can read hers back while knowing
                // nobody else can (2026-08-12).
                eyebrow={item.unsent ? 'Draft · only you can see this' : undefined}
                // The same dashed edge the collecting thread wears, for the
                // same reason: unfinished. Nat, 2026-08-12: *"i want that
                // dotted outline, like before, that made it super obvious, i
                // liked that."* The words say it; the border says it from
                // across the room.
                dashed={item.unsent}
                subtitle={
                  formatDateLong(item.created_at)
                  + (showWhichHive && fromElsewhere
                    ? ` · from ${hiveDisplayName(item.community?.name)}`
                    : '')
                  + (item.unsent
                    ? ' · not sent yet'
                    : item.visibility === 'public' ? ' · on the website' : '')
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
      </BounceScrollView>
    </SafeAreaView>
  );
}
