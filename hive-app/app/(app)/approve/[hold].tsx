import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from '../../../components/ui/SafeArea';
import { BounceScrollView } from '../../../components/ui/BounceScrollView';
import { AppHeader } from '../../../components/navigation';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/hooks/useAuth';
import { confirmAction, showAlert } from '../../../lib/showAlert';
import { userFacingError } from '../../../lib/userFacingError';

/**
 * Where "say go" actually happens.
 *
 * Nat, 2026-09-02: *"I need to be able to approve it from inside the email."*
 * She could not. The approve endpoint has existed since August and **nothing in
 * the app or the email ever called it** — every check-in that has gone out went
 * out because somebody ran the function for her. This is the missing half.
 *
 * **The link in the email opens this screen and sends nothing.** That is
 * deliberate and it is why there was no link at all before (2026-08-17): a
 * one-tap send-to-everyone address sitting in an inbox is a members-wide blast
 * that a mail scanner, a link preview or a forward can fire by itself. A URL
 * that only ever renders a page is safe to put in mail; the send lives behind
 * her login and behind a confirm.
 *
 * Signed out, `authReturnTo` carries `/approve/<id>` through login and lands
 * back here, so a tap from her phone at 6am does not become a hunt.
 */

type Hold = {
  id: string;
  title: string;
  content: string;
  hiveName: string | null;
  subject: string;
  recipients: number;
  state: string;
  sentAt: string | null;
};

const GOLD = '#bd9348';
const INK = '#2d2d2d';
const QUIET = '#9a8060';

export default function ApproveCheckInScreen() {
  const router = useRouter();
  const { hold: holdParam } = useLocalSearchParams<{ hold?: string | string[] }>();
  const holdId = (Array.isArray(holdParam) ? holdParam[0] : holdParam)?.trim() ?? '';
  const { profile, loading: authLoading } = useAuth();
  const isOwner = profile?.is_owner === true;

  const [hold, setHold] = useState<Hold | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!holdId) { setState('missing'); return; }
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, content, metadata')
      .eq('id', holdId)
      .maybeSingle();

    if (error) { setState('error'); return; }
    if (!data) { setState('missing'); return; }

    const meta = ((data as any).metadata ?? {}) as Record<string, unknown>;
    setHold({
      id: (data as any).id,
      title: (data as any).title ?? '',
      content: (data as any).content ?? '',
      hiveName: typeof meta.check_in_hive_name === 'string' ? meta.check_in_hive_name : null,
      subject: typeof meta.check_in_subject === 'string' ? meta.check_in_subject : '',
      recipients: Number(meta.check_in_recipients ?? 0),
      state: String(meta.check_in_approval ?? ''),
      sentAt: typeof meta.check_in_approved_at === 'string' ? meta.check_in_approved_at : null,
    });
    setState('ready');
  }, [holdId]);

  useEffect(() => { void load(); }, [load]);

  const send = () => {
    if (!hold || sending) return;
    confirmAction({
      title: `Send this to ${hold.recipients} ${hold.recipients === 1 ? 'person' : 'people'}?`,
      // Names the number and the HIVE, because this is the last screen before
      // real inboxes and "are you sure" on its own is not a fact.
      message: `"${hold.subject}" goes to ${hold.recipients} ${
        hold.recipients === 1 ? 'member' : 'members'
      } of ${hold.hiveName ?? 'this HIVE'} who still have this email switched on. This is the version you just read.`,
      confirmLabel: 'Send it',
      onConfirm: async () => {
        setSending(true);
        try {
          const { data, error } = await supabase.functions.invoke('check-in-reminder', {
            body: { approve_notification_id: hold.id },
          });
          if (error) throw error;
          const sent = (data as any)?.sent;
          showAlert(
            'Sent',
            typeof sent === 'number'
              ? `Gone to ${sent} ${sent === 1 ? 'person' : 'people'}.`
              : 'Gone.'
          );
          await load();
        } catch (sendError) {
          console.error('Could not approve the check-in:', sendError);
          showAlert('Not sent', userFacingError(sendError, 'That did not go through. Nothing was sent — try again.'));
        } finally {
          setSending(false);
        }
      },
    });
  };

  const body = () => {
    if (authLoading || state === 'loading') {
      return (
        <View style={{ padding: 28, alignItems: 'center' }}>
          <ActivityIndicator color={GOLD} />
        </View>
      );
    }

    // The whole point of this screen is that only she can press the button.
    if (!isOwner) {
      return (
        <Card>
          <Heading>This one is Nat&rsquo;s to send.</Heading>
          <Body>Check-in emails go out from the HIVE owner, so there is nothing for you to do here.</Body>
        </Card>
      );
    }

    if (state === 'missing') {
      return (
        <Card>
          <Heading>Nothing is waiting under that link.</Heading>
          <Body>
            It may already have gone out, or the preview may have been replaced by a newer one.
            Nothing was sent by opening this.
          </Body>
        </Card>
      );
    }

    if (state === 'error' || !hold) {
      return (
        <Card tone="bad">
          <Heading>This did not load.</Heading>
          <Body>
            So it is not telling you everything is fine. Nothing has been sent. Pull down to try
            again, or come back in a minute.
          </Body>
        </Card>
      );
    }

    if (hold.state === 'approved') {
      return (
        <Card>
          <Heading>Already sent. ✓</Heading>
          <Body>
            &ldquo;{hold.subject}&rdquo; went to {hold.recipients}{' '}
            {hold.recipients === 1 ? 'person' : 'people'} in {hold.hiveName ?? 'this HIVE'}
            {hold.sentAt ? ` on ${new Date(hold.sentAt).toLocaleDateString('en-US', {
              month: 'long', day: 'numeric',
            })}` : ''}. Nothing more to do.
          </Body>
        </Card>
      );
    }

    if (hold.state !== 'pending') {
      return (
        <Card>
          <Heading>This preview was retired.</Heading>
          <Body>
            It was replaced before it went anywhere, so there is nothing here to send. A newer one
            will be in your inbox if the check-in is still due.
          </Body>
        </Card>
      );
    }

    return (
      <View style={{ gap: 14 }}>
        <Card>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: QUIET }}>
            Waiting on you
          </Text>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 20, color: INK, marginTop: 6, lineHeight: 27 }}>
            {hold.subject}
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14.5, lineHeight: 21, color: INK, marginTop: 10 }}>
            Goes to <Text style={{ fontFamily: 'Lato_700Bold' }}>{hold.recipients}{' '}
            {hold.recipients === 1 ? 'person' : 'people'}</Text> in{' '}
            <Text style={{ fontFamily: 'Lato_700Bold' }}>{hold.hiveName ?? 'this HIVE'}</Text> — the
            ones who still have this email switched on.
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19, color: QUIET, marginTop: 10 }}>
            The full letter is the preview in your inbox. This sends that exact version, not a
            fresh one — so nothing has changed under it while you were reading.
          </Text>
        </Card>

        <Pressable
          onPress={send}
          disabled={sending}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: GOLD, borderRadius: 999, paddingVertical: 14,
            opacity: pressed || sending ? 0.7 : 1,
          })}
        >
          {sending ? <ActivityIndicator size="small" color="#fffdf5" /> : null}
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#fffdf5' }}>
            {sending ? 'Sending…' : 'Send it'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.replace('/hive' as never)} disabled={sending}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: QUIET, textAlign: 'center' }}>
            Not yet
          </Text>
        </Pressable>

        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 18, color: QUIET, textAlign: 'center' }}>
          If you do nothing, nothing sends. It will wait here.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f6f4e5' }} edges={['top']}>
      <AppHeader title="Send this check-in?" onBackPress={() => router.replace('/hive' as never)} />
      <BounceScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        {body()}
      </BounceScrollView>
    </SafeAreaView>
  );
}

function Card({ children, tone }: { children: React.ReactNode; tone?: 'bad' }) {
  return (
    <View
      style={{
        backgroundColor: '#fffdf5',
        borderWidth: 1,
        borderColor: tone === 'bad' ? '#dc2626' : 'rgba(154,128,96,0.22)',
        borderRadius: 18,
        padding: 16,
      }}
    >
      {children}
    </View>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 18, color: INK, lineHeight: 25 }}>
      {children}
    </Text>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: QUIET, marginTop: 8 }}>
      {children}
    </Text>
  );
}
