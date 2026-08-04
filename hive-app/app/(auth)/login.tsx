import { useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { sanitizeReturnTo } from '../../lib/authReturnTo';

import { ThinkingBee } from '../../components/ui/ThinkingBee';
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const safeReturnTo = sanitizeReturnTo(returnTo);

  const handleGoogleSignIn = async (forceAccountPicker = false) => {
    try {
      setLoading(true);

      if (Platform.OS === 'web') {
        // For web, use simple redirect
        // Include returnTo in the redirect URL so we can handle it after OAuth
        const redirectUrl = safeReturnTo
          ? `${window.location.origin}${safeReturnTo}`
          : window.location.origin;

        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            queryParams: forceAccountPicker ? { prompt: 'select_account' } : undefined,
          },
        });
        if (error) throw error;
        // The page will redirect to Google, then back
      } else {
        // For native, use expo-linking to generate the correct URL
        const redirectTo = Linking.createURL('auth/callback');

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams: forceAccountPicker ? { prompt: 'select_account' } : undefined,
          },
        });

        if (error) throw error;

        if (data.url) {
          const result = await WebBrowser.openAuthSessionAsync(
            data.url,
            redirectTo
          );

          if (result.type === 'success') {
            const url = result.url;

            // PKCE flow: extract code from query params
            const parsedUrl = Linking.parse(url);
            const code = parsedUrl.queryParams?.code as string | undefined;

            if (code) {
              const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
              if (exchangeError) throw exchangeError;
            } else {
              // Fall back to implicit token flow (#access_token)
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
                } else {
                  throw new Error('No authentication tokens received from Google');
                }
              } else {
                throw new Error('No authentication tokens received from Google');
              }
            }

            router.replace((safeReturnTo ?? '/') as never);
          }
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sign in with Google. Please try again.');
      console.error('Sign in error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    // Behind the door it's dark. The public site is cream and says what HIVE is;
    // this page is the other side of the invitation and shouldn't read as more
    // of the same marketing (Nat 2026-08-02). Same seal, opposite world.
    <SafeAreaView style={{ flex: 1, backgroundColor: '#33271a' }}>
      <StatusBar style="light" />
      <View className="flex-1 justify-center px-6 py-10">
        <View className="w-full max-w-md mx-auto items-center">
          <Image
            source={require('../../assets/HIVE Logo Transparent  BG.png')}
            style={{ width: 128, height: 128, marginBottom: 22 }}
            resizeMode="contain"
          />

          <Text
            style={{
              fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 3,
              color: '#dec181', marginBottom: 10,
            }}
          >
            MEMBERS ONLY
          </Text>

          <Text
            style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 30, color: '#f6f4e5' }}
          >
            Welcome back
          </Text>

          <Text
            style={{
              fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21,
              color: 'rgba(246,244,229,0.62)', textAlign: 'center',
              marginTop: 10, marginBottom: 30, maxWidth: 300,
            }}
          >
            {/* Two sentences, two lines. The first says what this place is; the
                second tells you what to do. Run together they read as one long
                apology (Nat 2026-08-03). */}
            HIVE is invitation only.{'\n'}
            Sign in with the email address that received your invite.
          </Text>

          <Pressable
            onPress={() => handleGoogleSignIn()}
            disabled={loading}
            style={{ width: '100%', opacity: loading ? 0.5 : 1 }}
            className="flex-row items-center justify-center bg-white rounded-xl py-4 px-6 active:opacity-80"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fffdf5" />
            ) : (
              <>
                <Image
                  source={{ uri: 'https://www.google.com/favicon.ico' }}
                  style={{ width: 20, height: 20, marginRight: 12 }}
                />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-base text-charcoal">
                  Continue with Google
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => handleGoogleSignIn(true)}
            disabled={loading}
            className="mt-4 py-2 active:opacity-60"
          >
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: 'rgba(246,244,229,0.5)' }}>
              Use a different account &rarr;
            </Text>
          </Pressable>

          <Pressable
            onPress={() => Linking.openURL('https://the-hive.app')}
            className="mt-7 pt-6 active:opacity-70"
            style={{ borderTopWidth: 1, borderTopColor: 'rgba(222,193,129,0.22)', width: '100%' }}
          >
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: 'rgba(246,244,229,0.55)', textAlign: 'center' }}>
              {/* The explicit space matters: JSX eats the trailing one before a
                  line break, which is why this read "yet?Come find us". */}
              Not a member yet?{' '}
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#dec181' }}>Come find us &rarr;</Text>
            </Text>
          </Pressable>
        </View>

        <View className="mt-8 px-2">
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, lineHeight: 18, color: 'rgba(246,244,229,0.34)', textAlign: 'center' }}>
            Created by{' '}
            <Text
              style={{ fontFamily: 'Lato_700Bold', color: 'rgba(246,244,229,0.55)' }}
              onPress={() => Linking.openURL('https://savedyouaseatstudios.com')}
            >
              Saved You a Seat Studios
            </Text>
            {' '}&middot; &copy; 2026. All rights reserved.
          </Text>
          <Text
            style={{ fontFamily: 'Lato_400Regular', fontSize: 11, lineHeight: 18, color: 'rgba(246,244,229,0.34)', textAlign: 'center', marginTop: 3 }}
            onPress={() => Linking.openURL('https://savedyouaseatstudios.com/#contact')}
          >
            Like what you see? Let&rsquo;s build your custom website or software.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
