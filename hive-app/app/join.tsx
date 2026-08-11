import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/hooks/useAuth';
import { hiveDisplayName } from '../lib/hiveBrand';
import type { CommunityInvite, Community, Profile } from '../types';

import { markJustJoinedHive } from './_layout';
import { ComposerBar } from '../components/ui/ComposerBar';
// The joining itself lives with the in-app invitation card, and both doors —
// this email-link screen and the card on HIVE-Wide — call the same function.
import { acceptCommunityInvite } from '../components/ui/PendingInviteDoor';
import { startHiveTour } from '../lib/hooks/useTourMarks';
import { confirmAction, showAlert } from '../lib/showAlert';
import { ThinkingBee } from '../components/ui/ThinkingBee';
type InviteWithDetails = CommunityInvite & {
  community: Community;
  inviter: Profile | null;
};

type InviteBlock = {
  title: string;
  message: string;
  detail?: string;
  /**
   * Which button actually leads somewhere from here.
   *
   * `switch-account` — coming back with the invited email fixes it.
   * `go-home` — this person already has a HIVE and can walk straight into it.
   * `retry` — the check itself fell over, so asking again is the fix.
   * `none` — only a fresh invite fixes it, so offering a big gold button that
   *   changes nothing would be a lie. A quiet sign-out is still there.
   */
  action?: 'switch-account' | 'go-home' | 'retry' | 'none';
  /** Sets the tone above the title. The lock is for the ones about accounts. */
  emoji?: string;
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
  // For the dead ends only a new invite can fix: somebody who is already in a
  // HIVE gets walked into it, and somebody who is not gets a plain sign-out
  // rather than a gold button that goes nowhere.
  const escapeAction: InviteBlock['action'] = communityId ? 'go-home' : 'none';

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
        // Look the invite up by its token alone.
        //
        // This query used to also demand `accepted_at is null` and an unexpired
        // date, which meant three completely different situations arrived here
        // as one empty result and got one answer: "sign out and open it with
        // the email that received it". For the member who had already joined —
        // the one clicking the link in their email because that IS the way back
        // into the app — that answer was impossible to act on. They signed out,
        // signed back in with exactly the right account, and read it again.
        //
        // Row-level security only ever hands you an invite addressed to your
        // own email address, so whatever comes back is genuinely yours to read.
        // Asking without the filters is what lets the three cases be told apart
        // and answered honestly.
        const { data: invites, error } = await supabase
          .from('community_invites')
          // Both joins only ever render a name on this screen ("Invited by
          // <name>", "join <name>"). Narrowed 2026-08-11 — was pulling every
          // profile column (bio, hometown, all three "3 most interesting
          // questions" answers) for a line of text that reads a name.
          .select('*, community:communities(id, name), inviter:profiles!community_invites_invited_by_fkey(id, name)')
          .eq('token', inviteToken)
          .limit(1);

        if (error) {
          throw error;
        }

        const tokenInvite = invites?.[0] as InviteWithDetails | undefined;

        // Nothing came back at all. Either no invite has ever carried this
        // token, or it belongs to a different email than the one signed in —
        // those look identical from here, so the message covers both.
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

        // Who to ask for a new one. The invite carries the inviter, and the
        // HIVE's own name only reads once you are a member of it, so a used or
        // expired invite says "whoever invited you" rather than naming a place
        // it cannot see.
        const inviterName = tokenInvite.inviter?.name?.trim();
        const askWho = inviterName || 'whoever invited you';

        // The signed-in account's id, whether or not the profile row has
        // arrived yet — they are the same id, and waiting for the profile would
        // show a returning member the wrong answer for a second first.
        const memberId = profile?.id || session?.user?.id;

        if (memberId) {
          const { data: existingMembership } = await supabase
            .from('community_memberships')
            .select('id, role')
            .eq('community_id', tokenInvite.community_id)
            .eq('user_id', memberId)
            .maybeSingle();

          // Already a member. This is the case the old code hid behind an
          // impossible instruction, and it is the most common one of the three:
          // the email link is how people come back.
          if (existingMembership) {
            setInviteBlock({
              title: "You're already in",
              message: `${profile?.name || userEmail} is a member of ${normalizeHiveBrandName(tokenInvite.community?.name)}, so this link has done its job.`,
              detail: 'Your HIVE is one tap away.',
              action: 'go-home',
              emoji: '🐝',
            });
            return;
          }
        }

        // Accepted once, with no membership to show for it. Rare, and the
        // database will refuse a second join, so the only way forward is a
        // fresh invite.
        if (tokenInvite.accepted_at) {
          setInviteBlock({
            title: 'This invite has already been used',
            message: 'Each invite link opens a single time, and this one has been used.',
            detail: `Ask ${askWho} to send a fresh invite to ${userEmail}.`,
            action: escapeAction,
            emoji: '⏳',
          });
          return;
        }

        // Past its date. Invites last seven days; a new one takes a moment.
        const expiresAt = tokenInvite.expires_at ? new Date(tokenInvite.expires_at) : null;
        if (expiresAt && expiresAt.getTime() <= Date.now()) {
          setInviteBlock({
            title: 'This invite has expired',
            message: 'Invite links last seven days, and this one is past that. A new one takes a moment to send.',
            detail: `Ask ${askWho} to send a fresh invite to ${userEmail}.`,
            action: escapeAction,
            emoji: '⏳',
          });
          return;
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
        // Same narrowed join as the token lookup above — only a name is
        // ever rendered from either side of it.
        .select('*, community:communities(id, name), inviter:profiles!community_invites_invited_by_fkey(id, name)')
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
        // Signing out was the offer here, and it fixes nothing — the check
        // fell over on the way to the database. Asking again is the fix.
        setInviteBlock({
          title: 'Invite check got stuck',
          message: 'HIVE could not finish checking this invite link, so it stopped rather than guessing.',
          detail: 'Give it another go. If it sticks again, ask Nat to resend the invite.',
          action: 'retry',
          emoji: '🐝',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // `ensureProfile` moved into `components/ui/PendingInviteDoor.tsx` with the
  // rest of the acceptance on 2026-08-11 — the in-app invitation card runs the
  // same join as this screen, out of one shared function.

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

      // The first person in a brand-new install is arriving for the first time
      // too, so they walk straight into the HIVE they have just built rather
      // than looking at a photo of Earth (Nat 2026-08-06).
      markJustJoinedHive(communityId);

      // Refresh profile to get new community context
      await refreshProfile();

      // Navigate to main app
      router.replace('/(app)/hive');
    } catch (err) {
      console.error('Error bootstrapping genesis community:', err);
      showAlert('Could not set up your HIVE', 'Something went wrong building the first HIVE. Please try again.');
      setLoading(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!invite) {
      showAlert('No invite found', 'Refresh the page and try again.');
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
      // The join itself — profile, membership, invite stamp, welcome
      // conversation — is `acceptCommunityInvite`, shared with the in-app
      // invitation card. This screen keeps its own words for each outcome.
      const result = await acceptCommunityInvite({ invite, profile, session });

      if (result.outcome === 'no-profile') {
        showAlert('Your profile has not loaded yet', 'Refresh the page and try again.');
        return;
      }

      if (result.outcome === 'already-member') {
        setInviteBlock({
          title: "You're already in",
          message: `${profile?.name || userEmail} is a member of ${normalizeHiveBrandName(invite.community?.name)}, so this link has done its job.`,
          detail: 'Your HIVE is one tap away.',
          action: 'go-home',
          emoji: '🐝',
        });
        setInvite(null);
        return;
      }

      if (result.outcome === 'closed') {
        // The database said this invite no longer opens the door — used,
        // expired, or withdrawn while this page sat open. Say that in words
        // somebody can act on rather than the generic "try again", because
        // trying again gets the same refusal every time.
        const inviterName = invite.inviter?.name?.trim();
        setInviteBlock({
          title: 'This invite has closed',
          message: 'HIVE checked the invite as you joined, and it has already been used or has run out. Each link opens once, within seven days.',
          detail: `Ask ${inviterName || 'whoever invited you'} to send a fresh invite to ${userEmail}.`,
          action: escapeAction,
          emoji: '⏳',
        });
        setInvite(null);
        return;
      }

      // Say out loud that this person has just joined, so the load below lands
      // them in the HIVE they came here for. An invite email is somebody's very
      // first sight of HIVE, and their own HIVE is what they were invited to —
      // HIVE-Wide is where every visit after this one starts (Nat 2026-08-06).
      // The rule lives in app/_layout.tsx next to markJustJoinedHive.
      markJustJoinedHive(invite.community_id);

      // Their first minutes inside get the welcome tour — the invite email's
      // "Come on in" leads straight to it. A genuinely fresh join is the ONLY
      // moment the tour ever starts (see lib/hooks/useTourMarks.ts).
      startHiveTour(invite.community_id);

      // Refresh profile to get new community context
      await refreshProfile();

      // Navigate to main app. `/(app)/hive` is the HIVE they just joined, and
      // it stays their own HIVE now rather than bouncing on to HIVE-Wide.
      router.replace('/(app)/hive');
    } catch (err) {
      console.error('Error accepting invite:', err);
      showAlert('Could not join', 'That invite did not go through. Please try again.');
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
        showAlert("You're on the waitlist", "We'll be in touch.");
      }
    } catch (err) {
      console.error('Error joining waitlist:', err);
      showAlert('Could not add you', 'The waitlist did not save your details. Please try again.');
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
        <ThinkingBee />
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
            <Text className="text-6xl mb-4">{inviteBlock.emoji || '🔐'}</Text>
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

          {/* The gold button is only ever the thing that actually fixes this
              particular dead end. Where nothing on this screen can fix it, the
              quiet sign-out is the whole offer — a big button that changes
              nothing is what sent members round the same loop for weeks. */}
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

          {inviteBlock.action === 'retry' && (
            <Pressable
              onPress={() => { void checkForInvite(); }}
              className="py-4 rounded-xl items-center mb-3 bg-gold active:opacity-80"
            >
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-lg">
                Try again
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleSignOut}
            disabled={submitting}
            className={`${inviteBlock.action === 'switch-account' ? 'py-4 rounded-xl items-center mb-3 bg-gold active:opacity-80' : 'py-3'}`}
          >
            <Text
              style={{ fontFamily: inviteBlock.action === 'switch-account' ? 'Lato_700Bold' : 'Lato_400Regular' }}
              className={`${inviteBlock.action === 'switch-account' ? 'text-white text-lg' : 'text-center text-charcoal/60'}`}
            >
              {inviteBlock.action === 'switch-account' ? 'Sign Out and Switch Account' : 'Sign out'}
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

            {/* Your own name is words, so it gets the microphone too — this is
                somebody's very first screen in HIVE and they may be on a phone
                they are holding one-handed. */}
            <ComposerBar
              variant="form"
              tone="light"
              containerClassName="mb-4"
              label="Your Name"
              value={waitlistName}
              onChangeText={setWaitlistName}
              placeholder={profile?.name || 'Enter your name'}
              multiline={false}
              maxLength={120}
              onSubmit={handleJoinWaitlist}
              submitting={submitting}
            />

            <ComposerBar
              variant="form"
              tone="light"
              containerClassName="mb-4"
              label="Message (optional)"
              value={waitlistMessage}
              onChangeText={setWaitlistMessage}
              placeholder="Tell us a bit about yourself..."
              minHeight={80}
              // Deliberately uncapped, as it always has been. Somebody
              // introducing themselves should not be cut off mid-sentence.
              // Enter makes a new paragraph here. Somebody introducing
              // themselves writes more than one line, and sending the form out
              // from under them mid-sentence would be the wrong answer.
              submitOnEnterKey={false}
              submitting={submitting}
            />

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
