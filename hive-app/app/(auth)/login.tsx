import { useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);

      if (Platform.OS === 'web') {
        // For web, use simple redirect
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        // The page will redirect to Google, then back
      } else {
        // For native, use WebBrowser
        const redirectTo = Linking.createURL('auth/callback');

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

          if (result.type === 'success') {
            const url = result.url;
            // Extract tokens from URL fragment (after #)
            const hashParams = new URLSearchParams(url.split('#')[1]);
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');

            if (accessToken && refreshToken) {
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
            }
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
      <View className="flex-1 justify-center px-8">
        {/* Logo/Header */}
        <View className="items-center mb-12">
          <Image
            source={require('../../assets/The Hive Total transparent background (1).png')}
            style={{ width: 160, height: 160, marginBottom: 16 }}
            resizeMode="contain"
          />
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-4xl text-charcoal">The Hive</Text>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-lg text-charcoal mt-2 text-center">
            Where wishes become reality
          </Text>
        </View>

        {/* Description */}
        <View className="mb-12">
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-center text-charcoal leading-6">
            A community of 12 people practicing high-definition wishing —
            helping each other articulate what they actually want and
            matching wishes to skills.
          </Text>
        </View>

        {/* Sign in button */}
        <Pressable
          onPress={handleGoogleSignIn}
          disabled={loading}
          className={`flex-row items-center justify-center bg-white border border-gray-300 rounded-xl py-4 px-6 shadow-sm ${
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

        {/* Footer */}
        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-center text-charcoal/60 text-sm mt-8">
          This is a private community app.{'\n'}
          Only invited members can join.
        </Text>
      </View>
    </SafeAreaView>
  );
}
