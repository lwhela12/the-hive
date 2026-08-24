import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { userFacingError } from '../../lib/userFacingError';
import { currentNewsletterDraft } from '../../lib/newsletterIssues';
import { useAuth } from '../../lib/hooks/useAuth';
import { getAppNewsForMonth } from '../../lib/appNews';
import { useAppNews } from '../../lib/hooks/useAppNews';
import { PARDON_OUR_DUST } from '../../lib/hiveWide';
import { SummarySections, type SummarySection } from '../../components/meetings/SummarySections';
import { readLetter } from '../../lib/newsletterHeaders';
import { LinkifiedText } from '../../components/ui/LinkifiedText';

import { ThinkingBee } from '../../components/ui/ThinkingBee';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
/** The month a recap covers: the one before the month it goes out in. */
function lastMonth(): string {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

// The plain bee mark, not the crest — the crest's sunburst ring turns to mush
// at header size (see monthly-tuneup for the full note).
const hiveBee = require('../../assets/BEE ONLY IN GOLD BG.png');

/**
 * The newsletter, drafted for you.
 *
 * Nat writes the newsletter somewhere else — this screen's job is to put
 * everything that happened since the last meeting in front of her in the shape
 * she already likes (the meeting summary), so writing it is choosing what to
 * keep rather than remembering what happened. Hence Copy: the draft is raw
 * material, not a publication.
 */
/** The colours a letter is set in. Paper by default; The Buzz reads in space. */
export type LetterPalette = {
  heading: string;
  label: string;
  body: string;
  quiet: string;
  rule: string;
  link: string;
};

export const PAPER_LETTER: LetterPalette = {
  heading: '#8a6b30',
  label: '#9a7c42',
  body: '#3f3a33',
  quiet: '#6f6559',
  rule: 'rgba(189,147,72,0.45)',
  link: '#bd9348',
};

/**
 * A letter, set the way Nat writes them.
 *
 * Nat, 2026-08-04: "these headers like 'HIVE Help' and 'Around the HIVE' need
 * more distinguishable headers." — and again on the archive, which was still
 * arriving as one slab. Both letters are plain text (see `readLetter` for why
 * they have to be), so this reads the shape back out and gives each piece its
 * own weight: gold serif for a section, a quieter gold line for a label, a date
 * that sits beside its event, bullets that hang, air between paragraphs.
 *
 * Every run of body text goes through `LinkifiedText`, so the web addresses Nat
 * pasted into the old Wix letters are tappable instead of decorative.
 *
 * Copying is untouched — `asPlainText()` and `prose` still hand over the
 * original string, so what she pastes is exactly what was written.
 *
 * Exported because the archive needs the same treatment: The Buzz (app/(app)/
 * buzz.tsx) still prints a whole letter into one `<Text>`. Swapping that for
 * `<LetterProse text={item.content} palette={...} />` with the space skin's
 * colours is the whole fix there.
 */
/** The letter's join buttons — same keys, labels and colours as the email. */
const LETTER_BUTTONS: Record<string, { label: string; colour: string; slug: string }> = {
  tech: { label: "I'm interested in Tech HIVE", colour: '#2f4a63', slug: 'tech' },
  og: { label: 'Add me to the OG HIVE waitlist', colour: '#bd9348', slug: 'default' },
};

export function LetterProse({
  text,
  palette = PAPER_LETTER,
}: {
  text: string;
  palette?: LetterPalette;
}) {
  const { profile } = useAuth();
  const viewerEmail = (profile?.email ?? '').trim().toLowerCase();
  const blocks = useMemo(() => readLetter(text), [text]);
  const body = {
    fontFamily: 'Lato_400Regular',
    fontSize: 15,
    lineHeight: 24,
    color: palette.body,
  } as const;
  const linkStyle = { color: palette.link, textDecorationLine: 'underline' } as const;

  return (
    <View>
      {blocks.map((block, i) => {
        const first = i === 0;

        // `[[BUTTON:tech]]` on its own line is a join button, everywhere the
        // letter renders — Nat found the marker printing as raw text in the
        // app (2026-08-12: "the buttons dont work in this page"). Tapping
        // opens the same interested page the email version points at, with
        // your own address already on it.
        if (block.kind === 'paragraph') {
          const marker = /^\[\[BUTTON:([a-z]+)\]\]$/.exec(block.text.trim());
          if (marker) {
            const button = LETTER_BUTTONS[marker[1]];
            if (!button) return null;
            return (
              <Pressable
                key={i}
                onPress={() => {
                  const params = new URLSearchParams({ hive: button.slug });
                  if (viewerEmail) params.set('email', viewerEmail);
                  void Linking.openURL(`https://the-hive.app/api/interested?${params.toString()}`);
                }}
                style={({ pressed }) => ({
                  alignSelf: 'center',
                  backgroundColor: button.colour,
                  borderRadius: 999,
                  paddingHorizontal: 22,
                  paddingVertical: 12,
                  marginVertical: 12,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#fffdf5' }}>
                  {button.label} →
                </Text>
              </Pressable>
            );
          }
        }

        switch (block.kind) {
          case 'heading':
            return (
              <Text
                key={i}
                selectable
                style={{
                  fontFamily: 'LibreBaskerville_700Bold',
                  fontSize: 19,
                  lineHeight: 28,
                  color: palette.heading,
                  marginTop: first ? 0 : 24,
                  marginBottom: 8,
                }}
              >
                {block.text}
              </Text>
            );

          case 'label':
            return (
              <Text
                key={i}
                selectable
                style={{
                  fontFamily: 'Lato_700Bold',
                  fontSize: 15,
                  lineHeight: 22,
                  color: palette.label,
                  marginTop: first ? 0 : 16,
                  marginBottom: 6,
                }}
              >
                {block.text}
              </Text>
            );

          case 'dated':
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                <Text
                  selectable
                  style={{
                    fontFamily: 'Lato_700Bold',
                    fontSize: 15,
                    lineHeight: 24,
                    color: palette.label,
                    flexShrink: 0,
                  }}
                >
                  {block.when}
                </Text>
                <LinkifiedText selectable style={[body, { flex: 1 }]} linkStyle={linkStyle}>
                  {block.text}
                </LinkifiedText>
              </View>
            );

          case 'bullet':
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 7, paddingLeft: 4 }}>
                <Text style={{ ...body, color: palette.label }}>•</Text>
                <LinkifiedText selectable style={[body, { flex: 1 }]} linkStyle={linkStyle}>
                  {block.text}
                </LinkifiedText>
              </View>
            );

          case 'numbered':
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 7, paddingLeft: 4 }}>
                <Text
                  style={{
                    fontFamily: 'Lato_700Bold',
                    fontSize: 15,
                    lineHeight: 24,
                    color: palette.label,
                    minWidth: 18,
                  }}
                >
                  {block.marker}.
                </Text>
                <LinkifiedText selectable style={[body, { flex: 1 }]} linkStyle={linkStyle}>
                  {block.text}
                </LinkifiedText>
              </View>
            );

          case 'quote':
            return (
              <View
                key={i}
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: palette.rule,
                  paddingLeft: 14,
                  marginTop: 18,
                  marginBottom: 4,
                }}
              >
                <Text
                  selectable
                  style={{
                    fontFamily: 'LibreBaskerville_400Regular',
                    fontSize: 15,
                    lineHeight: 26,
                    color: palette.quiet,
                  }}
                >
                  {block.text}
                </Text>
              </View>
            );

          case 'attribution':
            return (
              <Text
                key={i}
                selectable
                style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: 13,
                  color: palette.label,
                  paddingLeft: 17,
                  marginBottom: 12,
                }}
              >
                — {block.text}
              </Text>
            );

          default:
            return (
              <LinkifiedText key={i} selectable style={[body, { marginBottom: 12 }]} linkStyle={linkStyle}>
                {block.text}
              </LinkifiedText>
            );
        }
      })}
    </View>
  );
}

export default function NewsletterScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { communityId, profile } = useAuth();
  const { appNews: mergedAppNews } = useAppNews();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<SummarySection[]>([]);
  const [cycleStart, setCycleStart] = useState<string | null>(null);
  const [recapTitle, setRecapTitle] = useState<string | null>(null);
  const [prose, setProse] = useState<string | null>(null);
  /** True when the prose above is a letter Nat already wrote, not a generated one. */
  const [existingDraft, setExistingDraft] = useState(false);
  // The letter is what she pastes into Wix; the outline is for checking the
  // facts behind it. Same data, two readings.
  const [view, setView] = useState<'letter' | 'facts'>('letter');
  const [writing, setWriting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postedTo, setPostedTo] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  const close = () => {
    // Never `router.back()` — see the note in `settings.tsx`. The browser's
    // history remembers the public site from before you signed in, so the
    // fallback has to be a room in the app, not "wherever you came from".
    if (from === 'meetings') router.replace('/meetings');
    else if (from === 'admin') router.replace('/admin');
    else router.replace('/meetings');
  };

  // Gathering takes about a second; writing the letter takes the better part of
  // a minute. So do it in two passes — put the facts on screen straight away,
  // then swap in the letter when it lands. Staring at a spinner for a minute is
  // the same wait, just worse (Nat 2026-07-25).
  const loadDraft = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    setError(null);
    setProse(null);
    setExistingDraft(false);

    // What's new in the app, straight from the list every member already sees on
    // Home. This used to come off the meeting deck's frozen copy, so a recap
    // written after the meeting missed everything shipped since it.
    const month = lastMonth();
    const appNews = getAppNewsForMonth(month, mergedAppNews)
      .map((entry) => (entry.detail ? `${entry.title} — ${entry.detail}` : entry.title));

    // "Pardon our dust, we're in the process of expanding — what does that mean
    // for you?" Nat wanted the same explanation on the landing page, in the
    // newsletter and on the sign-in banner, so all three read from lib/hiveWide.ts
    // and can never drift into describing three different apps.
    //
    // It goes in as facts rather than finished prose, so the letter writer puts
    // it in her voice along with everything else instead of it landing as a
    // notice bolted onto the bottom.
    const draftBody = { communityId, month, appNews, expansionNote: PARDON_OUR_DUST };

    const { data, error: invokeError } = await supabase.functions.invoke('draft-newsletter', {
      body: { ...draftBody, includeProse: false },
    });
    if (invokeError || !data?.success) {
      setError('Could not gather the draft just now. Try again in a moment.');
      setLoading(false);
      return;
    }
    if (data.blocked) {
      setError(data.reason ?? 'This HIVE keeps its contents inside the HIVE.');
      setLoading(false);
      return;
    }
    setSections((data.sections ?? []) as SummarySection[]);
    setCycleStart(data.cycle_start ?? null);
    setRecapTitle(typeof data.recap_title === 'string' ? data.recap_title : null);
    setLoading(false);

    /**
     * A letter already in progress is what you see. Nothing is written over it.
     *
     * This page always generated a fresh letter, and on 2026-08-12 Nat tapped
     * a row in Admin that named her own draft — "The Buzz — July Recap" — and
     * landed on a completely different, machine-written August letter:
     * *"which is all bad, this doesnt match the one we're writing in the email
     * at all."* Worse than confusing: posting from here would have overwritten
     * three weeks of her writing with a generated draft.
     *
     * So an unsent draft is loaded as the prose, and the writer is not asked
     * for one. The FACTS above are still gathered either way — that is the
     * genuinely useful half of this page once a letter exists, because it is
     * what happened this cycle, ready to fold in by hand.
     */
    const { data: sends } = await supabase
      .from('newsletter_sends')
      .select('post_id, created_at')
      .eq('mode', 'live');
    const sentAtById = new Map(
      ((sends ?? []) as { post_id: string; created_at: string }[]).map((send) => [send.post_id, send.created_at])
    );

    const { data: boardRows } = await supabase
      .from('board_categories')
      .select('id')
      .eq('community_id', communityId)
      .eq('topic_kind', 'newsletter');
    const newsletterBoardIds = ((boardRows ?? []) as { id: string }[]).map((b) => b.id);

    if (newsletterBoardIds.length > 0) {
      const { data: drafts } = await supabase
        .from('board_posts')
        .select('id, title, content, visibility, created_at')
        .in('category_id', newsletterBoardIds)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(10);
      const candidates = ((drafts ?? []) as {
        id: string; title: string; content: string; visibility: string | null; created_at: string;
      }[]).map((row) => ({ ...row, sentAt: sentAtById.get(row.id) ?? null }));
      const inProgress = currentNewsletterDraft(candidates);
      if (inProgress && String(inProgress.content ?? '').trim()) {
        setProse(inProgress.content);
        setRecapTitle(inProgress.title);
        setExistingDraft(true);
        return;
      }
    }

    if ((data.sections ?? []).length === 0) return;

    setWriting(true);
    const { data: written } = await supabase.functions.invoke('draft-newsletter', {
      body: { ...draftBody, includeProse: true },
    });
    if (written?.success) {
      if ((written.sections ?? []).length > 0) setSections(written.sections as SummarySection[]);
      setProse(typeof written.prose === 'string' && written.prose.trim() ? written.prose : null);
    }
    setWriting(false);
  }, [communityId, mergedAppNews]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  // Plain text, because it's going into whatever she writes the newsletter in.
  const asPlainText = () => sections
    .map((section) => [
      section.title.toUpperCase(),
      ...(section.lines ?? []).map((line) => (line.startsWith('    ') ? `    - ${line.trim()}` : `- ${line}`)),
    ].join('\n'))
    .join('\n\n');

  const copyAll = async () => {
    // Copy what you're looking at — the letter goes to Wix, the outline is for
    // when you want the raw material instead.
    const text = view === 'letter' && prose ? prose : asPlainText();
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // The newsletter should be reachable more than one way: email from Wix, the
  // public site, and here. This is the in-app door — post the draft, then edit
  // the thread to match whatever actually went out.
  const postToBoard = async () => {
    if (!communityId || !profile || posting || sections.length === 0) return;
    setPosting(true);
    setPostError(null);
    try {
      const { data: boards } = await supabase
        .from('board_categories')
        .select('id, name, topic_kind')
        .eq('community_id', communityId)
        .or('topic_kind.eq.newsletter,name.ilike.%newsletter%')
        .order('topic_kind', { ascending: false })
        .limit(1);
      const board = ((boards ?? []) as { id: string; name: string }[])[0];
      if (!board) {
        setPostError('Could not find the HIVE Newsletter board.');
        return;
      }

      const month = cycleStart
        ? new Date(Date.UTC(
            Number(cycleStart.slice(0, 4)),
            Number(cycleStart.slice(5, 7)) - 1,
            15,
          )).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
        : new Date().toLocaleString('en-US', { month: 'long' });
      // Named for the month it recaps, not the month it goes out — "The Buzz —
      // July 2026 HIVE Recap", published in August. Nat renamed these on Wix so
      // a letter about July stops feeling a month late (2026-08-03).
      const title = recapTitle ?? `The Buzz — ${month} HIVE Recap`;

      /**
       * The issue in progress, if there is one — otherwise this month's
       * collecting thread.
       *
       * The month match alone was the only rule until 2026-08-12, and it
       * assumed every letter's title STARTS with a month, which stopped being
       * true the day the archive was renamed to "The Buzz — {Month} Recap".
       * A hand-written draft sitting on the board would have been missed
       * entirely and posting would have quietly made a second one beside it.
       *
       * So: an unsent draft wins. That is a letter on this board that has
       * never been published and never been mailed — the same test The Buzz
       * uses to decide what is still Nat's alone. Falling back to the month
       * match keeps the original behaviour, where publishing turns the
       * shout-out thread into the letter in place and the replies that fed it
       * stay underneath.
       */
      const { data: sends } = await supabase
        .from('newsletter_sends')
        .select('post_id, created_at')
        .eq('mode', 'live');
      const sentAtById = new Map(
        ((sends ?? []) as { post_id: string; created_at: string }[]).map((send) => [send.post_id, send.created_at])
      );

      const { data: drafts } = await supabase
        .from('board_posts')
        .select('id, visibility, created_at')
        .eq('category_id', board.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      const candidates = ((drafts ?? []) as {
        id: string; visibility: string | null; created_at: string;
      }[]).map((row) => ({ ...row, sentAt: sentAtById.get(row.id) ?? null }));
      const inProgress = currentNewsletterDraft(candidates);

      const { data: byMonth } = inProgress ? { data: null } : await supabase
        .from('board_posts')
        .select('id')
        .eq('category_id', board.id)
        .ilike('title', `${month}%`)
        .is('archived_at', null)
        .order('created_at', { ascending: true })
        .limit(1);

      const existing = inProgress ? [inProgress] : byMonth;

      const content = prose ?? asPlainText();
      if ((existing ?? []).length > 0) {
        const { error: updateError } = await (supabase as any)
          .from('board_posts')
          .update({ title, content, is_pinned: true, edited_at: new Date().toISOString() })
          .eq('id', (existing as { id: string }[])[0].id);
        if (updateError) {
          setPostError(userFacingError(updateError, 'The draft is still here. Try updating the post again.'));
          return;
        }
      } else {
        // Pinned so the published letter sits above the shout-out thread that
        // fed it — the board should read as an archive of newsletters, not a
        // pile of collection threads.
        const { error: insertError } = await (supabase as any).from('board_posts').insert({
          community_id: communityId,
          category_id: board.id,
          author_id: profile.id,
          title,
          content,
          is_pinned: true,
        });
        if (insertError) {
          setPostError(userFacingError(insertError, 'The draft is still here. Try posting it again.'));
          return;
        }
      }
      setPostedTo(`${board.name} → ${title}`);
    } finally {
      setPosting(false);
    }
  };

  const sinceLabel = cycleStart
    ? (() => {
        const [year, month, day] = cycleStart.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', timeZone: 'UTC',
        });
      })()
    : null;

  // The draft is an internal thing. It quotes members before Nat has chosen what
  // stays in, and a half-written letter about people is not something they
  // should meet by wandering into a URL. The function refuses non-owners too —
  // this is so nobody has to be refused in the first place.
  if (profile && !profile.is_owner) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fffdf5' }} edges={['top']}>
        <View className="flex-1 items-center justify-center px-8">
          <Image source={hiveBee} style={{ width: 44, height: 44, marginBottom: 18 }} contentFit="contain" />
          <Text
            style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, color: '#313130', textAlign: 'center' }}
          >
            The Buzz is written upstairs
          </Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 23,
              color: 'rgba(49,49,48,0.6)', textAlign: 'center', marginTop: 12,
            }}
          >
            Nat puts each month&rsquo;s letter together. You&rsquo;ll find every
            published one on the Newsletter tab — and anything you add to the
            check-in can go straight into the next one.
          </Text>
          <Pressable onPress={close} className="mt-7 px-5 py-3 rounded-full" style={{ backgroundColor: '#bd9348' }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fffdf5' }} edges={['top']}>
      <View
        className="flex-row items-center px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(189,147,72,0.18)' }}
      >
        <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close the newsletter draft" className="mr-3">
          <Ionicons name="chevron-back" size={24} color="#bd9348" />
        </Pressable>
        <Image source={hiveBee} style={{ width: 26, height: 26, marginRight: 10 }} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 17, color: '#2d2d2d' }}>
            Newsletter Draft
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a7c42' }}>
            {sinceLabel ? `Everything since ${sinceLabel}` : 'This cycle'}
          </Text>
        </View>
        <Pressable
          onPress={() => void loadDraft()}
          hitSlop={10}
          disabled={loading}
          accessibilityLabel="Rebuild the draft"
          style={{ opacity: loading ? 0.4 : 1, marginRight: 14 }}
        >
          <Ionicons name="refresh" size={20} color="#bd9348" />
        </Pressable>

      </View>

      {/* The page's one scroller — BounceScrollView so it bounces at both
          ends on every platform, Nat's standing rule for every page. */}
      <BounceScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center', gap: 12 }}>
            {/* Was an ActivityIndicator painted #fffdf5 — cream on the cream
                page, an invisible spinner. The bee is the app's loading state. */}
            <ThinkingBee />
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a7c42' }}>
              Gathering the cycle…
            </Text>
          </View>
        ) : error ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#8a5a5a', textAlign: 'center' }}>
              {error}
            </Text>
            <Pressable
              onPress={() => void loadDraft()}
              style={{ backgroundColor: '#bd9348', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#fff' }}>Try again</Text>
            </Pressable>
          </View>
        ) : sections.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 34 }}>🗞️</Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#6f6559', textAlign: 'center' }}>
              Nothing's landed since the last meeting yet. Shout-outs and compliments
              show up here as people add them at the halfway check-in.
            </Text>
          </View>
        ) : (
          <>
            {writing ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'center',
                  gap: 8,
                  marginBottom: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: '#fdf3dc',
                }}
              >
                <ThinkingBee />
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#8a6b30' }}>
                  Writing the letter — here are the facts meanwhile
                </Text>
              </View>
            ) : null}

            {prose ? (
              <View style={{ flexDirection: 'row', alignSelf: 'center', gap: 6, marginBottom: 14 }}>
                {(['letter', 'facts'] as const).map((option) => {
                  const selected = view === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setView(option)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 7,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: selected ? 'rgba(189,147,72,0.7)' : 'rgba(189,147,72,0.25)',
                        backgroundColor: selected ? '#fdf3dc' : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                          fontSize: 13,
                          color: selected ? '#8a6b30' : '#9a8060',
                        }}
                      >
                        {option === 'letter' ? 'The letter' : 'The facts'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* The cover — the SAME header the email wears: the round logo on
                its white tile, then the issue title in the amber caps line.
                It wore the old Wix-era "H.I.V.E. MONTHLY NEWSLETTER" masthead
                until 2026-08-12; Nat, once the page's job clicked for her:
                "this is just the editors screen. i want to make sure it
                matches how it is in the email." One look, three surfaces. */}
            <View
              className="mb-4 bg-paper rounded-2xl border border-gold/20"
              style={{ alignItems: 'center', overflow: 'hidden', paddingVertical: 26, gap: 10 }}
            >
              <Image
                source={require('../../assets/hive-logo.png')}
                accessibilityLabel="H.I.V.E. — Human, Insight, Vision, Execution"
                style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: '#ffffff' }}
                resizeMode="contain"
              />
              <Text
                style={{
                  fontFamily: 'Lato_700Bold', fontSize: 12, letterSpacing: 3,
                  textTransform: 'uppercase', color: '#8a6a2f', textAlign: 'center',
                  paddingHorizontal: 20,
                }}
              >
                {recapTitle ?? 'The Buzz'}
              </Text>
            </View>

            {view === 'letter' && prose ? (
              <View className="mb-4 bg-paper rounded-2xl border border-gold/20 px-5 py-5">
                <LetterProse text={prose} />
              </View>
            ) : (
              // `art` turns on Nat's drawn section headers. The meeting summary
              // renders the same component without it — see SummarySections.
              <SummarySections sections={sections} art />
            )}
            {existingDraft ? (
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 18, color: '#8a7a5e', textAlign: 'center', marginTop: 6, marginBottom: 10 }}>
                This is the letter in progress — it is already saved. When it is
                ready, send it from Admin → Newsletter → Test & send.
              </Text>
            ) : (
            <Pressable
              onPress={() => void postToBoard()}
              disabled={posting}
              style={({ pressed }) => ({
                alignSelf: 'center',
                marginTop: 6,
                marginBottom: 10,
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(189,147,72,0.45)',
                backgroundColor: pressed ? '#fbf4e3' : 'transparent',
                opacity: posting ? 0.6 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>
                {posting ? 'Posting…' : '📰 Save to The Buzz'}
              </Text>
            </Pressable>
            )}
            {postedTo ? (
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#7a9a6b', textAlign: 'center', marginBottom: 8 }}>
                Posted — {postedTo}. Edit it there to match what actually went out.
              </Text>
            ) : null}
            {postError ? (
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#dc2626', textAlign: 'center', marginBottom: 8 }}>
                {postError}
              </Text>
            ) : null}
            <Text
              style={{
                fontFamily: 'Lato_400Regular',
                fontSize: 12,
                color: '#a09585',
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              {view === 'letter' && prose
                ? 'A draft in your voice, from real facts only. Anything in [brackets] is yours to fill.'
                : 'Gathered from the boards, to-dos, and check-ins — nothing was written twice.'}
            </Text>
          </>
        )}
      </BounceScrollView>
    </SafeAreaView>
  );
}
