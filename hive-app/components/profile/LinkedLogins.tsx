import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

import { ThinkingBee } from '../ui/ThinkingBee';
// Cross-platform alert (Alert.alert is a no-op on web)
const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
};

const providerLabel = (provider: string) =>
  provider === 'google' ? 'Google' : provider.charAt(0).toUpperCase() + provider.slice(1);

export function LinkedLogins() {
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const fetchIdentities = useCallback(async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (!error && data?.identities) {
      setIdentities(data.identities);
    }
    setLoading(false);
  }, []);

  // Refresh whenever the profile screen gains focus (also covers returning
  // from the web OAuth redirect, since the page remounts).
  useFocusEffect(
    useCallback(() => {
      fetchIdentities();
    }, [fetchIdentities])
  );

  // On web, the OAuth code in the URL is exchanged asynchronously after mount.
  // Refetch when the session/user updates so the new identity appears.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        fetchIdentities();
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchIdentities]);

  const handleLinkError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (/manual linking is disabled/i.test(message)) {
      showAlert(
        'Linking Unavailable',
        "Account linking isn't switched on yet — ask Nat to enable it."
      );
    } else {
      showAlert('Error', message || 'Failed to link account. Please try again.');
    }
  };

  const handleLink = async () => {
    try {
      setLinking(true);

      if (Platform.OS === 'web') {
        // For web, use simple redirect back to the profile screen
        const { error } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/profile`,
            queryParams: { prompt: 'select_account' },
          },
        });
        if (error) throw error;
        // The page will redirect to Google, then back to /profile
      } else {
        // For native, mirror the login flow: open an auth session in the
        // browser and exchange the returned code ourselves.
        const redirectTo = Linking.createURL('auth/callback');

        const { data, error } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams: { prompt: 'select_account' },
          },
        });

        if (error) throw error;

        if (data?.url) {
          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

          if (result.type === 'success') {
            const parsedUrl = Linking.parse(result.url);
            const code = parsedUrl.queryParams?.code as string | undefined;

            if (code) {
              const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
              if (exchangeError) throw exchangeError;
            } else {
              throw new Error('No authentication code received from Google');
            }

            await fetchIdentities();
          }
        }
      }
    } catch (error) {
      console.error('Link identity error:', error);
      handleLinkError(error);
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = (identity: UserIdentity) => {
    if (identities.length <= 1) return;

    const email = (identity.identity_data?.email as string | undefined) || 'this account';

    const doUnlink = async () => {
      try {
        setUnlinkingId(identity.identity_id);
        const { error } = await supabase.auth.unlinkIdentity(identity);
        if (error) throw error;
        await fetchIdentities();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to unlink account.';
        showAlert('Error', message);
      } finally {
        setUnlinkingId(null);
      }
    };

    const message = `Unlink ${email}? You won't be able to sign in with it anymore.`;

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) {
        doUnlink();
      }
      return;
    }

    Alert.alert('Unlink Account', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: doUnlink },
    ]);
  };

  return (
    <View className="mb-6">
      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
        Linked Logins
      </Text>
      <View className="bg-white rounded-xl shadow-sm p-4">
        {loading ? (
          <View className="py-2 items-center">
            <ThinkingBee />
          </View>
        ) : (
          <>
            {identities.map((identity, index) => {
              const email = (identity.identity_data?.email as string | undefined) || 'Unknown email';
              const canUnlink = identities.length > 1;
              const isUnlinking = unlinkingId === identity.identity_id;

              return (
                <View
                  key={identity.identity_id}
                  className={`flex-row items-center ${index > 0 ? 'mt-3 pt-3 border-t border-gold/20' : ''}`}
                >
                  <Ionicons name="logo-google" size={18} color="#bd9348" style={{ marginRight: 10 }} />
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal" numberOfLines={1}>
                      {email}
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mt-0.5">
                      {providerLabel(identity.provider)}
                    </Text>
                  </View>
                  {canUnlink && (
                    <Pressable
                      onPress={() => handleUnlink(identity)}
                      disabled={isUnlinking}
                      className={`px-3 py-1 rounded-full ${isUnlinking ? 'opacity-50' : 'active:opacity-60'}`}
                    >
                      {isUnlinking ? (
                        <ActivityIndicator size="small" color="#fffdf5" />
                      ) : (
                        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-red-600 text-sm">
                          Unlink
                        </Text>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })}

            {identities.length === 0 && (
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50">
                No linked logins found.
              </Text>
            )}

            <Pressable
              onPress={handleLink}
              disabled={linking}
              className={`flex-row items-center justify-center border border-gold/30 rounded-full py-2.5 px-4 mt-4 ${
                linking ? 'opacity-50' : 'active:bg-gray-50'
              }`}
            >
              {linking ? (
                <ActivityIndicator size="small" color="#fffdf5" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color="#bd9348" style={{ marginRight: 8 }} />
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-charcoal">
                    Link another Google account
                  </Text>
                </>
              )}
            </Pressable>

            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mt-2 text-center">
              Sign in with any linked account to reach this same profile.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
