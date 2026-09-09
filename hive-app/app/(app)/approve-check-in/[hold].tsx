import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from '../../../components/ui/SafeArea';
import { AppHeader } from '../../../components/navigation';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/hooks/useAuth';

/**
 * The Yes, send it button in Nat's private preview email lands here. A mail
 * scanner has no signed-in Nat session, so opening the URL cannot send. When
 * Nat opens it while signed in, this one page load is her one deliberate yes.
 */
export default function ApproveCheckInPreview() {
  const { hold: rawHold, action } = useLocalSearchParams<{ hold?: string | string[]; action?: string | string[] }>();
  const holdId = (Array.isArray(rawHold) ? rawHold[0] : rawHold)?.trim() ?? '';
  const decision = Array.isArray(action) ? action[0] : action;
  const { profile, loading } = useAuth();
  const [state, setState] = useState<'waiting' | 'sending' | 'sent' | 'empty' | 'error'>('waiting');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (loading || !holdId || decision !== 'send' || state !== 'waiting') return;
    if (!profile?.is_owner) { setState('error'); setMessage('This preview is for Nat to send.'); return; }
    setState('sending');
    void supabase.functions.invoke('check-in-preview', { body: { action: 'send', hold_id: holdId } })
      .then(({ data, error }) => {
        if (error) throw new Error((data as any)?.error ?? error.message);
        const reached = Number((data as any)?.reached ?? 0);
        setState(reached ? 'sent' : 'empty');
        setMessage(reached ? `Sent to ${reached} ${reached === 1 ? 'person' : 'people'} who still needed it.` : 'Everybody has completed it already, so nobody was emailed.');
      })
      .catch((error: Error) => { setState('error'); setMessage(error.message || 'Nothing was sent.'); });
  }, [decision, holdId, loading, profile?.is_owner, state]);

  const copy = state === 'sending' ? 'Sending the check-in…' : state === 'waiting'
    ? 'Getting your check-in ready…' : state === 'sent' ? 'It is on its way.'
    : state === 'empty' ? 'Nobody needs a reminder.' : 'This check-in was not sent.';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0B0B12' }}>
      <AppHeader title="Check-in" />
      <View style={{ margin: 24, padding: 22, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(232,197,131,0.65)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
        {(state === 'waiting' || state === 'sending') ? <ActivityIndicator color="#e8c583" style={{ marginBottom: 14 }} /> : null}
        <Text style={{ color: '#fffdf5', fontSize: 20, fontFamily: 'Lato_700Bold' }}>{copy}</Text>
        {message ? <Text style={{ color: 'rgba(255,253,245,0.76)', fontSize: 14, lineHeight: 21, marginTop: 10, fontFamily: 'Lato_400Regular' }}>{message}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
