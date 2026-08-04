import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import { sanitizeReturnTo } from '../../lib/authReturnTo';
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

  if (error) {
    return (
      <View className="flex-1 bg-cream justify-center items-center px-8">
        <Text className="text-charcoal text-center text-base">{error}</Text>
        <Text className="text-charcoal/60 text-center text-sm mt-2">
          Redirecting to login...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream justify-center items-center">
      <ActivityIndicator size="large" color="#bd9348" />
      <Text className="text-charcoal mt-4 text-base">Signing you in...</Text>
    </View>
  );
}
