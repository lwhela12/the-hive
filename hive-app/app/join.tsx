import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/hooks/useAuth';
import type { CommunityInvite, Community, Profile } from '../types';

type InviteWithDetails = CommunityInvite & {
  community: Community;
  inviter: Profile | null;
};

export default function JoinScreen() {
  const { session, profile, refreshProfile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteWithDetails | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistMessage, setWaitlistMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alreadyOnWaitlist, setAlreadyOnWaitlist] = useState(false);

  const userEmail = session?.user?.email || profile?.email;

  useEffect(() => {
    // If auth is still loading, wait
    if (authLoading) return;

    // If no session, redirect to login with return URL
    if (!session) {
      router.replace('/(auth)/login?returnTo=/join');
      return;
    }

    // If we have a user email, check for invite
    if (userEmail) {
      checkForInvite();
    }
  }, [session, authLoading, userEmail]);

  const checkForInvite = async () => {
    if (!userEmail || !profile) return;

    setLoading(true);
    try {
      // GENESIS CHECK: Is this the very first user?
      // Check if ANY community memberships exist in the system
      const { count: membershipCount } = await supabase
        .from('community_memberships')
        .select('*', { count: 'exact', head: true });

      if (membershipCount === 0) {
        // GENESIS USER - First ever user becomes admin
        console.log('Genesis user detected - bootstrapping community');
        await bootstrapGenesisCommunity();
        return;
      }

      // Not genesis - proceed with normal invite/waitlist flow
      const { data: invites, error } = await supabase
        .from('community_invites')
        .select('*, community:communities(*), inviter:profiles!community_invites_invited_by_fkey(*)')
        .eq('email', userEmail.toLowerCase())
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .limit(1);

      if (error) {
        console.log('Invite check error (may be RLS):', error.message);
        // RLS might block this - show waitlist option
        setShowWaitlist(true);
      } else if (invites && invites.length > 0) {
        setInvite(invites[0] as InviteWithDetails);
      } else {
        setShowWaitlist(true);
        // Check if already on waitlist
        const { data: waitlistEntry } = await supabase
          .from('waitlist')
          .select('id')
          .eq('email', userEmail.toLowerCase())
          .single();

        if (waitlistEntry) {
          setAlreadyOnWaitlist(true);
        }
      }
    } catch (err) {
      console.error('Error checking invite:', err);
      setShowWaitlist(true);
    } finally {
      setLoading(false);
    }
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
            name: 'The Hive',
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
          title: 'Welcome to the HIVE!',
          mode: 'default',
          is_active: true,
        } as any)
        .select()
        .single();

      if (welcomeConv) {
        const welcomeMessage = `Welcome to the HIVE, founding member! 🐝\n\nYou're the first one here, which means you're the admin. You can invite others from the Admin panel.\n\nFeel free to look around! You can see what's going on with the group on the HIVE page, add topics for discussion on the Board, chat with other members in the messages, or fill out your profile.\n\nWhen you're ready, I'd love to chat with you about your goals and the skills you bring to the group!`;

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
      router.replace('/(app)');
    } catch (err) {
      console.error('Error bootstrapping genesis community:', err);
      Alert.alert('Error', 'Failed to set up community. Please try again.');
      setShowWaitlist(true);
      setLoading(false);
    }
  };

  const handleAcceptInvite = async () => {
    console.log('Accept invite clicked', { invite, profile });

    if (!invite) {
      Alert.alert('Error', 'No invite found. Please refresh and try again.');
      return;
    }
    if (!profile) {
      Alert.alert('Error', 'Profile not loaded. Please refresh and try again.');
      return;
    }

    setSubmitting(true);
    try {
      console.log('Creating membership...', { community_id: invite.community_id, user_id: profile.id, role: invite.role });

      // Create membership
      const { error: membershipError } = await supabase
        .from('community_memberships')
        .insert({
          community_id: invite.community_id,
          user_id: profile.id,
          role: invite.role,
        });

      console.log('Membership result:', { error: membershipError });
      if (membershipError) throw membershipError;

      // Update profile with current community
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ current_community_id: invite.community_id })
        .eq('id', profile.id);

      if (profileError) throw profileError;

      // Mark invite as accepted
      await supabase
        .from('community_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id);

      // Create the welcome conversation with initial greeting
      const { data: welcomeConv } = await supabase
        .from('conversations')
        .insert({
          user_id: profile.id,
          community_id: invite.community_id,
          title: 'Welcome to the HIVE!',
          mode: 'default',
          is_active: true,
        } as any)
        .select()
        .single();

      // Add the welcome message to the conversation
      if (welcomeConv) {
        const welcomeMessage = `Welcome to the HIVE! Feel free to look around! You can see what's going on with the group on the HIVE page, add topics for discussion on the Board, chat with other members in the messages, or fill out your profile. When you're ready I'd love to chat with you about your goals and the skills you bring to the group!`;

        await supabase.from('chat_messages').insert({
          user_id: profile.id,
          community_id: invite.community_id,
          conversation_id: (welcomeConv as any).id,
          role: 'assistant',
          content: welcomeMessage,
        } as any);
      }

      // Refresh profile to get new community context
      await refreshProfile();

      // Navigate to main app
      router.replace('/(app)');
    } catch (err) {
      console.error('Error accepting invite:', err);
      Alert.alert('Error', 'Failed to accept invite. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeclineInvite = () => {
    Alert.alert(
      'Decline Invite',
      `Are you sure you want to decline the invitation to join ${invite?.community?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            // Just show waitlist instead
            setInvite(null);
            setShowWaitlist(true);
          },
        },
      ]
    );
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
    router.replace('/(auth)/login');
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
              {invite.community?.name || 'the HIVE'}
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
