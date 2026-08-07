import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import { sanitizeReturnTo } from '../../lib/authReturnTo';
import { ArrivalScreen } from '../../components/ui/ThinkingBee';
import { DOOR_DARK } from '../_layout';
// A sign-in with no particular destination goes to "/", which is the waiting
// room: it holds until auth has actually resolved and only then forwards you
// to HIVE-Wide. Sending people straight to /hive-wide put them behind the
// app's auth guard a beat before the session existed, and the guard bounced
// them back to login — which is what "how come I can't log in" was
// (2026-08-03). A texted link still wins over both.

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; returnTo?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    try {
      // Check for error from OAuth provider
      if (params.error) {
        throw new Error(params.error);
      }

      // Try code exchange flow first
      if (params.code) {
        await supabase.auth.exchangeCodeForSession(params.code);
        router.replace((sanitizeReturnTo(params.returnTo) ?? '/') as any);
        return;
      }

      // Fall back to reading the full URL for hash fragment tokens
      const url = await Linking.getInitialURL();
      if (url) {
        const hashPart = url.split('#')[1];
        if (hashPart) {
          const hashParams = new URLSearchParams(hashPart);
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            router.replace((sanitizeReturnTo(params.returnTo) ?? '/') as any);
            return;
          }
        }
      }

      throw new Error('No authentication tokens received');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
      console.error('Auth callback error:', err);
      // Redirect back to login after a brief delay
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 2000);
    }
  }

  // The same dark brown as the sign-in screen either side of it. This used to be
  // cream, which put a near-white page in the middle of a journey that is dark
  // at both ends — one of the "flashes of different colours" (Nat 2026-08-06).
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, backgroundColor: DOOR_DARK }}>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 16, color: '#f6f4e5', textAlign: 'center' }}>{error}</Text>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: 'rgba(246,244,229,0.6)', textAlign: 'center', marginTop: 8 }}>
          Taking you back to sign in…
        </Text>
      </View>
    );
  }

  // No words and no bee while the boot splash is still up — it is already saying
  // this, with a bee that has been flying since the first frame.
  return <ArrivalScreen background={DOOR_DARK} />;
}
