import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { usePageSkin } from '../../lib/pageSkin';
import { AppHeader } from '../../components/navigation';
import { SpaceBackdrop } from '../../components/ui/SpaceBackdrop';
import { HeaderTabs } from '../../components/ui/HeaderTabs';

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
 * The words go to a table and to Nat's inbox, not onto a board. "This screen
 * confuses me" is a note to the people who build the app, not a wish for your
 * friends to grant.
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

type SentItem = {
  id: string;
  kind: Kind;
  message: string;
  created_at: string;
  status: string;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AppFeedbackScreen() {
  const { profile, communityId } = useAuth();
  const skin = usePageSkin();

  const [tab, setTab] = useState<'say' | 'sent'>('say');
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [whereInApp, setWhereInApp] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; emailed: boolean; text: string } | null>(null);

  const [sent, setSent] = useState<SentItem[] | null>(null);

  const loadSent = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase
      .from('app_feedback')
      .select('id, kind, message, created_at, status')
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

  useEffect(() => {
    void loadSent();
  }, [loadSent]);

  const canSend = message.trim().length > 0 && !sending;

  const send = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('app-feedback', {
        body: {
          kind,
          message: message.trim(),
          where_in_app: whereInApp.trim() || null,
          // Context, not a requirement. NULL is a real answer: it means the
          // person was standing at HIVE-Wide when they said it.
          community_id: communityId ?? null,
          platform: Platform.OS === 'web' ? 'web' : Platform.OS,
        },
      });

      if (error) throw error;

      setMessage('');
      setWhereInApp('');
      // Told the truth about which half worked. The note is safe either way —
      // the function stores before it emails — so a failed email is a smaller
      // sentence, not an error.
      setResult({
        ok: true,
        emailed: !!data?.emailed,
        text: data?.emailed
          ? 'Sent. It landed in Nat’s inbox as well as here.'
          : 'Saved. The email did not go out, but your note is safely filed and Nat will see it.',
      });
      void loadSent();
    } catch (error: any) {
      console.warn('Could not send feedback', error);
      setResult({
        ok: false,
        emailed: false,
        text: 'That did not send. Your words are still here — try again in a moment.',
      });
    } finally {
      setSending(false);
    }
  }, [canSend, kind, message, whereInApp, communityId, loadSent]);

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
    }),
    [skin]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: skin.page }} edges={['bottom']}>
      <SpaceBackdrop />
      <AppHeader title="App Feedback" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: 15,
            lineHeight: 22,
            color: skin.inkBody,
            marginBottom: 18,
          }}
        >
          This goes straight to the people who build the HIVE. Not to a board, not to your
          HIVE — it is about the app itself, so it works the same wherever you are standing.
        </Text>

        <HeaderTabs
          tabs={[
            { key: 'say', label: 'Say something' },
            { key: 'sent', label: 'What you’ve sent', count: sent?.length },
          ]}
          activeTab={tab}
          onChange={(next) => setTab(next as 'say' | 'sent')}
        />

        {tab === 'say' ? (
          <View style={styles.panel}>
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 13,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: skin.inkSoft,
                marginBottom: 10,
              }}
            >
              What kind of thing is it?
            </Text>

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

            <Text
              style={{
                fontFamily: 'LibreBaskerville_400Regular',
                fontSize: 18,
                lineHeight: 26,
                color: skin.ink,
                marginBottom: 10,
              }}
            >
              {active.prompt}
            </Text>

            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={7}
              maxLength={4000}
              placeholder="Say it however it comes out. Nothing here has to be tidy."
              placeholderTextColor={skin.inkFaint}
              style={[styles.field, { minHeight: 150, textAlignVertical: 'top' }]}
            />

            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 13,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: skin.inkSoft,
                marginTop: 18,
                marginBottom: 8,
              }}
            >
              Where in the app? <Text style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</Text>
            </Text>
            <TextInput
              value={whereInApp}
              onChangeText={setWhereInApp}
              maxLength={300}
              placeholder="e.g. the Boards page, the meeting form, the side menu"
              placeholderTextColor={skin.inkFaint}
              style={styles.field}
            />

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
                <ActivityIndicator color={skin.dark ? '#07080F' : '#fffdf5'} />
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
        ) : (
          <View style={styles.panel}>
            {sent === null ? (
              <ActivityIndicator color={skin.gold} />
            ) : sent.length === 0 ? (
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
                Nothing yet. Anything you send will be listed here so you can see it was kept.
              </Text>
            ) : (
              sent.map((item, index) => (
                <View
                  key={item.id}
                  style={{
                    paddingVertical: 14,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: skin.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 15 }}>{KIND_BY_KEY[item.kind]?.emoji ?? '💬'}</Text>
                    <Text
                      style={{
                        fontFamily: 'Lato_700Bold',
                        fontSize: 13,
                        color: skin.ink,
                      }}
                    >
                      {KIND_BY_KEY[item.kind]?.label ?? 'Feedback'}
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: skin.inkSoft }}>
                      · {timeAgo(item.created_at)}
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
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular',
                      fontSize: 15,
                      lineHeight: 22,
                      color: skin.inkBody,
                    }}
                  >
                    {item.message}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
