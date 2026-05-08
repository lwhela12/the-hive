import { useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);

      if (Platform.OS === 'web') {
        // For web, use simple redirect
        // Include returnTo in the redirect URL so we can handle it after OAuth
        const redirectUrl = returnTo
          ? `${window.location.origin}${returnTo}`
          : window.location.origin;

        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
          },
        });
        if (error) throw error;
        // The page will redirect to Google, then back
      } else {
        // For native, use expo-linking to generate the correct URL
        const redirectTo = Linking.createURL('auth/callback');
        console.log('OAuth redirect URL:', redirectTo);

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });

        if (error) throw error;

        if (data.url) {
          const result = await WebBrowser.openAuthSessionAsync(
            data.url,
            redirectTo
          );

          console.log('Auth result:', result.type);

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

            router.replace('/');
          } else if (result.type === 'cancel') {
            console.log('User cancelled auth');
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
    <SafeAreaView className="flex-1 bg-cream">
      <View className="flex-1 justify-center px-6 py-10">
        <View className="w-full max-w-md mx-auto">
          <View className="items-center mb-10">
            <Image
              source={require('../../assets/HIVE Logo Transparent  BG.png')}
              style={{ width: 190, height: 190, marginBottom: 10 }}
              resizeMode="contain"
            />
            {/* H.I.V.E. */}
            <Text
              style={{ fontFamily: 'LibreBaskerville_700Bold' }}
              className="text-5xl text-charcoal text-center"
            >
              H.I.V.E.
            </Text>
            {/* "Architects of Collective" dark, "Abundance" gold — matching website layout */}
            <Text
              style={{ fontFamily: 'LibreBaskerville_700Bold', lineHeight: 38 }}
              className="text-3xl text-charcoal text-center mt-2"
            >
              {'Architects '}
              <Text style={{ fontFamily: 'LibreBaskerville_400Regular', fontStyle: 'italic' }}>of</Text>
              {' Collective'}
            </Text>
            <Text
              style={{ fontFamily: 'LibreBaskerville_700Bold', lineHeight: 38 }}
              className="text-3xl text-gold text-center"
            >
              Abundance
            </Text>
            {/* Tagline */}
            <Text
              style={{ fontFamily: 'Lato_700Bold', lineHeight: 22 }}
              className="text-sm text-charcoal text-center mt-3 px-2"
            >
              {'Where brilliant minds don\'t just network—'}
              <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic' }}>they </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', color: '#bd9348' }}>build.</Text>
            </Text>
          </View>

          <View className="mb-9">
            <Text
              style={{ fontFamily: 'Lato_400Regular' }}
              className="text-center text-charcoal/60 text-sm leading-6"
            >
              A private circle for high-definition wishing, thoughtful support,
              and matching what members need with what members know.
            </Text>
          </View>

          <Pressable
            onPress={handleGoogleSignIn}
            disabled={loading}
            className={`flex-row items-center justify-center bg-white border border-gold/30 rounded-xl py-4 px-6 shadow-sm ${
              loading ? 'opacity-50' : 'active:bg-gray-50'
            }`}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#bd9348" />
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

          <View className="mt-7 border-t border-gold/20 pt-5">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-center text-charcoal text-sm">
              Invitation only
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-center text-charcoal/60 text-sm mt-1 leading-5">
              Sign in with the email address that received your invite.
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
