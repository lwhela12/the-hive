import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from '../../components/ui/SafeArea';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { userFacingError } from '../../lib/userFacingError';
import { currentNewsletterDraft } from '../../lib/newsletterIssues';
import { useAuth } from '../../lib/hooks/useAuth';
import { getAppNewsForMonth, isPublicNewsletterSafeAppNews } from '../../lib/appNews';
import { useAppNews } from '../../lib/hooks/useAppNews';
import { SummarySections, type SummarySection } from '../../components/meetings/SummarySections';
import { readLetter } from '../../lib/newsletterHeaders';
import { pickSingleImage } from '../../lib/imagePicker';
import { uploadSingleImage } from '../../lib/attachmentUpload';
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
 * The newsletter is written here. HIVE puts everything that happened during
 * the month in front of Nat, drafts the first pass, and then leaves the actual
 * title and letter open for her to shape without moving to another screen.
 * Preview reads those same words through the email/public renderer; Facts keeps
 * the source material beside them. Saving makes a private draft. Sending stays
 * a separate, explicit step in Admin.
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
 * The editor keeps that original string intact, so Write and Preview are two
 * views of the same words rather than separate copies that can drift.
 *
 * Exported because the archive needs the same treatment: The Buzz (app/(app)/
 * buzz.tsx) still prints a whole letter into one `<Text>`. Swapping that for
 * `<LetterProse text={item.content} palette={...} />` with the space skin's
 * colours is the whole fix there.
 */
/**
 * A picture, written into the letter as a line of its own.
 *
 * `[[IMAGE:https://…/leo.jpg|Leo in his bee costume]]` on its own line becomes
 * the photo, right where it sits in the text — the same shape as
 * `[[BUTTON:tech]]` and for the same reason: the letter stays ONE source of
 * truth, so a picture Nat places once shows up in the email, in The Buzz and
 * on the public site without any of the three keeping its own copy.
 *
 * Nat asked for this on 2026-09-01, writing September's issue: *"i want to be
 * able to add pics to the newsletters i think."*
 *
 * **https only.** The marker is written by a person into a body of text that
 * three renderers turn into markup, so the one thing that must never happen is
 * a `javascript:` or `data:` URL travelling that path. Anything else renders as
 * nothing rather than as a broken picture.
 *
 * The alt text after the pipe is optional and encouraged — a good many people
 * read their mail with images turned off.
 */
export const LETTER_IMAGE = /^\[\[IMAGE:(https:\/\/[^\]|\s]+)(?:\|([^\]]*))?\]\]$/;

/**
 * One photo, sized from the picture itself.
 *
 * The height is not knowable before the file loads, so it opens at the shape of
 * a phone photo and corrects itself on `onLoad` rather than reserving a square
 * and jumping. Full width of the letter's column, never wider.
 */
function LetterImage({ src, alt }: { src: string; alt: string }) {
  const [ratio, setRatio] = useState(4 / 3);
  return (
    <Image
      source={{ uri: src }}
      accessibilityLabel={alt || undefined}
      alt={alt || undefined}
      onLoad={(event) => {
        const { width, height } = event.source ?? {};
        if (width && height) setRatio(width / height);
      }}
      style={{
        width: '100%',
        aspectRatio: ratio,
        borderRadius: 14,
        marginVertical: 14,
        backgroundColor: 'rgba(189,147,72,0.08)',
      }}
      contentFit="cover"
    />
  );
}

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
          const picture = LETTER_IMAGE.exec(block.text.trim());
          if (picture) {
            return <LetterImage key={i} src={picture[1]} alt={(picture[2] ?? '').trim()} />;
          }

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
              <LinkifiedText
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
              >{block.text}</LinkifiedText>
            );

          case 'label':
            return (
              <LinkifiedText
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
              >{block.text}</LinkifiedText>
            );

          case 'dated':
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                <LinkifiedText
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
                </LinkifiedText>
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
                <LinkifiedText
                  style={{
                    fontFamily: 'Lato_700Bold',
                    fontSize: 15,
                    lineHeight: 24,
                    color: palette.label,
                    minWidth: 18,
                  }}
                >{`${block.marker}.`}</LinkifiedText>
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
                <LinkifiedText
                  selectable
                  style={{
                    fontFamily: 'LibreBaskerville_400Regular',
                    fontSize: 15,
                    lineHeight: 26,
                    color: palette.quiet,
                  }}
                >{block.text}</LinkifiedText>
              </View>
            );

          case 'attribution':
            return (
              <LinkifiedText
                key={i}
                selectable
                style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: 13,
                  color: palette.label,
                  paddingLeft: 17,
                  marginBottom: 12,
                }}
              >{`— ${block.text}`}</LinkifiedText>
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
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { profile } = useAuth();
  const { appNews: mergedAppNews } = useAppNews();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<SummarySection[]>([]);
  const [cycleStart, setCycleStart] = useState<string | null>(null);
  const [recapTitle, setRecapTitle] = useState<string | null>(null);
  const [prose, setProse] = useState<string | null>(null);
  /** Once a draft has an id, every edit on this page saves back to that issue. */
  const [draftPostId, setDraftPostId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'not_saved' | 'unsaved' | 'saving' | 'saved' | 'error'>('idle');
  const editRevision = useRef(0);
  // Write is the default because this is an editor. Preview and Facts are
  // checks beside the work, not a read-only page the writer has to escape.
  const [view, setView] = useState<'write' | 'preview' | 'facts'>('write');
  const [writing, setWriting] = useState(false);
  const [writingError, setWritingError] = useState<string | null>(null);
  const [pictureBusy, setPictureBusy] = useState(false);
  const [pictureNote, setPictureNote] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postedTo, setPostedTo] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const draftInputRef = useRef<TextInput>(null);
  const [draftSelection, setDraftSelection] = useState({ start: 0, end: 0 });

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
    setLoading(true);
    setError(null);
    setProse(null);
    setWritingError(null);
    setDraftPostId(null);
    setSaveState('idle');
    editRevision.current += 1;

    // What's new in the app, straight from the list every member already sees on
    // Home. This used to come off the meeting deck's frozen copy, so a recap
    // written after the meeting missed everything shipped since it.
    const month = lastMonth();
    const appNews = getAppNewsForMonth(month, mergedAppNews)
      .filter(isPublicNewsletterSafeAppNews)
      .slice(0, 5)
      .map((entry) => (entry.detail ? `${entry.title} — ${entry.detail}` : entry.title));

    const draftBody = { month, appNews };

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
      .eq('topic_kind', 'newsletter')
      .order('created_at', { ascending: true })
      .limit(1);
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
        setDraftPostId(inProgress.id);
        setSaveState('saved');
        return;
      }
    }

    if ((data.sections ?? []).length === 0) return;

    setWriting(true);
    const { data: written, error: writingInvokeError } = await supabase.functions.invoke('draft-newsletter', {
      body: { ...draftBody, includeProse: true },
    });
    if (writingInvokeError || !written?.success) {
      setWritingError('The letter could not be written just now. Your facts are still here — tap Rebuild the draft to try again.');
    } else {
      if ((written.sections ?? []).length > 0) setSections(written.sections as SummarySection[]);
      const generated = typeof written.prose === 'string' && written.prose.trim() ? written.prose : null;
      setProse(generated);
      if (!generated) {
        setWritingError(
          typeof written.writing_error === 'string'
            ? written.writing_error
            : 'The letter could not be written just now. Your facts are still here — tap Rebuild the draft to try again.',
        );
      }
      if (generated && profile) {
        // A fresh draft is working material, not a thing Nat should have to
        // remember to protect. Give it its private home immediately so a page
        // refresh returns to this version instead of asking the writer for a
        // brand-new interpretation of the same month.
        const { data: boards } = await supabase
          .from('board_categories')
          .select('id, name, community_id')
          .eq('topic_kind', 'newsletter')
          .order('created_at', { ascending: true })
          .limit(1);
        const board = ((boards ?? []) as { id: string; name: string; community_id: string }[])[0];
        const title = String(written.recap_title ?? data.recap_title ?? '').trim();
        if (!board || !title) {
          setSaveState('not_saved');
        } else {
          const { data: inserted, error: insertError } = await (supabase as any)
            .from('board_posts')
            .insert({
              community_id: board.community_id,
              category_id: board.id,
              author_id: profile.id,
              title,
              content: generated,
              is_pinned: true,
            })
            .select('id')
            .single();
          if (insertError || !inserted?.id) {
            setSaveState('not_saved');
            setPostError(userFacingError(insertError, 'Your draft is here, but it needs saving. Try Save draft to The Buzz.'));
          } else {
            setDraftPostId(inserted.id);
            setSaveState('saved');
            setPostedTo(`${board.name} → ${title}`);
          }
        }
      } else if (generated) {
        setSaveState('not_saved');
      }
    }
    setWriting(false);
  }, [mergedAppNews, profile]);

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

  /**
   * Letters stay plain text, with one intentionally tiny bit of inline
   * formatting. The marker is rendered by the app, archive and email alike;
   * we never store HTML from the editor.
   */
  const boldSelection = () => {
    const text = prose ?? '';
    const { start, end } = draftSelection;
    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);
    const next = selected ? `${before}**${selected}**${after}` : `${before}****${after}`;
    editRevision.current += 1;
    setProse(next);
    setSaveState(draftPostId ? 'unsaved' : 'not_saved');
    const cursor = selected ? end + 4 : start + 2;
    setDraftSelection({ start: cursor, end: cursor });
    requestAnimationFrame(() => draftInputRef.current?.focus());
  };

  /**
   * Put a photograph in the letter.
   *
   * Nat writes the letter as text, so a picture has to be a line of text too —
   * this uploads the photo and places its `[[IMAGE:…]]` line directly into the
   * editable draft. The line remains the single source of truth for the email,
   * The Buzz and the public archive; the writer can move it to the right spot
   * and replace the accessible description without leaving this page.
   */
  const addPicture = async () => {
    if (!profile || pictureBusy) return;
    setPictureBusy(true);
    setPictureNote(null);
    try {
      const image = await pickSingleImage();
      if (!image) return;
      const uploaded = await uploadSingleImage(profile.id, image);
      if (!uploaded?.url) {
        setPictureNote('That picture did not upload. Try it again in a moment.');
        return;
      }
      // The alt text is a placeholder on purpose: the marker has just landed in
      // a letter she is writing, and describing her own photo is one
      // small edit. A blank one would have shipped with nothing to read.
      const marker = `[[IMAGE:${uploaded.url}|Describe the picture here]]`;
      editRevision.current += 1;
      setProse((current) => `${String(current ?? '').trimEnd()}\n\n${marker}\n`);
      setSaveState(draftPostId ? 'unsaved' : 'not_saved');
      setView('write');
      setPictureNote('Added to the bottom of the draft. Move the picture line wherever you want it.');
    } catch (pictureError) {
      setPictureNote(userFacingError(pictureError, 'That picture did not upload.'));
    } finally {
      setPictureBusy(false);
    }
  };

  const markEdited = () => {
    editRevision.current += 1;
    setSaveState(draftPostId ? 'unsaved' : 'not_saved');
    setPostError(null);
    setPostedTo(null);
  };

  /** A saved issue keeps itself safe while Nat writes. It never sends. */
  const saveExistingDraft = useCallback(async (revision: number) => {
    if (!draftPostId || prose === null) return;
    const title = String(recapTitle ?? '').trim();
    if (!title || !prose.trim()) {
      setSaveState('error');
      setPostError('A newsletter needs both a title and some words before it can save.');
      return;
    }

    setSaveState('saving');
    const { error: saveError } = await (supabase as any)
      .from('board_posts')
      .update({ title, content: prose, edited_at: new Date().toISOString() })
      .eq('id', draftPostId);

    if (saveError) {
      setSaveState('error');
      setPostError(userFacingError(saveError, 'Your words are still on this page, but they did not save. Try again.'));
      return;
    }
    // If another keystroke landed while the request was in flight, schedule
    // one more save instead of falsely calling the newer words saved.
    setSaveState(editRevision.current === revision ? 'saved' : 'unsaved');
  }, [draftPostId, prose, recapTitle]);

  useEffect(() => {
    if (!draftPostId || saveState !== 'unsaved') return;
    const revision = editRevision.current;
    const timer = setTimeout(() => { void saveExistingDraft(revision); }, 700);
    return () => clearTimeout(timer);
  }, [draftPostId, prose, recapTitle, saveExistingDraft, saveState]);

  // The newsletter should be reachable more than one way: email, the public
  // site, and here. This is the in-app writing door — the first save gives the
  // issue a private home in The Buzz, then edits keep saving on this page.
  const postToBoard = async () => {
    if (!profile || posting || sections.length === 0) return;
    setPosting(true);
    setPostError(null);
    try {
      const { data: boards } = await supabase
        .from('board_categories')
        .select('id, name, community_id')
        .eq('topic_kind', 'newsletter')
        .order('created_at', { ascending: true })
        .limit(1);
      const board = ((boards ?? []) as { id: string; name: string; community_id: string }[])[0];
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
      const title = String(recapTitle ?? `The Buzz — ${month} HIVE Recap`).trim();

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
      let savedId: string | null = null;
      if ((existing ?? []).length > 0) {
        savedId = (existing as { id: string }[])[0].id;
        const { error: updateError } = await (supabase as any)
          .from('board_posts')
          .update({ title, content, is_pinned: true, edited_at: new Date().toISOString() })
          .eq('id', savedId);
        if (updateError) {
          setPostError(userFacingError(updateError, 'The draft is still here. Try updating the post again.'));
          return;
        }
      } else {
        // Pinned so the published letter sits above the shout-out thread that
        // fed it — the board should read as an archive of newsletters, not a
        // pile of collection threads.
        const { data: inserted, error: insertError } = await (supabase as any)
          .from('board_posts')
          .insert({
            community_id: board.community_id,
            category_id: board.id,
            author_id: profile.id,
            title,
            content,
            is_pinned: true,
          })
          .select('id')
          .single();
        if (insertError) {
          setPostError(userFacingError(insertError, 'The draft is still here. Try posting it again.'));
          return;
        }
        savedId = inserted?.id ?? null;
      }
      setDraftPostId(savedId);
      setSaveState(savedId ? 'saved' : 'error');
      setPostedTo(savedId ? `${board.name} → ${title}` : null);
      if (!savedId) setPostError('The draft saved, but HIVE could not confirm its new address. Reopen it from The Buzz before editing more.');
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
              show up here as people add them at End of the month.
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

            {writingError ? (
              <View
                style={{
                  alignSelf: 'center', marginBottom: 14, paddingHorizontal: 14, paddingVertical: 9,
                  borderRadius: 10, backgroundColor: '#fff1e8', borderWidth: 1, borderColor: 'rgba(182,95,95,0.25)',
                }}
              >
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 18, color: '#8a4d4d', textAlign: 'center' }}>
                  {writingError}
                </Text>
              </View>
            ) : null}

            {prose ? (
              <View style={{ flexDirection: 'row', alignSelf: 'center', gap: 6, marginBottom: 14 }}>
                {(['write', 'preview', 'facts'] as const).map((option) => {
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
                        {option === 'write' ? 'Write' : option === 'preview' ? 'Preview' : 'The facts'}
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
              {view === 'write' ? (
                <TextInput
                  value={recapTitle ?? ''}
                  onChangeText={(next) => { setRecapTitle(next); markEdited(); }}
                  accessibilityLabel="Newsletter title"
                  placeholder="The Buzz — this month’s recap"
                  placeholderTextColor="#a09585"
                  style={{
                    width: '100%', maxWidth: 680, paddingHorizontal: 20, paddingVertical: 8,
                    fontFamily: 'Lato_700Bold', fontSize: 13, letterSpacing: 2,
                    color: '#8a6a2f', textAlign: 'center',
                    borderWidth: 1, borderColor: 'rgba(189,147,72,0.35)', borderRadius: 10,
                    backgroundColor: '#fffdf7',
                  }}
                />
              ) : (
                <LinkifiedText
                  style={{
                    fontFamily: 'Lato_700Bold', fontSize: 12, letterSpacing: 3,
                    textTransform: 'uppercase', color: '#8a6a2f', textAlign: 'center',
                    paddingHorizontal: 20,
                  }}
                >
                  {recapTitle ?? 'The Buzz'}
                </LinkifiedText>
              )}
            </View>

            {view === 'write' && prose ? (
              <View className="mb-4 bg-paper rounded-2xl border border-gold/20 px-5 py-5">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, color: '#8a7a5e' }}>
                      Select words, then
                    </Text>
                    <Pressable
                      onPress={boldSelection}
                      accessibilityRole="button"
                      accessibilityLabel="Bold selected newsletter text"
                      style={({ pressed }) => ({
                        minWidth: 28, alignItems: 'center', paddingVertical: 3, paddingHorizontal: 7,
                        borderRadius: 6, borderWidth: 1, borderColor: 'rgba(189,147,72,0.45)',
                        backgroundColor: pressed ? '#fdf3dc' : '#fffdf7',
                      })}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#6f5425' }}>B</Text>
                    </Pressable>
                  </View>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={{
                      fontFamily: 'Lato_700Bold', fontSize: 12,
                      color: saveState === 'error' ? '#b65f5f' : saveState === 'saved' ? '#6f8b62' : '#9a7c42',
                    }}
                  >
                    {saveState === 'saving'
                      ? 'Saving…'
                      : saveState === 'saved'
                        ? 'Saved'
                        : saveState === 'unsaved'
                          ? 'Unsaved changes'
                          : saveState === 'error'
                            ? 'Couldn’t save'
                            : 'Not saved yet'}
                  </Text>
                </View>
                <TextInput
                  ref={draftInputRef}
                  value={prose}
                  onChangeText={(next) => { setProse(next); markEdited(); }}
                  onSelectionChange={(event) => setDraftSelection(event.nativeEvent.selection)}
                  selection={draftSelection}
                  accessibilityLabel="Newsletter draft"
                  multiline
                  textAlignVertical="top"
                  placeholder="Write this month’s Buzz…"
                  placeholderTextColor="#a09585"
                  style={{
                    minHeight: 620, paddingHorizontal: 16, paddingVertical: 16,
                    fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 24,
                    color: '#3f3a33', backgroundColor: '#fffdf7',
                    borderWidth: 1, borderColor: 'rgba(189,147,72,0.35)', borderRadius: 12,
                  }}
                />
              </View>
            ) : view === 'preview' && prose ? (
              <View className="mb-4 bg-paper rounded-2xl border border-gold/20 px-5 py-5">
                <LetterProse text={prose} />
              </View>
            ) : (
              // `art` turns on Nat's drawn section headers. The meeting summary
              // renders the same component without it — see SummarySections.
              <SummarySections sections={sections} art />
            )}
            {/* A picture is a line of text in the letter, so getting one is
                getting that line — see `addPicture`. Sits under the letter
                because that is where she is looking when she decides a
                paragraph wants a photograph beside it. */}
            <Pressable
              onPress={() => void addPicture()}
              disabled={pictureBusy}
              style={({ pressed }) => ({
                alignSelf: 'center',
                marginTop: 10,
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(189,147,72,0.45)',
                backgroundColor: pressed ? '#fbf4e3' : 'transparent',
                opacity: pictureBusy ? 0.6 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>
                {pictureBusy ? 'Adding…' : '🖼️ Add a picture'}
              </Text>
            </Pressable>
            {pictureNote ? (
              <Text
                style={{
                  fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 18,
                  color: '#8a7a5e', textAlign: 'center', marginTop: 8, paddingHorizontal: 24,
                }}
              >
                {pictureNote}
              </Text>
            ) : null}

            {draftPostId ? (
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 18, color: '#8a7a5e', textAlign: 'center', marginTop: 6, marginBottom: 10 }}>
                Your edits save here automatically. Nothing sends from this page —
                when it is ready, use Admin → Newsletter → Test & send.
              </Text>
            ) : (
            <Pressable
              onPress={() => void postToBoard()}
              disabled={posting || !String(recapTitle ?? '').trim() || !String(prose ?? '').trim()}
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
                opacity: posting || !String(recapTitle ?? '').trim() || !String(prose ?? '').trim() ? 0.6 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>
                {posting ? 'Saving…' : '📰 Save draft to The Buzz'}
              </Text>
            </Pressable>
            )}
            {postedTo ? (
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#7a9a6b', textAlign: 'center', marginBottom: 8 }}>
                Saved — {postedTo}. Keep editing it right here.
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
              {view === 'write'
                ? 'This is the real draft. Preview shows exactly how the same words will read.'
                : view === 'preview' && prose
                  ? 'The email and public archive use this same preview.'
                  : 'Gathered from the boards, to-dos, and check-ins — nothing was written twice.'}
            </Text>
          </>
        )}
      </BounceScrollView>
    </SafeAreaView>
  );
}
