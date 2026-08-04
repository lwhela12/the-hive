import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/hooks/useAuth';
import { hiveDisplayName } from '../lib/hiveBrand';
import type { CommunityInvite, Community, Profile } from '../types';

import { DictationRow } from '../components/ui/DictationRow';
import { confirmAction } from '../lib/showAlert';
type InviteWithDetails = CommunityInvite & {
  community: Community;
  inviter: Profile | null;
};

type InviteBlock = {
  title: string;
  message: string;
  detail?: string;
  action?: 'switch-account' | 'go-home';
};

const normalizeEmail = (email?: string | null) => (email ?? '').trim().toLowerCase();
// Named hives (OG HIVE, Tech HIVE) keep their names; the legacy spellings of the
// original one all collapse to "HIVE". Shared with the header and the picker.
const normalizeHiveBrandName = hiveDisplayName;

export default function JoinScreen() {
  const { session, profile, communityId, refreshProfile, loading: authLoading } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteWithDetails | null>(null);
  const [inviteBlock, setInviteBlock] = useState<InviteBlock | null>(null);
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistMessage, setWaitlistMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alreadyOnWaitlist, setAlreadyOnWaitlist] = useState(false);

  const inviteToken = typeof params.token === 'string' ? params.token.trim() : '';
  const hasInviteToken = inviteToken.length > 0;
  const userEmail = session?.user?.email || profile?.email;
  const normalizedUserEmail = normalizeEmail(userEmail);
  const joinReturnPath = hasInviteToken ? `/join?token=${encodeURIComponent(inviteToken)}` : '/join';

  useEffect(() => {
    // If auth is still loading, wait
    if (authLoading) return;

    // Token links are account-bound. Never let an existing session turn
    // an invite URL into the logged-in member's app session.
    if (hasInviteToken) {
      if (!session) {
        router.replace(`/(auth)/login?returnTo=${encodeURIComponent(joinReturnPath)}`);
        return;
      }

      if (userEmail) {
        checkForInvite();
      } else {
        setInviteBlock({
          title: 'Sign in with the invited account',
          message: 'We could not read an email address from this Google session, so HIVE did not open the invite.',
          detail: 'Sign out, then continue with the Google account that received the invite.',
          action: 'switch-account',
        });
        setLoading(false);
      }
      return;
    }

    // If community resolved (e.g., initializeUserData completed), go to app.
    if (session && communityId) {
      router.replace('/(app)/hive');
      return;
    }

    // If no session, redirect to login with return URL
    if (!session) {
      router.replace(`/(auth)/login?returnTo=${encodeURIComponent(joinReturnPath)}`);
      return;
    }

    // Non-token join still waits for the profile so genesis/waitlist setup has identity context.
    if (userEmail && profile) {
      checkForInvite();
    }
  }, [session, authLoading, userEmail, profile, communityId, hasInviteToken, inviteToken, joinReturnPath]);

  const checkForInvite = async () => {
    if (!normalizedUserEmail) {
      setInviteBlock({
        title: 'Sign in with the invited account',
        message: 'We could not read an email address from this Google session, so HIVE did not open the invite.',
        detail: 'Sign out, then continue with the Google account that received the invite.',
        action: 'switch-account',
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setInvite(null);
    setInviteBlock(null);
    try {
      if (hasInviteToken) {
        const { data: invites, error } = await supabase
          .from('community_invites')
          .select('*, community:communities(*), inviter:profiles!community_invites_invited_by_fkey(*)')
          .eq('token', inviteToken)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .limit(1);

        if (error) {
          throw error;
        }

        const tokenInvite = invites?.[0] as InviteWithDetails | undefined;

        if (!tokenInvite) {
          setInviteBlock({
            title: 'Invite needs the right account',
            message: 'This invite link is private to the Google account it was sent to. We did not open your current HIVE session.',
            detail: userEmail
              ? `You are signed in as ${userEmail}. Sign out, then open the invite with the email address that received it.`
              : 'Sign in with the email address that received the invite.',
            action: 'switch-account',
          });
          return;
        }

        const inviteEmail = normalizeEmail(tokenInvite.email);
        if (inviteEmail !== normalizedUserEmail) {
          setInviteBlock({
            title: 'Use the invited Google account',
            message: 'This invite is for a different email than the one currently signed in. HIVE will not open the current member profile from this link.',
            detail: `Current browser session: ${userEmail}. Invited account: ${tokenInvite.email}. Sign out, then continue with the invited account.`,
            action: 'switch-account',
          });
          return;
        }

        if (profile?.id) {
          const { data: existingMembership } = await supabase
            .from('community_memberships')
            .select('id, role')
            .eq('community_id', tokenInvite.community_id)
            .eq('user_id', profile.id)
            .maybeSingle();

          if (existingMembership) {
            setInviteBlock({
              title: 'This account is already in HIVE',
              message: `${profile.name || userEmail} is already a member of ${normalizeHiveBrandName(tokenInvite.community?.name)}. We kept the invite link from opening that existing profile.`,
              detail: 'To test a brand-new member onboarding flow, send an invite to a different email address and sign in with that Google account.',
              action: 'go-home',
            });
            return;
          }
        }

        setInvite(tokenInvite);
        return;
      }

      // GENESIS CHECK: Is this the very first user?
      // Use the RPC function which bypasses RLS
      const { data: isGenesis } = await supabase.rpc('is_genesis_state');

      if (isGenesis === true) {
        // GENESIS USER - First ever user becomes admin
        await bootstrapGenesisCommunity();
        return;
      }

      // Not genesis - proceed with normal invite/waitlist flow
      const { data: invites, error } = await supabase
        .from('community_invites')
        .select('*, community:communities(*), inviter:profiles!community_invites_invited_by_fkey(*)')
        .eq('email', normalizedUserEmail)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .limit(1);

      if (error) {
        // RLS might block this - show waitlist option
      } else if (invites && invites.length > 0) {
        setInvite(invites[0] as InviteWithDetails);
      } else {
        // Check if already on waitlist
        const { data: waitlistEntry } = await supabase
          .from('waitlist')
          .select('id')
          .eq('email', normalizedUserEmail)
          .single();

        if (waitlistEntry) {
          setAlreadyOnWaitlist(true);
        }
      }
    } catch (err) {
      console.error('Error checking invite:', err);
      if (hasInviteToken) {
        setInviteBlock({
          title: 'Invite check got stuck',
          message: 'HIVE could not finish verifying this invite link, so we did not open any member data.',
          detail: 'Refresh and try once more. If it happens again, ask Nat to resend the invite.',
          action: 'switch-account',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const ensureProfile = async () => {
    if (profile) return profile;
    if (!session?.user) return null;

    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (existingProfile) return existingProfile as Profile;
    if (fetchError) console.warn('Could not fetch profile before accepting invite:', fetchError.message);

    const { data: createdProfile, error: createError } = await supabase
      .from('profiles')
      .insert({
        id: session.user.id,
        name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'New Member',
        email: session.user.email || '',
        avatar_url: session.user.user_metadata?.avatar_url || null,
        role: 'member',
      })
      .select()
      .single();

    if (createError) throw createError;
    return createdProfile as Profile;
  };

  const bootstrapGenesisCommunity = async () => {
    if (!profile) return;

    try {
      // Check if default community exists, otherwise create one
      let communityId: string;

      const { data: existingCommunity } = await supabase
        .from('communities')
        .select('id')
        .eq('slug', 'default')
        .single();

      if (existingCommunity) {
        communityId = existingCommunity.id;
      } else {
        // Create the genesis community
        const { data: newCommunity, error: communityError } = await supabase
          .from('communities')
          .insert({
            name: 'HIVE',
            slug: 'default',
            created_by: profile.id,
          })
          .select()
          .single();

        if (communityError) throw communityError;
        communityId = (newCommunity as any).id;
      }

      // Add genesis user as admin
      const { error: membershipError } = await supabase
        .from('community_memberships')
        .insert({
          community_id: communityId,
          user_id: profile.id,
          role: 'admin',
        });

      if (membershipError) throw membershipError;

      // Update profile with current community
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ current_community_id: communityId })
        .eq('id', profile.id);

      if (profileError) throw profileError;

      // Create welcome conversation
      const { data: welcomeConv } = await supabase
        .from('conversations')
        .insert({
          user_id: profile.id,
          community_id: communityId,
          title: 'Welcome to HIVE!',
          mode: 'default',
          is_active: true,
        } as any)
        .select()
        .single();

      if (welcomeConv) {
        const welcomeMessage = `Welcome to HIVE, founding member! 🐝\n\nYou're the first one here, which means you're the admin. You can invite others from the Admin panel.\n\nFeel free to look around! You can see what's going on with the group on HIVE, add topics for discussion on the Board, chat with other members in the messages, or fill out your profile.\n\nWhen you're ready, I'd love to chat with you about your goals and the skills you bring to the group!`;

        await supabase.from('chat_messages').insert({
          user_id: profile.id,
          community_id: communityId,
          conversation_id: (welcomeConv as any).id,
          role: 'assistant',
          content: welcomeMessage,
        } as any);
      }

      // Refresh profile to get new community context
      await refreshProfile();

      // Navigate to main app
      router.replace('/(app)/hive');
    } catch (err) {
      console.error('Error bootstrapping genesis community:', err);
      Alert.alert('Error', 'Failed to set up community. Please try again.');
      setLoading(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!invite) {
      Alert.alert('Error', 'No invite found. Please refresh and try again.');
      return;
    }
    if (normalizeEmail(invite.email) !== normalizedUserEmail) {
      setInviteBlock({
        title: 'Use the invited Google account',
        message: 'This invite is for a different email than the one currently signed in. HIVE will not open the current member profile from this link.',
        detail: `Current browser session: ${userEmail}. Invited account: ${invite.email}. Sign out, then continue with the invited account.`,
        action: 'switch-account',
      });
      setInvite(null);
      return;
    }

    setSubmitting(true);
    try {
      const activeProfile = await ensureProfile();

      if (!activeProfile) {
        Alert.alert('Error', 'Profile not loaded. Please refresh and try again.');
        return;
      }

      const { data: existingMembership } = await supabase
        .from('community_memberships')
        .select('id')
        .eq('community_id', invite.community_id)
        .eq('user_id', activeProfile.id)
        .maybeSingle();

      if (existingMembership) {
        setInviteBlock({
          title: 'This account is already in HIVE',
          message: `${activeProfile.name || userEmail} is already a member of ${normalizeHiveBrandName(invite.community?.name)}. We kept the invite link from opening that existing profile.`,
          detail: 'To test a brand-new member onboarding flow, send an invite to a different email address and sign in with that Google account.',
          action: 'go-home',
        });
        setInvite(null);
        return;
      }

      // Create membership
      const { error: membershipError } = await supabase
        .from('community_memberships')
        .insert({
          community_id: invite.community_id,
          user_id: activeProfile.id,
          role: invite.role,
        });

      if (membershipError) throw membershipError;

      // Update profile with current community
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ current_community_id: invite.community_id })
        .eq('id', activeProfile.id);

      if (profileError) throw profileError;

      // Mark invite as accepted (try update first, then delete if that fails)
      const { error: inviteError } = await supabase
        .from('community_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id);

      if (inviteError) {
        console.error('Failed to mark invite as accepted:', inviteError);
        // Try deleting the invite instead
        await supabase
          .from('community_invites')
          .delete()
          .eq('id', invite.id);
      }

      // Create the welcome conversation with initial greeting
      const { data: welcomeConv } = await supabase
        .from('conversations')
        .insert({
          user_id: activeProfile.id,
          community_id: invite.community_id,
          title: 'Welcome to HIVE!',
          mode: 'default',
          is_active: true,
        } as any)
        .select()
        .single();

      // Add the welcome message to the conversation
      if (welcomeConv) {
        const welcomeMessage = `Welcome to HIVE! Feel free to look around! You can see what's going on with the group on HIVE, add topics for discussion on the Board, chat with other members in the messages, or fill out your profile. When you're ready I'd love to chat with you about your goals and the skills you bring to the group!`;

        await supabase.from('chat_messages').insert({
          user_id: activeProfile.id,
          community_id: invite.community_id,
          conversation_id: (welcomeConv as any).id,
          role: 'assistant',
          content: welcomeMessage,
        } as any);
      }

      // Refresh profile to get new community context
      await refreshProfile();

      // Navigate to main app
      router.replace('/(app)/hive');
    } catch (err) {
      console.error('Error accepting invite:', err);
      Alert.alert('Error', 'Failed to accept invite. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeclineInvite = () => {
    confirmAction({
      title: 'Decline invite',
      message: `Are you sure you want to decline the invitation to join ${normalizeHiveBrandName(invite?.community?.name)}?`,
      confirmLabel: 'Decline',
      destructive: true,
      onConfirm: () => {
        // Just show waitlist instead
        setInvite(null);
      },
    });
  };

  const handleJoinWaitlist = async () => {
    if (!userEmail) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('waitlist').insert({
        email: userEmail.toLowerCase(),
        name: waitlistName.trim() || profile?.name || null,
        message: waitlistMessage.trim() || null,
      });

      if (error) {
        if (error.code === '23505') {
          // Unique constraint - already on waitlist
          setAlreadyOnWaitlist(true);
        } else {
          throw error;
        }
      } else {
        setAlreadyOnWaitlist(true);
        Alert.alert('Success', "You've been added to the waitlist! We'll be in touch.");
      }
    } catch (err) {
      console.error('Error joining waitlist:', err);
      Alert.alert('Error', 'Failed to join waitlist. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace(`/(auth)/login?returnTo=${encodeURIComponent(joinReturnPath)}`);
  };

  const handleGoHome = () => {
    router.replace('/(app)/hive');
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-cream justify-center items-center">
        <ActivityIndicator size="large" color="#bd9348" />
        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal mt-4">
          Checking for invites...
        </Text>
      </SafeAreaView>
    );
  }

  // Show invite acceptance screen
  if (invite) {
    return (
      <SafeAreaView className="flex-1 bg-cream">
        <ScrollView className="flex-1" contentContainerClassName="p-6">
          <View className="items-center mb-8 mt-8">
            <Text className="text-6xl mb-4">🐝</Text>
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal text-center">
              You've Been Invited!
            </Text>
          </View>

          <View className="bg-white rounded-2xl p-6 shadow-sm mb-6">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-center mb-2">
              You're invited to join
            </Text>
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-gold text-center mb-4">
              {normalizeHiveBrandName(invite.community?.name)}
            </Text>

            {invite.inviter && (
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-center">
                Invited by {invite.inviter.name}
              </Text>
            )}

            <View className="mt-4 pt-4 border-t border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-center text-sm">
                You'll join as: <Text className="text-gold font-bold">{invite.role}</Text>
              </Text>
            </View>
          </View>

          <Pressable
            onPress={handleAcceptInvite}
            disabled={submitting}
            className={`py-4 rounded-xl items-center mb-3 ${submitting ? 'bg-gold/50' : 'bg-gold active:opacity-80'}`}
          >
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-lg">
              {submitting ? 'Joining...' : 'Accept & Join'}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleDeclineInvite}
            disabled={submitting}
            className="py-4 rounded-xl items-center"
          >
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
              Decline Invite
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (inviteBlock) {
    return (
      <SafeAreaView className="flex-1 bg-cream">
        <ScrollView className="flex-1" contentContainerClassName="p-6">
          <View className="items-center mb-8 mt-8">
            <Text className="text-6xl mb-4">🔐</Text>
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal text-center">
              {inviteBlock.title}
            </Text>
          </View>

          <View className="bg-white rounded-2xl p-6 shadow-sm mb-6">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal text-center leading-6">
              {inviteBlock.message}
            </Text>
            {inviteBlock.detail && (
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-center text-sm leading-5 mt-4">
                {inviteBlock.detail}
              </Text>
            )}
          </View>

          {inviteBlock.action === 'go-home' && (
            <Pressable
              onPress={handleGoHome}
              className="py-4 rounded-xl items-center mb-3 bg-gold active:opacity-80"
            >
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-lg">
                Go to My HIVE
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleSignOut}
            disabled={submitting}
            className={`${inviteBlock.action === 'go-home' ? 'py-3' : 'py-4 rounded-xl items-center mb-3 bg-gold active:opacity-80'}`}
          >
            <Text
              style={{ fontFamily: inviteBlock.action === 'go-home' ? 'Lato_400Regular' : 'Lato_700Bold' }}
              className={`${inviteBlock.action === 'go-home' ? 'text-center text-charcoal/60' : 'text-white text-lg'}`}
            >
              Sign Out and Switch Account
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Show waitlist screen
  return (
    <SafeAreaView className="flex-1 bg-cream">
      <ScrollView className="flex-1" contentContainerClassName="p-6">
        <View className="items-center mb-8 mt-8">
          <Text className="text-6xl mb-4">🐝</Text>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal text-center">
            Welcome to HIVE
          </Text>
        </View>

        <View className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal text-center leading-6">
            HIVE is an invite-only community for high-definition wishing.
          </Text>

          <View className="mt-4 pt-4 border-t border-cream">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-center mb-2">
              Already have an invite?
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-center text-sm">
              Ask your HIVE admin to send an invite to:{'\n'}
              <Text className="text-gold">{userEmail}</Text>
            </Text>
          </View>
        </View>

        {alreadyOnWaitlist ? (
          <View className="bg-gold/10 rounded-2xl p-6 mb-6">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-center mb-2">
              You're on the waitlist!
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-center text-sm">
              We'll notify you when a spot opens up or when you receive an invite.
            </Text>
          </View>
        ) : (
          <View className="bg-white rounded-2xl p-6 shadow-sm mb-6">
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-lg text-charcoal mb-4">
              Join the waitlist
            </Text>

            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 mb-4 text-sm">
              Interested in starting or joining a HIVE? Let us know and we'll be in touch.
            </Text>

            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2 text-sm">
                Your Name
              </Text>
              <TextInput
                value={waitlistName}
                onChangeText={setWaitlistName}
                placeholder={profile?.name || 'Enter your name'}
                placeholderTextColor="#9ca3af"
                className="bg-cream rounded-xl px-4 py-3 text-charcoal"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
            </View>

            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2 text-sm">
                Message (optional)
              </Text>
              <TextInput
                value={waitlistMessage}
                onChangeText={setWaitlistMessage}
                placeholder="Tell us a bit about yourself..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="bg-cream rounded-xl px-4 py-3 text-charcoal min-h-[80px]"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
              <DictationRow setValue={setWaitlistMessage} />
            </View>

            <Pressable
              onPress={handleJoinWaitlist}
              disabled={submitting}
              className={`py-4 rounded-xl items-center ${submitting ? 'bg-gold/50' : 'bg-gold active:opacity-80'}`}
            >
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white">
                {submitting ? 'Joining...' : 'Join Waitlist'}
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable onPress={handleSignOut} className="py-4 items-center">
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
            Sign out
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
