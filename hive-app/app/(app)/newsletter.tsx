import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { SummarySections, type SummarySection } from '../../components/meetings/SummarySections';

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
export default function NewsletterScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { communityId, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<SummarySection[]>([]);
  const [cycleStart, setCycleStart] = useState<string | null>(null);
  const [prose, setProse] = useState<string | null>(null);
  // The letter is what she pastes into Wix; the outline is for checking the
  // facts behind it. Same data, two readings.
  const [view, setView] = useState<'letter' | 'facts'>('letter');
  const [writing, setWriting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postedTo, setPostedTo] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  const close = () => {
    if (from === 'meetings') router.replace('/meetings');
    else if (from === 'admin') router.replace('/admin');
    else if (router.canGoBack()) router.back();
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

    const { data, error: invokeError } = await supabase.functions.invoke('draft-newsletter', {
      body: { communityId, includeProse: false },
    });
    if (invokeError || !data?.success) {
      setError('Could not gather the draft just now. Try again in a moment.');
      setLoading(false);
      return;
    }
    setSections((data.sections ?? []) as SummarySection[]);
    setCycleStart(data.cycle_start ?? null);
    setLoading(false);

    if ((data.sections ?? []).length === 0) return;

    setWriting(true);
    const { data: written } = await supabase.functions.invoke('draft-newsletter', {
      body: { communityId, includeProse: true },
    });
    if (written?.success) {
      if ((written.sections ?? []).length > 0) setSections(written.sections as SummarySection[]);
      setProse(typeof written.prose === 'string' && written.prose.trim() ? written.prose : null);
    }
    setWriting(false);
  }, [communityId]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  // Plain text, because it's going into whatever she writes the newsletter in.
  const asPlainText = () => sections
    .map((section) => [
      section.title.toUpperCase(),
      ...section.lines.map((line) => (line.startsWith('    ') ? `    - ${line.trim()}` : `- ${line}`)),
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
      const title = `${month} Newsletter 📰`;

      const { data: existing } = await supabase
        .from('board_posts')
        .select('id')
        .eq('category_id', board.id)
        .eq('title', title)
        .limit(1);

      const content = prose ?? asPlainText();
      if ((existing ?? []).length > 0) {
        const { error: updateError } = await (supabase as any)
          .from('board_posts')
          .update({ content, edited_at: new Date().toISOString() })
          .eq('id', (existing as { id: string }[])[0].id);
        if (updateError) {
          setPostError(`Could not update the post: ${updateError.message}`);
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
          setPostError(`Could not post it: ${insertError.message}`);
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
        <Pressable
          onPress={() => void copyAll()}
          hitSlop={10}
          disabled={loading || sections.length === 0}
          accessibilityLabel="Copy the whole draft"
          style={({ pressed }) => ({
            backgroundColor: copied ? '#7a9a6b' : '#bd9348',
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 999,
            opacity: pressed || loading || sections.length === 0 ? 0.6 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#fff' }}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color="#bd9348" />
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
                <ActivityIndicator size="small" color="#bd9348" />
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

            {view === 'letter' && prose ? (
              <View className="mb-4 bg-paper rounded-2xl border border-gold/20 px-5 py-5">
                <Text
                  selectable
                  style={{ fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 24, color: '#3f3a33' }}
                >
                  {prose}
                </Text>
              </View>
            ) : (
              <SummarySections sections={sections} />
            )}
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
                {posting ? 'Posting…' : '📰 Post to the Newsletter board'}
              </Text>
            </Pressable>
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
      </ScrollView>
    </SafeAreaView>
  );
}
