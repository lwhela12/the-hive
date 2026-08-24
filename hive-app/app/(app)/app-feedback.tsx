import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { usePageSkin } from '../../lib/pageSkin';
import { AppHeader } from '../../components/navigation';
import { SpaceBackdrop } from '../../components/ui/SpaceBackdrop';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
import { HeaderTabs } from '../../components/ui/HeaderTabs';
import { SelectedImage } from '../../lib/imagePicker';
import { SelectedFile } from '../../lib/filePicker';
import { uploadMultipleImages, uploadMultipleFiles } from '../../lib/attachmentUpload';
import type { AppFeedback, Attachment } from '../../types';
import { consumeFeedbackDraft, validFeedbackCaptureNotice } from '../../lib/feedbackDraft';
import { FEEDBACK_WHERE_OPTIONS, validFeedbackOriginLabel } from '../../lib/feedbackOrigin';

import { ComposerBar } from '../../components/ui/ComposerBar';
import { SignedImage } from '../../components/ui/SignedImage';
import { ThinkingBee } from '../../components/ui/ThinkingBee';
/**
 * App Feedback — its own place, at last.
 *
 * It used to be a shortcut that hunted through one HIVE's wishes for a title
 * containing "bug report" and opened that wish. Nat found the seam by clicking:
 * she pressed App Feedback at HIVE-Wide and arrived on Production HIVE's home
 * page, because a wish needs a HIVE and HIVE-Wide is not one. Her read was
 * right, and her fix was better than a redirect — "I think it could look cooler
 * & more upscale if the app feedback was its own entity... Have a little intake
 * form there, instead of linking to a wish? i like that a lot."
 *
 * So: no community id anywhere in the path. This screen means the same thing
 * wherever you are standing, which is what `atWholeHive: 'same'` promised in the
 * rail all along. Where you happened to be is still sent, because it is useful
 * context for a bug — but as a fact about the report, not a requirement for
 * filing one.
 *
 * 2026-08-04, three changes, all Nat's:
 *
 *   The words are hers now. The old ones described the plumbing ("not to a
 *   board, not to your HIVE"); hers say who is listening and why, which is the
 *   only part a member cares about.
 *
 *   A clip and a mic, because the fastest bug report is a marked-up screenshot
 *   and the second fastest is talking. "any and every time we have a text box we
 *   always want both of those."
 *
 *   And it answers back. "does it show the turn around and the fix as well? or
 *   just a list of grievances?" — it was a list of grievances. Owners get a
 *   third tab and can reply; the reply lands here and in the member's inbox.
 */

type Kind = 'bug' | 'idea' | 'confusing' | 'love';

const KINDS: { key: Kind; emoji: string; label: string; prompt: string }[] = [
  {
    key: 'bug',
    emoji: '🐞',
    label: 'Something is broken',
    prompt: 'What did you click, and what happened instead of what you expected?',
  },
  {
    key: 'idea',
    emoji: '💡',
    label: 'I have an idea',
    prompt: 'What would you like the HIVE to be able to do?',
  },
  {
    key: 'confusing',
    emoji: '🤔',
    label: 'This confused me',
    prompt: 'What did you expect to find, and where did you look for it?',
  },
  {
    key: 'love',
    emoji: '💛',
    label: 'I love this bit',
    prompt: 'What worked? Knowing what to keep is as useful as knowing what to fix.',
  },
];

const KIND_BY_KEY = Object.fromEntries(KINDS.map((k) => [k.key, k])) as Record<
  Kind,
  (typeof KINDS)[number]
>;

type SentItem = AppFeedback;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Matches MAX_ATTACHMENTS in the app-feedback edge function. The picker used to
 * allow 5 images AND 5 files while the function silently kept the first 6 of
 * whatever arrived — so attaching five screenshots and three logs filed six of
 * them, dropped the logs, and said "Sent."
 */
const MAX_FEEDBACK_ATTACHMENTS = 6;

/**
 * The places a member can be. Named the way the rail names them, so a report
 * says "Boards" and not "the threads bit" — which matters once there are enough
 * reports to sort.
 */
const WHERE_OPTIONS = FEEDBACK_WHERE_OPTIONS;

/** Everything the list needs, in one place, so the two tabs cannot drift apart. */
const FEEDBACK_COLUMNS =
  'id, author_id, author_name, community_id, kind, message, created_at, status, attachments, reply, replied_at, replied_by, replied_by_name, where_in_app, platform';

/**
 * The tab row, and an arrow when there is more of it than the screen.
 *
 * Nat, from her iPhone (2026-08-06): "you cant see all the tabs, its cut off, we
 * have to make it fit on an iphone screen better/easier." The row read
 * "Say something | What you've sent (0) | E…" and stopped there — the third tab
 * was not merely ugly, it was unreachable, and for an owner that is the tab
 * holding every report anybody has ever sent.
 *
 * The tabs are shorter now (see the labels below) and fit a 375-point phone with
 * room to spare, so this wrapper does nothing most days. It is here for the day
 * a count reaches three digits or somebody opens the app on a smaller screen:
 * the row slides instead of being sliced, and the arrow says so. A strip that
 * scrolls with no sign it scrolls is what caused the confusion in the first
 * place, so the arrow is the whole point of the wrapper — it appears only while
 * there is genuinely something further right, and goes when you reach the end.
 */
function TabStrip({ children }: { children: ReactNode }) {
  const skin = usePageSkin();
  const [visibleWidth, setVisibleWidth] = useState(0);
  const [rowWidth, setRowWidth] = useState(0);
  const [scrolledBy, setScrolledBy] = useState(0);
  // Four points of slack, so a rounding difference between the row and the
  // window never leaves an arrow pointing at nothing.
  const moreToTheRight = rowWidth - visibleWidth - scrolledBy > 4;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => setVisibleWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setRowWidth(width)}
        onScroll={(event) => setScrolledBy(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
      {moreToTheRight ? (
        // Sits over the last visible tab and lets every press through to it.
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center' }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: skin.card,
              borderWidth: 1,
              borderColor: skin.border,
            }}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, lineHeight: 16, color: skin.gold }}>
              ›
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function AppFeedbackScreen() {
  const { profile, communityId } = useAuth();
  const skin = usePageSkin();
  const isOwner = profile?.is_owner === true;
  // The app's own phone line, the one the layout and the side rail already use.
  const { width } = useWindowDimensions();
  const narrow = width < 768;
  const params = useLocalSearchParams<{ originLabel?: string | string[]; captureNotice?: string | string[] }>();
  const routeOriginLabel = validFeedbackOriginLabel(
    Array.isArray(params.originLabel) ? params.originLabel[0] : params.originLabel
  );
  const captureNotice = validFeedbackCaptureNotice(Array.isArray(params.captureNotice)
    ? params.captureNotice[0]
    : params.captureNotice);

  const [tab, setTab] = useState<'say' | 'sent' | 'all'>('say');
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [whereInApp, setWhereInApp] = useState('');
  const [whereOpen, setWhereOpen] = useState(false);
  const [whereOther, setWhereOther] = useState(false);
  const [sending, setSending] = useState(false);
  const inFlightRef = useRef(false);
  const [result, setResult] = useState<{ ok: boolean; emailed: boolean; text: string } | null>(null);

  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const capturedDraftRef = useRef<ReturnType<typeof consumeFeedbackDraft>>(null);

  useEffect(() => {
    const draft = consumeFeedbackDraft();
    capturedDraftRef.current = draft;
    const origin = draft?.originLabel ?? routeOriginLabel;
    if (origin) setWhereInApp(origin);
    if (draft?.screenshot) setSelectedImages([draft.screenshot]);
    return () => {
      capturedDraftRef.current?.dispose?.();
      capturedDraftRef.current = null;
    };
    // The private handoff is intentionally consumed only once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onImagesChange = useCallback((next: SelectedImage[]) => {
    const captured = capturedDraftRef.current;
    if (captured && !next.some((image) => image.uri === captured.screenshot.uri)) {
      captured.dispose?.();
      capturedDraftRef.current = null;
    }
    setSelectedImages(next);
  }, []);

  // The "what was in the box before the mic opened" bookkeeping used to live
  // here, hand-written. It lives in ComposerBar now, through the shared
  // `useDictation` hook, which has been got wrong twice and is right once.

  const [sent, setSent] = useState<SentItem[] | null>(null);
  const [all, setAll] = useState<SentItem[] | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const loadSent = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase
      .from('app_feedback')
      .select(FEEDBACK_COLUMNS)
      .eq('author_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) {
      console.warn('Could not load your feedback', error);
      setSent([]);
      return;
    }
    setSent((data ?? []) as SentItem[]);
  }, [profile?.id]);

  // Owners only — and the database agrees, so this is a convenience, not the
  // guard. A member running this query gets their own rows back and nothing else.
  const loadAll = useCallback(async () => {
    if (!isOwner) {
      setAll([]);
      return;
    }
    const { data, error } = await supabase
      .from('app_feedback')
      .select(FEEDBACK_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.warn('Could not load all feedback', error);
      setAll([]);
      return;
    }
    setAll((data ?? []) as SentItem[]);
  }, [isOwner]);

  useEffect(() => {
    void loadSent();
  }, [loadSent]);

  useEffect(() => {
    if (tab === 'all') void loadAll();
  }, [tab, loadAll]);

  const hasAttachments = selectedImages.length > 0 || selectedFiles.length > 0;
  const capturedScreenshot = capturedDraftRef.current?.screenshot ?? null;
  const canSend = (message.trim().length > 0 || hasAttachments) && !sending;

  const send = useCallback(async () => {
    if (!canSend || !profile?.id || inFlightRef.current) return;
    inFlightRef.current = true;
    setSending(true);
    setResult(null);
    const uploaded: Attachment[] = [];
    try {
      if (selectedImages.length + selectedFiles.length > MAX_FEEDBACK_ATTACHMENTS) {
        throw new Error('Too many attachments');
      }
      // Uploaded from here, straight into this member's own folder — the same
      // path boards and messages use. The function checks the URLs come back
      // from that folder before it believes them.
      let failedUploads = 0;
      if (selectedImages.length > 0) {
        const images = await uploadMultipleImages(profile.id, selectedImages);
        uploaded.push(...images.attachments);
        failedUploads += selectedImages.length - images.attachments.length;
      }
      if (selectedFiles.length > 0) {
        const files = await uploadMultipleFiles(profile.id, selectedFiles);
        uploaded.push(...files.attachments);
        failedUploads += selectedFiles.length - files.attachments.length;
      }

      if (hasAttachments && uploaded.length === 0) {
        throw new Error('None of the attachments uploaded');
      }

      const { data, error } = await supabase.functions.invoke('app-feedback', {
        body: {
          kind,
          message: message.trim(),
          where_in_app: whereInApp.trim() || null,
          attachments: uploaded,
          // Context, not a requirement. NULL is a real answer: it means the
          // person was standing at HIVE-Wide when they said it.
          community_id: communityId ?? null,
          platform: Platform.OS === 'web' ? 'web' : Platform.OS,
        },
      });

      if (error) throw error;

      setMessage('');
      setWhereInApp('');
      setWhereOther(false);
      setWhereOpen(false);
      setSelectedImages([]);
      setSelectedFiles([]);
      capturedDraftRef.current?.dispose?.();
      capturedDraftRef.current = null;
      // Told the truth about which half worked. The note is safe either way —
      // the function stores before it emails — so a failed email is a smaller
      // sentence, not an error.
      const missing =
        failedUploads > 0
          ? ` ${failedUploads} attachment${failedUploads === 1 ? '' : 's'} did not upload — worth sending again.`
          : '';
      setResult({
        ok: failedUploads === 0,
        emailed: !!data?.emailed,
        text:
          (data?.emailed
            ? 'Sent. It landed in Nat’s inbox as well as here.'
            : 'Saved. The email did not go out, but your note is safely filed and Nat will see it.') + missing,
      });
      void loadSent();
    } catch (error: any) {
      // The function stores before it emails. A network error is therefore
      // ambiguous, so never delete uploads here and risk breaking a saved row.
      console.warn('Could not send feedback', error);
      setResult({
        ok: false,
        emailed: false,
        text: 'That did not send. Your words are still here — try again in a moment.',
      });
    } finally {
      inFlightRef.current = false;
      setSending(false);
    }
  }, [canSend, kind, message, whereInApp, communityId, loadSent, profile?.id, selectedImages, selectedFiles, hasAttachments]);

  const sendReply = useCallback(
    async (id: string) => {
      const reply = (replyDrafts[id] ?? '').trim();
      if (!reply) return;
      setReplyingTo(id);
      try {
        const { error } = await supabase.functions.invoke('app-feedback', {
          body: { action: 'reply', feedback_id: id, reply, status: 'read' },
        });
        if (error) throw error;
        setReplyDrafts((prev) => ({ ...prev, [id]: '' }));
        void loadAll();
      } catch (error) {
        console.warn('Could not send the reply', error);
      } finally {
        setReplyingTo(null);
      }
    },
    [replyDrafts, loadAll]
  );

  const markStatus = useCallback(
    async (id: string, status: 'new' | 'read' | 'done') => {
      try {
        const { error } = await supabase.functions.invoke('app-feedback', {
          body: { action: 'reply', feedback_id: id, status },
        });
        if (error) throw error;
        void loadAll();
      } catch (error) {
        console.warn('Could not change that status', error);
      }
    },
    [loadAll]
  );

  const active = KIND_BY_KEY[kind];

  const styles = useMemo(
    () => ({
      panel: {
        backgroundColor: skin.card,
        borderColor: skin.border,
        borderWidth: 1,
        borderRadius: 16,
        borderTopLeftRadius: 0,
        padding: 18,
      } as const,
      field: {
        backgroundColor: skin.field,
        borderColor: skin.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        color: skin.ink,
        fontFamily: 'Lato_400Regular',
        fontSize: 15,
      } as const,
      caption: {
        fontFamily: 'Lato_700Bold',
        fontSize: 13,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: skin.inkSoft,
      } as const,
    }),
    [skin]
  );

  /** One report, drawn the same way in both lists. */
  const renderItem = (item: SentItem, index: number, mine: boolean) => {
    const images = (item.attachments ?? []).filter((a) => a.mime_type?.startsWith('image/'));
    const others = (item.attachments ?? []).filter((a) => !a.mime_type?.startsWith('image/'));

    return (
      <View
        key={item.id}
        style={{
          paddingVertical: 14,
          borderTopWidth: index === 0 ? 0 : 1,
          borderTopColor: skin.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <Text style={{ fontSize: 15 }}>{KIND_BY_KEY[item.kind]?.emoji ?? '💬'}</Text>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: skin.ink }}>
            {mine ? KIND_BY_KEY[item.kind]?.label ?? 'Feedback' : item.author_name ?? 'Someone'}
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: skin.inkSoft }}>
            · {timeAgo(item.created_at)}
            {!mine && item.where_in_app ? ` · ${item.where_in_app}` : ''}
            {!mine && item.platform ? ` · ${item.platform}` : ''}
          </Text>
          {item.status !== 'new' ? (
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 11,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: skin.gold,
              }}
            >
              {item.status === 'done' ? 'Done' : 'Read'}
            </Text>
          ) : null}
        </View>

        {item.message ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 22, color: skin.inkBody }}>
            {item.message}
          </Text>
        ) : null}

        {images.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
            {images.map((a) => (
              <SignedImage
                key={a.id || a.url}
                uri={a.url}
                style={{
                  width: 132,
                  height: 132,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: skin.border,
                  backgroundColor: skin.field,
                }}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : null}

        {others.map((a) => (
          <Text
            key={a.id || a.url}
            style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: skin.gold, marginTop: 6 }}
          >
            📎 {a.filename}
          </Text>
        ))}

        {/* The answer. This is the half that makes it worth writing the next one. */}
        {item.reply ? (
          <View
            style={{
              marginTop: 12,
              borderLeftWidth: 3,
              borderLeftColor: skin.gold,
              paddingLeft: 12,
            }}
          >
            <Text style={{ ...styles.caption, fontSize: 11, marginBottom: 4 }}>
              {item.replied_by_name ?? 'The HIVE'} said
              {item.replied_at ? ` · ${timeAgo(item.replied_at)}` : ''}
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 22, color: skin.inkBody }}>
              {item.reply}
            </Text>
          </View>
        ) : mine ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: skin.inkFaint, marginTop: 8 }}>
            {item.status === 'new' ? 'Not looked at yet.' : 'Seen. No answer written yet.'}
          </Text>
        ) : null}

        {/* Owner controls. Only on the third tab, only for owners. */}
        {!mine ? (
          <View style={{ marginTop: 12 }}>
            {!item.reply ? (
              <>
                {/* The owner's answer. Words, so it gets the microphone — and
                    the mic sits inside the box's own border rather than on a
                    shelf underneath it. `next` arrives as either a string or an
                    updater, because dictation has to read what is already there
                    to append to it. */}
                <ComposerBar
                  variant="form"
                  value={replyDrafts[item.id] ?? ''}
                  onChangeText={(next) =>
                    setReplyDrafts((prev) => ({
                      ...prev,
                      [item.id]: typeof next === 'function' ? next(prev[item.id] ?? '') : next,
                    }))
                  }
                  minHeight={64}
                  // 4000 is what the app-feedback edge function accepts. Raising
                  // it here would only let somebody write a reply the server
                  // then refuses.
                  maxLength={4000}
                  placeholder="What happened about it?"
                  // Enter makes a new paragraph. An answer to a bug report runs
                  // to several lines, and "Answer & tell them" is right below.
                  submitOnEnterKey={false}
                  submitting={replyingTo === item.id}
                />
                {/* Wrapping, because "Answer & tell them" and "Mark read" side
                    by side are wider than a phone panel and the second one was
                    running off the edge of the card. */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  <Pressable
                    onPress={() => void sendReply(item.id)}
                    disabled={!(replyDrafts[item.id] ?? '').trim() || replyingTo === item.id}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      backgroundColor: (replyDrafts[item.id] ?? '').trim() ? skin.gold : skin.border,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Lato_700Bold',
                        fontSize: 13,
                        color: (replyDrafts[item.id] ?? '').trim() ? (skin.dark ? '#07080F' : '#fffdf5') : skin.inkFaint,
                      }}
                    >
                      {replyingTo === item.id ? 'Sending…' : 'Answer & tell them'}
                    </Text>
                  </Pressable>
                  {item.status === 'new' ? (
                    <Pressable
                      onPress={() => void markStatus(item.id, 'read')}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderWidth: 1,
                        borderColor: skin.border,
                      }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: skin.inkSoft }}>Mark read</Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => void markStatus(item.id, item.status === 'done' ? 'read' : 'done')}
                style={{ alignSelf: 'flex-start' }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: skin.gold }}>
                  {item.status === 'done' ? 'Reopen' : 'Mark done'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const emptyLine = (text: string) => (
    <Text
      style={{
        fontFamily: 'Lato_400Regular',
        fontSize: 15,
        lineHeight: 22,
        color: skin.inkSoft,
        textAlign: 'center',
        paddingVertical: 22,
      }}
    >
      {text}
    </Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: skin.page }} edges={['bottom']}>
      <SpaceBackdrop />
      <AppHeader title="App Feedback" subtitle="Tell us what is working and what would help." />
      <BounceScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: 15,
            lineHeight: 22,
            color: skin.inkBody,
            marginBottom: 6,
          }}
        >
          This feedback goes straight to Nat, so she can build you the best, most useful and
          intuitive app possible! All thoughts and feedback welcome!
        </Text>
        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: 15,
            lineHeight: 22,
            color: skin.inkBody,
            marginBottom: 18,
          }}
        >
          The easiest way of all: take a screenshot, mark it up, and drop it in here. 📸
        </Text>

        {/* Short words on a phone, the whole sentence where there is room.
            The page on a phone is the screen minus the side rail minus its own
            padding — about 280 points at 375 — and "Say something", "What
            you've sent (0)" and "Everyone (0)" want more than 400 between them.
            That is why the third one ran off the edge with nothing to say it
            was there.

            These are the same words shortened rather than renamed, and the set
            lands inside 280. "Everyone" keeps its full name because it is the
            owners' tab and the one worth being sure about; once its count runs
            to three figures the row goes back over the line, which is what the
            arrow above is for. */}
        <TabStrip>
          <HeaderTabs
            tabs={[
              { key: 'say', label: narrow ? 'Say it' : 'Say something' },
              { key: 'sent', label: narrow ? 'Sent' : 'What you’ve sent', count: sent?.length },
              ...(isOwner ? [{ key: 'all', label: 'Everyone', count: all?.length }] : []),
            ]}
            activeTab={tab}
            onChange={(next) => setTab(next as 'say' | 'sent' | 'all')}
          />
        </TabStrip>

        {tab === 'say' ? (
          <View style={styles.panel}>
            <Text style={{ ...styles.caption, marginBottom: 10 }}>What kind of thing is it?</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {KINDS.map((option) => {
                const selected = option.key === kind;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setKind(option.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 7,
                      borderRadius: 999,
                      borderWidth: 1,
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderColor: selected ? skin.gold : skin.border,
                      backgroundColor: selected
                        ? skin.dark
                          ? 'rgba(224,190,118,0.16)'
                          : '#fdf3dc'
                        : pressed
                          ? skin.cardPressed
                          : 'transparent',
                    })}
                  >
                    <Text style={{ fontSize: 15 }}>{option.emoji}</Text>
                    <Text
                      style={{
                        fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                        fontSize: 14,
                        color: selected ? skin.ink : skin.inkBody,
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ ...styles.caption, marginBottom: 8 }}>
              Where in the app? <Text style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</Text>
            </Text>
            {/* Second, not last (Nat 2026-08-05: "I think these 2 could be
                swapped... start with what kind is it, thats good, then go to
                where (optional) & then what").

                It used to sit under the big box, and that was asking for the
                easy fact after the hard one. Picking a place is a two-second tap
                that narrows what you are about to write; being asked for it
                afterwards is filing you have already finished in your head, so
                it got skipped.

                A list rather than a blank box (Nat 2026-08-04: "i think this
                should be a drop down").

                Free text was a deliberate choice on 08-03 — "asking somebody to
                pick their route out of a menu is asking them to do our filing" —
                and it was wrong for a reason the empty field makes obvious: the
                page names are OURS. Somebody who calls Boards "the threads bit"
                writes that, and now two reports about one screen do not look
                alike. A list of the actual page names asks for recognition
                instead of recall, which is the easier half of remembering.

                "Somewhere else" keeps the escape hatch, because the bug is
                often in the gap between two pages. */}
            <Pressable
              onPress={() => setWhereOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Choose where in the app"
              style={[styles.field, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
            >
              <Text
                style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: 15,
                  color: whereInApp ? skin.ink : skin.inkFaint,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {whereInApp || 'Pick a place…'}
              </Text>
              <Text style={{ color: skin.inkSoft, fontSize: 12, marginLeft: 8 }}>{whereOpen ? '▲' : '▼'}</Text>
            </Pressable>

            {whereOpen ? (
              <View
                style={{
                  marginTop: 6,
                  borderWidth: 1,
                  borderColor: skin.border,
                  borderRadius: 12,
                  backgroundColor: skin.card,
                  overflow: 'hidden',
                }}
              >
                {WHERE_OPTIONS.map((place, index) => (
                  <Pressable
                    key={place}
                    onPress={() => {
                      setWhereInApp(place === 'Somewhere else' ? '' : place);
                      setWhereOpen(false);
                      setWhereOther(place === 'Somewhere else');
                    }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: skin.border,
                      backgroundColor: pressed ? skin.cardPressed : 'transparent',
                    })}
                  >
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, color: skin.inkBody }}>
                      {place}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {whereOther ? (
              /* Naming a place in your own words is words, so it gets the mic —
                 this is the escape hatch for the bug that lives in the gap
                 between two pages, and describing that out loud is easier than
                 typing it. 300 is the edge function's own limit. */
              <ComposerBar
                variant="form"
                containerClassName="mt-2"
                value={whereInApp}
                onChangeText={setWhereInApp}
                multiline={false}
                maxLength={300}
                placeholder="Where were you?"
                submitOnEnterKey={false}
              />
            ) : null}

            {/* The question belongs to the KIND, and it is deliberately the last
                thing you read before the box it is asking about — the chips are
                two blocks up now, so this has to stand on its own as a question
                rather than as a caption hanging off the chip you just pressed.
                Each one already does: every prompt names what to write, not what
                you picked. */}
            <Text
              style={{
                fontFamily: 'LibreBaskerville_400Regular',
                fontSize: 18,
                lineHeight: 26,
                color: skin.ink,
                marginTop: 22,
                marginBottom: 10,
              }}
            >
              {active.prompt}
            </Text>

            {capturedScreenshot ? (
              <View style={{ borderWidth: 1, borderColor: skin.border, borderRadius: 14, padding: 10, marginBottom: 12 }}>
                <Text style={{ ...styles.caption, marginBottom: 8 }}>Screenshot to include</Text>
                <Image
                  source={{ uri: capturedScreenshot.uri }}
                  style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: skin.field }}
                  contentFit="contain"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove captured screenshot"
                  onPress={() => onImagesChange(selectedImages.filter((image) => image.uri !== capturedScreenshot.uri))}
                  style={{ alignSelf: 'flex-start', marginTop: 9, paddingVertical: 7, paddingHorizontal: 10 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', color: skin.gold }}>Remove screenshot</Text>
                </Pressable>
              </View>
            ) : captureNotice ? (
              <View style={{ borderWidth: 1, borderColor: skin.border, borderRadius: 12, padding: 11, marginBottom: 12 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19, color: skin.inkBody }}>
                  {captureNotice === 'unsupported'
                    ? 'This device cannot capture the app screen here. You can still add a screenshot with the clip below.'
                    : captureNotice === 'declined'
                      ? 'No screen was shared. Nothing was captured; you can still add a screenshot with the clip below.'
                      : 'The screenshot could not be made. Nothing was captured; you can still add one with the clip below.'}
                </Text>
              </View>
            ) : null}

            {/* The whole report, in one box: the words, the clip and the mic,
                all inside the same border. It used to be a bare field with the
                clip and the mic on a strip underneath, which is the wrong axis
                — both are things you do TO the report you are writing.
                ComposerBar also draws the previews and takes a file dropped
                anywhere on the page. */}
            <ComposerBar
              variant="form"
              value={message}
              onChangeText={setMessage}
              minHeight={150}
              // 4000 is what the app-feedback edge function accepts. Raising it
              // here would only let somebody write a report the server refuses.
              maxLength={4000}
              placeholder="Say it however it comes out. Nothing here has to be tidy."
              // Enter makes a new paragraph. A bug report is several sentences
              // and "Send it" is right below.
              submitOnEnterKey={false}
              submitting={sending}
              attachments="compact"
              selectedImages={selectedImages}
              onImagesChange={onImagesChange}
              selectedFiles={selectedFiles}
              onFilesChange={setSelectedFiles}
              maxImages={MAX_FEEDBACK_ATTACHMENTS}
              maxFiles={MAX_FEEDBACK_ATTACHMENTS}
              maxAttachments={MAX_FEEDBACK_ATTACHMENTS}
              captureDocumentDrops
            />
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: skin.inkFaint, marginTop: 8 }}>
              Add a screenshot, or talk instead of typing
            </Text>

            <Pressable
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              style={({ pressed }) => ({
                marginTop: 22,
                borderRadius: 999,
                paddingVertical: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: canSend ? skin.gold : skin.border,
                opacity: pressed && canSend ? 0.86 : 1,
              })}
            >
              {sending ? (
                <ThinkingBee />
              ) : (
                <Text
                  style={{
                    fontFamily: 'Lato_700Bold',
                    fontSize: 15,
                    color: canSend ? (skin.dark ? '#07080F' : '#fffdf5') : skin.inkFaint,
                  }}
                >
                  Send it
                </Text>
              )}
            </Pressable>

            {result ? (
              <Text
                style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: 14,
                  lineHeight: 21,
                  marginTop: 14,
                  textAlign: 'center',
                  color: result.ok ? skin.inkBody : '#c0523f',
                }}
              >
                {result.text}
              </Text>
            ) : null}
          </View>
        ) : tab === 'sent' ? (
          <View style={styles.panel}>
            {sent === null ? (
              <ThinkingBee />
            ) : sent.length === 0 ? (
              emptyLine('Nothing yet. Anything you send will be listed here, along with what we said back.')
            ) : (
              sent.map((item, index) => renderItem(item, index, true))
            )}
          </View>
        ) : (
          <View style={styles.panel}>
            {all === null ? (
              <ThinkingBee />
            ) : all.length === 0 ? (
              emptyLine('Nobody has said anything yet.')
            ) : (
              all.map((item, index) => renderItem(item, index, false))
            )}
          </View>
        )}
      </BounceScrollView>
    </SafeAreaView>
  );
}
