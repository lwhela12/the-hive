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
  const { communityId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<SummarySection[]>([]);
  const [cycleStart, setCycleStart] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    if (from === 'meetings') router.replace('/meetings');
    else if (from === 'admin') router.replace('/admin');
    else if (router.canGoBack()) router.back();
    else router.replace('/meetings');
  };

  const loadDraft = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('draft-newsletter', {
      body: { communityId },
    });
    if (invokeError || !data?.success) {
      setError('Could not gather the draft just now. Try again in a moment.');
      setLoading(false);
      return;
    }
    setSections((data.sections ?? []) as SummarySection[]);
    setCycleStart(data.cycle_start ?? null);
    setLoading(false);
  }, [communityId]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  // Plain text, because it's going into whatever she writes the newsletter in.
  const copyAll = async () => {
    const text = sections
      .map((section) => [
        section.title.toUpperCase(),
        ...section.lines.map((line) => (line.startsWith('    ') ? `    - ${line.trim()}` : `- ${line}`)),
      ].join('\n'))
      .join('\n\n');
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            {sinceLabel ? `Everything since ${sinceLabel}` : 'Since the last meeting'}
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
            <SummarySections sections={sections} />
            <Text
              style={{
                fontFamily: 'Lato_400Regular',
                fontSize: 12,
                color: '#a09585',
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              Gathered from the boards, to-dos, and check-ins — nothing was written twice.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
