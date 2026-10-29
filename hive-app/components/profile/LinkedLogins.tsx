import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, Platform, TextInput } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';

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
  provider === 'google' ? 'Google' : provider === 'email' ? 'Email code' : provider.charAt(0).toUpperCase() + provider.slice(1);

const EMAIL_AUTH_ENABLED = process.env.EXPO_PUBLIC_EMAIL_AUTH_ENABLED === 'true';

export function LinkedLogins() {
  const { profile, session } = useAuth();
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [emailLinking, setEmailLinking] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
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

  const handleEmailLink = async (action: 'start' | 'confirm') => {
    if (action === 'confirm' && !/^\d{8}$/.test(emailCode.trim())) {
      showAlert('Check the code', 'Enter the eight-digit code sent to your contact email.');
      return;
    }
    try {
      setEmailLinking(true);
      // The server reads the address on this member's profile. It verifies
      // that inbox and updates this same Auth user; no old Gmail inbox or
      // second member account is involved.
      const { error } = await supabase.functions.invoke('connect-contact-email', {
        body: { action, ...(action === 'confirm' ? { code: emailCode.trim() } : {}) },
      });
      if (error) throw error;
      if (action === 'start') {
        setConfirmationSent(true);
      } else {
        setConfirmationSent(false);
        setEmailCode('');
        await supabase.auth.refreshSession();
        await fetchIdentities();
        showAlert('Email connected', 'You can now sign in with a code sent to this address.');
      }
    } catch (error) {
      const response = (error as { context?: Response })?.context;
      const detail = await response?.json().catch(() => null) as { error?: string } | null | undefined;
      const message = detail?.error || (error instanceof Error ? error.message : 'Could not verify this email.');
      showAlert('Could not connect email', message);
    } finally {
      setEmailLinking(false);
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
                  <Ionicons name={identity.provider === 'google' ? 'logo-google' : 'mail-outline'} size={18} color="#bd9348" style={{ marginRight: 10 }} />
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

            {EMAIL_AUTH_ENABLED && profile?.email && !identities.some((identity) =>
              identity.provider === 'email' &&
              (identity.identity_data?.email as string | undefined)?.toLowerCase() === profile.email.toLowerCase()
            ) && (
              <View className="mt-4 pt-4 border-t border-gold/20">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-charcoal">
                  Sign in with your contact email
                </Text>
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/60 mt-1">
                  Send a code to {profile.email}. Your HIVE profile and history stay together.
                </Text>
                {confirmationSent ? (
                  <>
                    <TextInput
                      value={emailCode}
                      onChangeText={setEmailCode}
                      onSubmitEditing={() => void handleEmailLink('confirm')}
                      accessibilityLabel="Eight-digit contact email code"
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      maxLength={8}
                      editable={!emailLinking}
                      placeholder="Eight-digit code"
                      className="border border-gold/30 rounded-xl px-3 py-2.5 mt-3 text-charcoal"
                    />
                    <Text accessibilityRole="alert" style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/70 mt-2">
                      Check that inbox, then enter the code here. No access to your old email is needed.
                    </Text>
                  </>
                ) : null}
                <Pressable
                  onPress={() => void handleEmailLink(confirmationSent ? 'confirm' : 'start')}
                  disabled={emailLinking}
                  accessibilityRole="button"
                  className="border border-gold/30 rounded-full py-2.5 px-4 mt-3 items-center"
                  style={{ opacity: emailLinking ? 0.5 : 1 }}
                >
                  {emailLinking ? <ActivityIndicator size="small" color="#bd9348" /> : (
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-charcoal">
                      {confirmationSent ? 'Connect this email' : 'Send verification code'}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}

            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mt-2 text-center">
              {session?.user.email ? `Current sign-in email: ${session.user.email}. ` : ''}
              Linked sign-ins lead to this same profile.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
